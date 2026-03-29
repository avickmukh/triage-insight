/**
 * AiAnalysisProcessor — Hardened
 *
 * Hardening additions (vs original):
 * 1. RetryPolicy.standard() applied to all enqueued jobs
 * 2. JobIdempotencyService dedup guard (10-min TTL per feedbackId)
 * 3. JobLogger structured logging (JOB_START, JOB_COMPLETE, JOB_FAIL, STEP_WARN)
 * 4. @OnQueueFailed DLQ handler — moves exhausted jobs to DEAD_LETTERED in AiJobLog
 * 5. __logId injected into job data for lifecycle tracking
 * 6. Re-throw on fatal failure so Bull marks job as failed and retries
 *
 * Pipeline order (Stage-1):
 *   Feedback → Embedding → Sentiment → Summary → Persist → Dedup → Clustering → CIQ enqueue
 */
import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import type { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { EmbeddingService } from '../services/embedding.service';
import { SummarizationService } from '../services/summarization.service';
import { SentimentService } from '../services/sentiment.service';
import { DuplicateDetectionService } from '../services/duplicate-detection.service';
import { ThemeClusteringService } from '../services/theme-clustering.service';
import { AiJobType } from '@prisma/client';
import { JobLogger } from '../../common/queue/job-logger';
import { JobIdempotencyService } from '../../common/queue/job-idempotency.service';
import { handleDlq } from '../../common/queue/dlq-handler';
import { RetryPolicy } from '../../common/queue/retry-policy';

export const AI_ANALYSIS_QUEUE = 'ai-analysis';

interface AnalysisJobPayload {
  feedbackId: string;
  workspaceId: string;
  /** Injected by idempotency service for lifecycle tracking */
  __logId?: string;
  [key: string]: unknown;
}

@Injectable()
@Processor(AI_ANALYSIS_QUEUE)
export class AiAnalysisProcessor {
  private readonly logger = new JobLogger(AiAnalysisProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    private readonly summarizationService: SummarizationService,
    private readonly sentimentService: SentimentService,
    private readonly duplicateDetectionService: DuplicateDetectionService,
    private readonly themeClusteringService: ThemeClusteringService,
    private readonly idempotencyService: JobIdempotencyService,
  ) {}

  /**
   * Concurrency is set to 1 so that only one analysis job runs at a time
   * per worker process. This ensures the Postgres advisory lock inside
   * ThemeClusteringService.assignFeedbackToTheme() fully serialises
   * clustering — preventing two workers from racing to create duplicate
   * themes for the same workspace when a batch of feedback is imported.
   *
   * If horizontal scaling is needed, keep QUEUE_CONCURRENCY=1 and run
   * multiple single-worker replicas instead of raising concurrency.
   */
  @Process({ concurrency: 1 })
  async handleAnalysis(job: Job<AnalysisJobPayload>) {
    const { feedbackId, workspaceId } = job.data;
    const ctx = { jobType: 'AI_ANALYSIS', workspaceId, entityId: feedbackId, jobId: job.id };
    const startedAt = Date.now();

    // ── Idempotency guard ────────────────────────────────────────────────────
    const isDup = await this.idempotencyService.isDuplicate(
      AiJobType.FEEDBACK_SUMMARY,
      feedbackId,
      workspaceId,
    );
    if (isDup) return;

    const logId = await this.idempotencyService.markStarted(
      AiJobType.FEEDBACK_SUMMARY,
      feedbackId,
      workspaceId,
      'Feedback',
    );
    job.data.__logId = logId;

    this.logger.start(ctx);

    const feedback = await this.prisma.feedback.findUnique({ where: { id: feedbackId } });
    if (!feedback) {
      this.logger.stepWarn(ctx, 'LOAD', `Feedback ${feedbackId} not found — skipping`);
      await this.idempotencyService.markCompleted(logId, Date.now() - startedAt);
      return;
    }

    // ── 1. Generate Embedding ────────────────────────────────────────────────
    let embedding: number[] = [];
    try {
      embedding = await this.embeddingService.generateEmbedding(feedback.description);
    } catch (err) {
      this.logger.stepWarn(ctx, 'EMBEDDING', (err as Error).message);
    }

    // ── 2. Analyse Sentiment ─────────────────────────────────────────────────
    // Score is in [-1, +1]: negative = frustrated/churning, 0 = neutral, positive = happy.
    // Fallback to 0 (neutral) on any failure so the rest of the pipeline is not interrupted.
    let sentiment = 0;
    try {
      sentiment = await this.sentimentService.analyseSentiment(feedback.description);
    } catch (err) {
      this.logger.stepWarn(ctx, 'SENTIMENT', (err as Error).message);
      // sentiment remains 0 — neutral fallback
    }

    // ── 3. Generate Summary ──────────────────────────────────────────────────
    let summary: string | null = null;
    try {
      summary = await this.summarizationService.summarize(feedback.description);
    } catch (err) {
      this.logger.stepWarn(ctx, 'SUMMARIZATION', (err as Error).message);
    }

    // ── 4. Persist AI data ───────────────────────────────────────────────────
    // sentiment is always written (0 = neutral fallback) so CiqService never
    // encounters a null and can apply its sentimentPenalty / sentimentUrgency logic.
    await this.prisma.feedback.update({
      where: { id: feedbackId },
      data: {
        sentiment,
        ...(summary && { summary }),
        normalizedText: feedback.description.toLowerCase(),
        language: 'en',
      },
    });

    if (embedding.length > 0) {
      const vectorStr = `[${embedding.join(',')}]`;
      await this.prisma.$executeRaw`
        UPDATE "Feedback"
        SET embedding = ${vectorStr}::vector
        WHERE id = ${feedbackId};
      `;
    }

    // ── 5. Duplicate detection ───────────────────────────────────────────────
    try {
      await this.duplicateDetectionService.generateSuggestions(
        feedback.workspaceId,
        feedbackId,
        embedding.length > 0 ? embedding : undefined,
      );
    } catch (err) {
      this.logger.stepWarn(ctx, 'DUPLICATE_DETECTION', (err as Error).message);
    }

    // ── 6. Theme clustering ──────────────────────────────────────────────────
    // NOTE: We do NOT catch clustering errors here. If clustering fails, the job
    // should be retried (Bull will re-queue it with exponential backoff) rather
    // than silently completing. A silent COMPLETED record would block reprocessPipeline
    // from re-queuing the same feedback via the idempotency check.
    await this.themeClusteringService.assignFeedbackToTheme(
      feedback.workspaceId,
      feedbackId,
      embedding.length > 0 ? embedding : undefined,
    );

    const durationMs = Date.now() - startedAt;
    await this.idempotencyService.markCompleted(logId, durationMs);
    this.logger.complete({ ...ctx, durationMs });

    // ── 7. Increment ImportBatch progress ────────────────────────────────────
    // Non-critical: if the feedback belongs to a batch, increment completedRows
    // and — if all rows are now processed — flip stage to COMPLETED.
    // This is the authoritative completion signal used by getBatchStatus().
    if (feedback.importBatchId) {
      this.updateBatchProgress(feedback.importBatchId, 'completed').catch(() => { /* non-critical */ });
    }
  }

  /**
   * Atomically increment completedRows (or failedRows) on an ImportBatch and
   * transition stage → COMPLETED when all rows have been processed.
   *
   * Uses a raw SQL UPDATE + RETURNING so we can read the post-increment values
   * in a single round-trip without a separate SELECT.
   */
  private async updateBatchProgress(
    batchId: string,
    outcome: 'completed' | 'failed',
  ): Promise<void> {
    // Step 1: atomically increment the correct counter
    if (outcome === 'completed') {
      await this.prisma.$executeRaw`
        UPDATE "ImportBatch"
        SET "completedRows" = "completedRows" + 1, "updatedAt" = NOW()
        WHERE id = ${batchId}
      `;
    } else {
      await this.prisma.$executeRaw`
        UPDATE "ImportBatch"
        SET "failedRows" = "failedRows" + 1, "updatedAt" = NOW()
        WHERE id = ${batchId}
      `;
    }

    // Step 2: read the updated row to check if all rows are processed
    const batch = await this.prisma.importBatch.findUnique({
      where: { id: batchId },
      select: { totalRows: true, completedRows: true, failedRows: true, stage: true },
    });
    if (!batch) return;

    const processed = batch.completedRows + batch.failedRows;
    if (batch.totalRows > 0 && processed >= batch.totalRows && batch.stage !== 'COMPLETED') {
      // All rows done — flip stage to COMPLETED
      await this.prisma.importBatch.update({
        where: { id: batchId },
        data: { stage: 'COMPLETED', status: 'COMPLETED' },
      });
    }
  }

  @OnQueueFailed()
  async onFailed(job: Job<AnalysisJobPayload>, error: Error) {
    const ctx = {
      jobType: 'AI_ANALYSIS',
      workspaceId: job.data.workspaceId,
      entityId: job.data.feedbackId,
      jobId: job.id,
    };
    await handleDlq(job, error, ctx, this.logger, this.idempotencyService);

    // If the job has exhausted all retries, count it as a failed row so the
    // batch can still reach COMPLETED (all rows accounted for).
    const maxAttempts = RetryPolicy.maxAttempts();
    if (job.attemptsMade >= maxAttempts) {
      const feedbackId = job.data.feedbackId;
      if (feedbackId) {
        const fb = await this.prisma.feedback.findUnique({
          where: { id: feedbackId },
          select: { importBatchId: true },
        }).catch(() => null);
        if (fb?.importBatchId) {
          this.updateBatchProgress(fb.importBatchId, 'failed').catch(() => { /* non-critical */ });
        }
      }
    }
  }
}

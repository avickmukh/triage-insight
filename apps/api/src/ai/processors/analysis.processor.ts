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
   * Concurrency controls how many analysis jobs this worker processes in
   * parallel. The value is read from the QUEUE_CONCURRENCY environment
   * variable (default: 2, max: 20 — see RetryPolicy.concurrency()).
   *
   * ── Why concurrency > 1 is safe ─────────────────────────────────────────
   * Theme-duplication races are prevented by a Postgres advisory lock inside
   * ThemeClusteringService.assignFeedbackToTheme(). The lock is scoped per
   * workspace (pg_advisory_xact_lock on a hash of workspaceId), so:
   *   • Jobs from the SAME workspace are serialised by the DB lock.
   *   • Jobs from DIFFERENT workspaces run fully in parallel.
   *
   * Setting concurrency: 1 was overly conservative — it blocked all jobs
   * globally, making batch uploads process one item at a time even when
   * the items belonged to different workspaces (or were the only workspace).
   * This caused the "pipeline only runs one at a time" regression.
   *
   * ── Tuning ──────────────────────────────────────────────────────────────
   * Raise QUEUE_CONCURRENCY in .env to increase throughput. Keep it ≤ the
   * Postgres max_connections / number of worker replicas to avoid pool
   * exhaustion. The default of 2 is a safe starting point for most setups.
   */
  @Process({ concurrency: RetryPolicy.concurrency() })
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

    // ── 0. Load feedback ─────────────────────────────────────────────────────
    const t0 = Date.now();
    const feedback = await this.prisma.feedback.findUnique({ where: { id: feedbackId } });
    if (!feedback) {
      this.logger.stepWarn(ctx, 'LOAD', `Feedback ${feedbackId} not found — skipping`);
      await this.idempotencyService.markCompleted(logId, Date.now() - startedAt);
      return;
    }
    this.logger.debug(ctx, `[STEP] LOAD ${Date.now() - t0}ms | feedback=${feedbackId}`);

    // ── 1. Generate Embedding ────────────────────────────────────────────────
    // Use composite text (title + description) so the embedding captures both
    // the subject and the detail. Using description alone caused false positives
    // in duplicate detection when titles were completely different topics.
    const t1 = Date.now();
    let embedding: number[] = [];
    try {
      const compositeText = `Title: ${feedback.title}\nDescription: ${feedback.description}`;
      embedding = await this.embeddingService.generateEmbedding(compositeText);
    } catch (err) {
      this.logger.stepWarn(ctx, 'EMBEDDING', (err as Error).message);
    }
    this.logger.debug(ctx, `[STEP] EMBEDDING ${Date.now() - t1}ms | dims=${embedding.length}`);

    // ── 2. Analyse Sentiment ─────────────────────────────────────────────────
    // Score is in [-1, +1]: negative = frustrated/churning, 0 = neutral, positive = happy.
    // Fallback to 0 (neutral) on any failure so the rest of the pipeline is not interrupted.
    const t2 = Date.now();
    let sentiment = 0;
    try {
      sentiment = await this.sentimentService.analyseSentiment(feedback.description);
    } catch (err) {
      this.logger.stepWarn(ctx, 'SENTIMENT', (err as Error).message);
      // sentiment remains 0 — neutral fallback
    }
    this.logger.debug(ctx, `[STEP] SENTIMENT ${Date.now() - t2}ms | score=${sentiment}`);

    // ── 3. Generate Summary ──────────────────────────────────────────────────
    const t3 = Date.now();
    let summary: string | null = null;
    try {
      summary = await this.summarizationService.summarize(feedback.description);
    } catch (err) {
      this.logger.stepWarn(ctx, 'SUMMARIZATION', (err as Error).message);
    }
    this.logger.debug(ctx, `[STEP] SUMMARIZATION ${Date.now() - t3}ms | hasSummary=${!!summary}`);

    // ── 4. Persist AI data ───────────────────────────────────────────────────
    // sentiment is always written (0 = neutral fallback) so CiqService never
    // encounters a null and can apply its sentimentPenalty / sentimentUrgency logic.
    const t4 = Date.now();
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
    this.logger.debug(ctx, `[STEP] PERSIST ${Date.now() - t4}ms`);

    // ── 5. Duplicate detection ───────────────────────────────────────────────
    const t5 = Date.now();
    try {
      await this.duplicateDetectionService.generateSuggestions(
        feedback.workspaceId,
        feedbackId,
        embedding.length > 0 ? embedding : undefined,
      );
    } catch (err) {
      this.logger.stepWarn(ctx, 'DUPLICATE_DETECTION', (err as Error).message);
    }
    this.logger.debug(ctx, `[STEP] DEDUP ${Date.now() - t5}ms`);

    // ── 6. Theme clustering ──────────────────────────────────────────────────
    // NOTE: We do NOT catch clustering errors here. If clustering fails, the job
    // should be retried (Bull will re-queue it with exponential backoff) rather
    // than silently completing. A silent COMPLETED record would block reprocessPipeline
    // from re-queuing the same feedback via the idempotency check.
    const t6 = Date.now();
    await this.themeClusteringService.assignFeedbackToTheme(
      feedback.workspaceId,
      feedbackId,
      embedding.length > 0 ? embedding : undefined,
    );
    this.logger.debug(ctx, `[STEP] CLUSTERING ${Date.now() - t6}ms`);

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

      // ── Batch finalization ───────────────────────────────────────────────
      // Now that every item in the batch has been embedded and assigned to a
      // provisional cluster, run the post-batch finalization pass:
      //   1. Borderline reassignment (low-confidence links re-evaluated)
      //   2. Batch merge pass (aggressive threshold collapses near-duplicate clusters)
      //   3. Weak cluster suppression (single-item noise clusters archived)
      //   4. Centroid refresh, promote PROVISIONAL → STABLE, confidence refresh
      //
      // This is intentionally fire-and-forget (non-fatal). The batch is already
      // COMPLETED from the user's perspective; finalization is a quality pass.
      const batchRow = await this.prisma.importBatch.findUnique({
        where: { id: batchId },
        select: { workspaceId: true },
      });
      if (batchRow?.workspaceId) {
        this.themeClusteringService
          .runBatchFinalization(batchRow.workspaceId, batchId)
          .catch((err: Error) =>
            this.logger.stepWarn(
              {
                jobType: 'BATCH_FINALIZE',
                workspaceId: batchRow.workspaceId,
                entityId: batchId,
                jobId: batchId,
              },
              'BATCH_FINALIZE',
              `Non-fatal finalization error: ${err.message}`,
            ),
          );
      }
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

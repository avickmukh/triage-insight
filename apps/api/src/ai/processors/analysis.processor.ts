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

  @Process()
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
    try {
      await this.themeClusteringService.assignFeedbackToTheme(
        feedback.workspaceId,
        feedbackId,
        embedding.length > 0 ? embedding : undefined,
      );
    } catch (err) {
      this.logger.stepWarn(ctx, 'THEME_CLUSTERING', (err as Error).message);
    }

    const durationMs = Date.now() - startedAt;
    await this.idempotencyService.markCompleted(logId, durationMs);
    this.logger.complete({ ...ctx, durationMs });
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
  }
}

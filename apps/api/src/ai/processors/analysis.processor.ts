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
import { ProblemTypeClassifierService } from '../services/problem-type-classifier.service';
import { NegativeClauseExtractorService } from '../services/negative-clause-extractor.service';

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
    private readonly problemTypeClassifier: ProblemTypeClassifierService,
    private readonly negativeClauseExtractor: NegativeClauseExtractorService,
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
    const ctx = {
      jobType: 'AI_ANALYSIS',
      workspaceId,
      entityId: feedbackId,
      jobId: job.id,
    };
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
    const feedback = await this.prisma.feedback.findUnique({
      where: { id: feedbackId },
    });
    if (!feedback) {
      this.logger.stepWarn(
        ctx,
        'LOAD',
        `Feedback ${feedbackId} not found — skipping`,
      );
      await this.idempotencyService.markCompleted(
        logId,
        Date.now() - startedAt,
      );
      return;
    }
    this.logger.debug(
      ctx,
      `[STEP] LOAD ${Date.now() - t0}ms | feedback=${feedbackId}`,
    );

    // ── 1a. Extract problem clause ───────────────────────────────────────────
    // Mixed-sentiment feedback ("UI is great BUT payment failed") produces embeddings
    // that cluster around the domain centroid, not the specific problem.
    // We extract ONLY the negative/problem portion for clustering.
    // The full text is preserved for display, CIQ, and narration.
    // Fail-open: if extraction fails, falls back to full text.
    const t1a = Date.now();
    let problemClause = `${feedback.title} ${feedback.description ?? ''}`.trim();
    let hasMixedSentiment = false;
    let problemClauseConfidence = 0.5;
    try {
      const existingMeta = (feedback.metadata ?? {}) as Record<string, unknown>;
      const cached = existingMeta.problemClause as string | undefined;
      if (cached) {
        problemClause = cached;
        hasMixedSentiment = (existingMeta.hasMixedSentiment as boolean) ?? false;
        problemClauseConfidence = (existingMeta.problemClauseConfidence as number) ?? 0.5;
        this.logger.debug(ctx, `[STEP] PROBLEM_CLAUSE (cached) ${Date.now() - t1a}ms | mixed=${hasMixedSentiment}`);
      } else {
        const result = await this.negativeClauseExtractor.extract(
          feedback.title,
          feedback.description ?? '',
        );
        problemClause = result.problemClause;
        hasMixedSentiment = result.hasMixedSentiment;
        problemClauseConfidence = result.confidence;
        // Cache in metadata to avoid re-extraction on retry
        await this.prisma.feedback.update({
          where: { id: feedbackId },
          data: {
            metadata: {
              ...existingMeta,
              problemClause: result.problemClause,
              hasMixedSentiment: result.hasMixedSentiment,
              problemClauseConfidence: result.confidence,
            },
          },
        });
        this.logger.debug(
          ctx,
          `[STEP] PROBLEM_CLAUSE ${Date.now() - t1a}ms | mixed=${hasMixedSentiment} confidence=${result.confidence.toFixed(2)}`,
        );
      }
    } catch (err) {
      this.logger.stepWarn(ctx, 'PROBLEM_CLAUSE', (err as Error).message);
      // problemClause remains full text — fail-open
    }

    // ── 1b. Generate Embedding ───────────────────────────────────────────────
    // CLUSTERING embedding: uses the problem clause (negative portion only)
    //   → produces tight, distinct clusters per problem type
    // DISPLAY/DUPLICATE embedding: uses full composite text
    //   → preserves full semantic context for duplicate detection
    const t1 = Date.now();
    let embedding: number[] = [];
    let fullTextEmbedding: number[] = [];
    try {
      // Clustering embedding: problem clause only (strips positive prefix noise)
      const clusteringText = `${feedback.title ? `Title: ${feedback.title}\n` : ''}Problem: ${problemClause}`;
      embedding = await this.embeddingService.generateEmbedding(clusteringText);

      // Full-text embedding for duplicate detection (only if different from clustering text)
      if (hasMixedSentiment) {
        const fullText = `Title: ${feedback.title}\nDescription: ${feedback.description}`;
        fullTextEmbedding = await this.embeddingService.generateEmbedding(fullText);
      } else {
        fullTextEmbedding = embedding;
      }
    } catch (err) {
      this.logger.stepWarn(ctx, 'EMBEDDING', (err as Error).message);
    }
    this.logger.debug(
      ctx,
      `[STEP] EMBEDDING ${Date.now() - t1}ms | dims=${embedding.length} mixed=${hasMixedSentiment}`,
    );

    // ── 2. Analyse Sentiment ─────────────────────────────────────────────────
    // Score is in [-1, +1]: negative = frustrated/churning, 0 = neutral, positive = happy.
    // Fallback to 0 (neutral) on any failure so the rest of the pipeline is not interrupted.
    const t2 = Date.now();
    let sentiment = 0;
    try {
      sentiment = await this.sentimentService.analyseSentiment(
        feedback.description,
      );
    } catch (err) {
      this.logger.stepWarn(ctx, 'SENTIMENT', (err as Error).message);
      // sentiment remains 0 — neutral fallback
    }
    this.logger.debug(
      ctx,
      `[STEP] SENTIMENT ${Date.now() - t2}ms | score=${sentiment}`,
    );

    // ── 3. Generate Summary ──────────────────────────────────────────────────
    const t3 = Date.now();
    let summary: string | null = null;
    try {
      summary = await this.summarizationService.summarize(feedback.description);
    } catch (err) {
      this.logger.stepWarn(ctx, 'SUMMARIZATION', (err as Error).message);
    }
    this.logger.debug(
      ctx,
      `[STEP] SUMMARIZATION ${Date.now() - t3}ms | hasSummary=${!!summary}`,
    );

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
      // Store the CLUSTERING embedding (problem clause only) in the DB vector column.
      // This is what pgvector uses for similarity search during theme assignment.
      const vectorStr = `[${embedding.join(',')}]`;
      await this.prisma.$executeRaw`
        UPDATE "Feedback"
        SET embedding = ${vectorStr}::vector
        WHERE id = ${feedbackId};
      `;
    }
    this.logger.debug(ctx, `[STEP] PERSIST ${Date.now() - t4}ms`);

    // ── 4.5. Problem-type classification (Stage 1 of intelligent clustering) ─────────────────────
    // Classify the feedback into a problem_type BEFORE clustering.
    // ThemeClusteringService uses this to enforce bucketed clustering:
    // feedback is ONLY assigned to themes with the same problem_type.
    // Result is cached in Feedback.metadata.problemType to avoid re-classification.
    const t45 = Date.now();
    let problemType = 'other';
    try {
      const existingMeta = (feedback.metadata ?? {}) as Record<string, unknown>;
      const cached = existingMeta.problemType as string | undefined;
      if (cached) {
        problemType = cached;
        this.logger.debug(ctx, `[STEP] PROBLEM_TYPE (cached) ${Date.now() - t45}ms | type=${problemType}`);
      } else {
        const result = await this.problemTypeClassifier.classify(
          feedback.title,
          feedback.description ?? '',
        );
        problemType = result.problem_type;
        // Persist to avoid re-classification on retry
        await this.prisma.feedback.update({
          where: { id: feedbackId },
          data: {
            metadata: {
              ...existingMeta,
              problemType: result.problem_type,
              problemTypeConfidence: result.confidence,
            },
          },
        });
        this.logger.debug(
          ctx,
          `[STEP] PROBLEM_TYPE ${Date.now() - t45}ms | type=${problemType} confidence=${result.confidence.toFixed(2)}`,
        );
      }
    } catch (err) {
      this.logger.stepWarn(ctx, 'PROBLEM_TYPE', (err as Error).message);
      // problemType remains 'other' — fail-open, clustering still proceeds
    }

    // ── 5. Duplicate detection ────────────────────────────────────────────────────────────────────────────────────
    // Use fullTextEmbedding (not the problem-clause-only embedding) for duplicate detection
    // so that near-identical full feedback items are correctly identified as duplicates.
    const t5 = Date.now();
    try {
      await this.duplicateDetectionService.generateSuggestions(
        feedback.workspaceId,
        feedbackId,
        fullTextEmbedding.length > 0 ? fullTextEmbedding : undefined,
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
      this.updateBatchProgress(feedback.importBatchId, 'completed').catch(
        () => {
          /* non-critical */
        },
      );
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
      select: {
        totalRows: true,
        completedRows: true,
        failedRows: true,
        stage: true,
      },
    });
    if (!batch) return;

    const processed = batch.completedRows + batch.failedRows;
    if (
      batch.totalRows > 0 &&
      processed >= batch.totalRows &&
      batch.stage !== 'COMPLETED'
    ) {
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
        const fb = await this.prisma.feedback
          .findUnique({
            where: { id: feedbackId },
            select: { importBatchId: true },
          })
          .catch(() => null);
        if (fb?.importBatchId) {
          this.updateBatchProgress(fb.importBatchId, 'failed').catch(() => {
            /* non-critical */
          });
        }
      }
    }
  }
}

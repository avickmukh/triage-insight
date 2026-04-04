/**
 * VoiceExtractionProcessor — Hardened
 *
 * Hardening additions (vs original):
 * 1. JobLogger structured logging replacing raw Logger
 * 2. @OnQueueFailed DLQ handler for exhausted jobs
 * 3. Partial-processing guard: marks AiJobLog as DEAD_LETTERED on final failure
 * 4. Re-throw on fatal failure so Bull retries with exponential backoff
 * 5. Batch finalization: triggers runBatchFinalization() after clustering so
 *    weak provisional themes created by this voice item are cleaned up.
 */
import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import { InjectQueue } from '@nestjs/bull';
import type { Job, Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { AiJobStatus, AiJobType } from '@prisma/client';
import { VoiceIntelligenceService } from '../services/voice-intelligence.service';
import { ThemeClusteringService } from '../../ai/services/theme-clustering.service';
import { EmbeddingService } from '../../ai/services/embedding.service';
import { CIQ_SCORING_QUEUE } from '../../ai/processors/ciq-scoring.processor';
import type { CiqJobPayload } from '../../ai/processors/ciq-scoring.processor';
import { JobLogger } from '../../common/queue/job-logger';
import { JobIdempotencyService } from '../../common/queue/job-idempotency.service';
import { RetryPolicy } from '../../common/queue/retry-policy';

export const VOICE_EXTRACTION_QUEUE = 'voice-extraction';

export interface VoiceExtractionJobPayload {
  uploadAssetId: string;
  aiJobLogId: string;
  workspaceId: string;
  feedbackId: string;
  transcript: string;
  label?: string;
  /** ImportBatch id created by VoiceTranscriptionProcessor. Used to trigger batch finalization. */
  batchId?: string;
}

@Processor(VOICE_EXTRACTION_QUEUE)
export class VoiceExtractionProcessor {
  private readonly logger = new JobLogger(VoiceExtractionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly intelligenceService: VoiceIntelligenceService,
    private readonly clusteringService: ThemeClusteringService,
    private readonly embeddingService: EmbeddingService,
    private readonly idempotencyService: JobIdempotencyService,
    @InjectQueue(CIQ_SCORING_QUEUE)
    private readonly ciqQueue: Queue<CiqJobPayload>,
  ) {}

  @Process()
  async handleExtraction(job: Job<VoiceExtractionJobPayload>) {
    const {
      uploadAssetId,
      workspaceId,
      feedbackId,
      transcript,
      label,
      batchId,
    } = job.data;
    const ctx = {
      jobType: 'VOICE_EXTRACTION',
      workspaceId,
      entityId: feedbackId,
      jobId: job.id,
    };
    const startedAt = Date.now();

    this.logger.start(ctx);

    // ── 1. Create a new VOICE_EXTRACTION AiJobLog ─────────────────────────
    const extractionJob = await this.prisma.aiJobLog.create({
      data: {
        workspaceId,
        jobType: AiJobType.VOICE_EXTRACTION,
        status: AiJobStatus.RUNNING,
        entityType: 'Feedback',
        entityId: feedbackId,
        input: {
          uploadAssetId,
          feedbackId,
          transcriptLength: transcript.length,
        },
      },
    });

    try {
      // ── 2. Extract structured intelligence from the transcript ────────────
      const intelligence = await this.intelligenceService.extractIntelligence(
        transcript,
        label,
      );
      this.logger.debug(ctx, 'Intelligence extracted', {
        sentiment: intelligence.sentiment.toFixed(2),
        confidence: intelligence.confidenceScore.toFixed(2),
        urgency: intelligence.urgencySignal.toFixed(2),
        churn: intelligence.churnSignal,
        painPoints: intelligence.painPoints.length,
        featureRequests: intelligence.featureRequests.length,
      });

      // ── 3. Generate embedding for theme-matching ──────────────────────────
      let embedding: number[] | undefined;
      try {
        const embeddingText = [
          intelligence.title,
          intelligence.summary,
          ...intelligence.painPoints,
          ...intelligence.featureRequests,
        ].join(' ');
        embedding =
          await this.embeddingService.generateEmbedding(embeddingText);
      } catch (embErr) {
        this.logger.stepWarn(ctx, 'EMBEDDING', (embErr as Error).message);
      }

      // ── 4. Enrich the Feedback record with intelligence fields ─────────────
      await this.prisma.feedback.update({
        where: { id: feedbackId },
        data: {
          title: intelligence.title,
          summary: intelligence.summary,
          sentiment: intelligence.sentiment,
          impactScore: Math.round(intelligence.confidenceScore * 100),
          metadata: {
            uploadAssetId,
            aiJobLogId: extractionJob.id,
            originalFileName: label ?? uploadAssetId,
            intelligence: {
              painPoints: intelligence.painPoints,
              featureRequests: intelligence.featureRequests,
              keyTopics: intelligence.keyTopics,
              confidenceScore: intelligence.confidenceScore,
              urgencySignal: intelligence.urgencySignal,
              churnSignal: intelligence.churnSignal,
              extractedAt: new Date().toISOString(),
            },
          },
        },
      });

      // ── 5. Attempt theme linking ───────────────────────────────────────────
      let linkedThemeId: string | null = null;
      try {
        linkedThemeId = await this.clusteringService.assignFeedbackToTheme(
          workspaceId,
          feedbackId,
          embedding,
        );
        if (linkedThemeId) {
          this.logger.debug(ctx, 'Theme linked', { linkedThemeId });
        }
      } catch (clusterErr) {
        this.logger.stepWarn(
          ctx,
          'THEME_LINKING',
          (clusterErr as Error).message,
        );
      }

      // ── 6. Enqueue CIQ re-scoring for the linked theme ────────────────────
      if (linkedThemeId) {
        try {
          await this.ciqQueue.add(
            { type: 'THEME_SCORED', themeId: linkedThemeId, workspaceId },
            RetryPolicy.critical(),
          );
        } catch (ciqErr) {
          this.logger.stepWarn(ctx, 'CIQ_ENQUEUE', (ciqErr as Error).message);
        }
      }

      // ── 6b. Batch finalization ─────────────────────────────────────────────
      // Voice is always single-item. The ImportBatch created by the transcription
      // processor has totalRows=1. Mark it COMPLETED and trigger the post-batch
      // finalization pass (borderline reassignment, merge, suppress, centroid
      // refresh, promote, confidence refresh) so weak provisional themes are
      // cleaned up before they become visible.
      if (batchId) {
        try {
          await this.prisma.importBatch.update({
            where: { id: batchId },
            data: { completedRows: 1, stage: 'COMPLETED', status: 'COMPLETED' },
          });
          this.clusteringService
            .runBatchFinalization(workspaceId, batchId)
            .catch((finErr: Error) =>
              this.logger.stepWarn(
                ctx,
                'BATCH_FINALIZE',
                `Non-fatal: ${finErr.message}`,
              ),
            );
        } catch (batchErr) {
          this.logger.stepWarn(
            ctx,
            'BATCH_FINALIZE',
            `Failed to update ImportBatch ${batchId}: ${(batchErr as Error).message}`,
          );
        }
      }

      // ── 7. Mark extraction job as COMPLETED ───────────────────────────────
      await this.prisma.aiJobLog.update({
        where: { id: extractionJob.id },
        data: {
          status: AiJobStatus.COMPLETED,
          output: {
            title: intelligence.title,
            summary: intelligence.summary,
            painPoints: intelligence.painPoints,
            featureRequests: intelligence.featureRequests,
            keyTopics: intelligence.keyTopics,
            sentiment: intelligence.sentiment,
            confidenceScore: intelligence.confidenceScore,
            urgencySignal: intelligence.urgencySignal,
            churnSignal: intelligence.churnSignal,
            linkedThemeId,
          },
        },
      });

      const durationMs = Date.now() - startedAt;
      this.logger.complete({ ...ctx, durationMs });
    } catch (err) {
      const errorMessage = (err as Error).message ?? 'Unknown error';
      const durationMs = Date.now() - startedAt;
      this.logger.fail({
        ...ctx,
        durationMs,
        failureReason: errorMessage,
        attempt: job.attemptsMade,
      });

      await this.prisma.aiJobLog.update({
        where: { id: extractionJob.id },
        data: { status: AiJobStatus.FAILED, error: errorMessage },
      });
      throw err; // Allow Bull to retry
    }
  }

  @OnQueueFailed()
  async onFailed(job: Job<VoiceExtractionJobPayload>, error: Error) {
    const ctx = {
      jobType: 'VOICE_EXTRACTION',
      workspaceId: job.data.workspaceId,
      entityId: job.data.feedbackId,
      jobId: job.id,
    };
    // Mark AiJobLog as DEAD_LETTERED on final failure (no idempotency service for voice — uses AiJobLog directly)
    const maxAttempts = RetryPolicy.maxAttempts();
    if (job.attemptsMade >= maxAttempts) {
      this.logger.dlq({
        ...ctx,
        failureReason: error.message,
        attempts: job.attemptsMade,
      });
      await this.prisma.aiJobLog
        .updateMany({
          where: {
            workspaceId: job.data.workspaceId,
            entityId: job.data.feedbackId,
            jobType: AiJobType.VOICE_EXTRACTION,
            status: AiJobStatus.FAILED,
          },
          data: { status: AiJobStatus.DEAD_LETTERED },
        })
        .catch(() => {
          /* best-effort */
        });

      // If the batch exists, count this as a failed row so the batch can still
      // reach COMPLETED (all rows accounted for).
      const { batchId } = job.data;
      if (batchId) {
        await this.prisma.importBatch
          .update({
            where: { id: batchId },
            data: { failedRows: 1, stage: 'COMPLETED', status: 'FAILED' },
          })
          .catch(() => {
            /* best-effort */
          });
      }
    }
  }
}

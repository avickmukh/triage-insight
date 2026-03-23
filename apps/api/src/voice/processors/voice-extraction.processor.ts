import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Job, Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { AiJobStatus, AiJobType } from '@prisma/client';
import { VoiceIntelligenceService } from '../services/voice-intelligence.service';
import { ThemeClusteringService } from '../../ai/services/theme-clustering.service';
import { EmbeddingService } from '../../ai/services/embedding.service';
import { CIQ_SCORING_QUEUE } from '../../ai/processors/ciq-scoring.processor';
import type { CiqJobPayload } from '../../ai/processors/ciq-scoring.processor';

export const VOICE_EXTRACTION_QUEUE = 'voice-extraction';

export interface VoiceExtractionJobPayload {
  uploadAssetId: string;
  aiJobLogId: string;       // The VOICE_TRANSCRIPTION job log id (already COMPLETED)
  workspaceId: string;
  feedbackId: string;       // The Feedback record created by the transcription step
  transcript: string;
  label?: string;
}

@Processor(VOICE_EXTRACTION_QUEUE)
export class VoiceExtractionProcessor {
  private readonly logger = new Logger(VoiceExtractionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly intelligenceService: VoiceIntelligenceService,
    private readonly clusteringService: ThemeClusteringService,
    private readonly embeddingService: EmbeddingService,
    @InjectQueue(CIQ_SCORING_QUEUE)
    private readonly ciqQueue: Queue<CiqJobPayload>,
  ) {}

  @Process()
  async handleExtraction(job: Job<VoiceExtractionJobPayload>) {
    const { uploadAssetId, workspaceId, feedbackId, transcript, label } = job.data;

    this.logger.log(
      `Starting voice extraction for feedback ${feedbackId} (asset ${uploadAssetId})`,
    );

    // ── 1. Create a new VOICE_EXTRACTION AiJobLog ─────────────────────────
    const extractionJob = await this.prisma.aiJobLog.create({
      data: {
        workspaceId,
        jobType: AiJobType.VOICE_EXTRACTION,
        status: AiJobStatus.RUNNING,
        entityType: 'Feedback',
        entityId: feedbackId,
        input: { uploadAssetId, feedbackId, transcriptLength: transcript.length },
      },
    });

    try {
      // ── 2. Extract structured intelligence from the transcript ────────────
      const intelligence = await this.intelligenceService.extractIntelligence(
        transcript,
        label,
      );

      this.logger.log(
        `Intelligence extracted for feedback ${feedbackId}: ` +
          `sentiment=${intelligence.sentiment.toFixed(2)}, ` +
          `confidence=${intelligence.confidenceScore.toFixed(2)}, ` +
          `urgency=${intelligence.urgencySignal.toFixed(2)}, ` +
          `churn=${intelligence.churnSignal}, ` +
          `painPoints=${intelligence.painPoints.length}, ` +
          `featureRequests=${intelligence.featureRequests.length}`,
      );

      // ── 3. Generate embedding for theme-matching ──────────────────────────
      let embedding: number[] | undefined;
      try {
        const embeddingText = [
          intelligence.title,
          intelligence.summary,
          ...intelligence.painPoints,
          ...intelligence.featureRequests,
        ].join(' ');
        embedding = await this.embeddingService.generateEmbedding(embeddingText);
      } catch (embErr) {
        this.logger.warn(
          `Embedding generation failed for feedback ${feedbackId}: ${(embErr as Error).message}`,
        );
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

      // ── 5. Attempt theme linking via existing ThemeClusteringService ───────
      let linkedThemeId: string | null = null;
      try {
        linkedThemeId = await this.clusteringService.assignFeedbackToTheme(
          workspaceId,
          feedbackId,
          embedding,
        );
        if (linkedThemeId) {
          this.logger.log(
            `Voice feedback ${feedbackId} linked to theme ${linkedThemeId}`,
          );
        }
      } catch (clusterErr) {
        this.logger.warn(
          `Theme linking failed for feedback ${feedbackId}: ${(clusterErr as Error).message}`,
        );
      }

      // ── 6. Enqueue CIQ re-scoring for the linked theme ────────────────────
      if (linkedThemeId) {
        try {
          await this.ciqQueue.add(
            { type: 'THEME_SCORED', themeId: linkedThemeId, workspaceId },
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 3000 },
              delay: 2000, // slight delay to let feedback persist
              removeOnComplete: false,
              removeOnFail: false,
            },
          );
          this.logger.log(
            `CIQ re-scoring enqueued for theme ${linkedThemeId} after voice extraction`,
          );
        } catch (ciqErr) {
          this.logger.warn(
            `CIQ re-scoring enqueue failed for theme ${linkedThemeId}: ${(ciqErr as Error).message}`,
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

      this.logger.log(
        `Voice extraction job ${extractionJob.id} completed for feedback ${feedbackId}`,
      );
    } catch (err) {
      const errorMessage = (err as Error).message ?? 'Unknown error';
      this.logger.error(
        `Voice extraction job ${extractionJob.id} failed: ${errorMessage}`,
      );
      await this.prisma.aiJobLog.update({
        where: { id: extractionJob.id },
        data: {
          status: AiJobStatus.FAILED,
          error: errorMessage,
        },
      });
      throw err; // Allow Bull to retry
    }
  }
}

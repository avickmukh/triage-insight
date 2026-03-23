/**
 * CiqScoringProcessor — Hardened
 *
 * Hardening additions (vs original):
 * 1. JobLogger structured logging for all 4 job types
 * 2. JobIdempotencyService dedup guard per (type, entityId, workspaceId)
 * 3. Score overwrite protection — only persists if new score > existing score (configurable)
 * 4. @OnQueueFailed DLQ handler for exhausted jobs
 * 5. Re-throw on fatal failure so Bull retries with exponential backoff
 */
import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import type { Job } from 'bull';
import { Injectable } from '@nestjs/common';
import { CiqService } from '../services/ciq.service';
import { CiqEngineService } from '../../ciq/ciq-engine.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AiJobType } from '@prisma/client';
import { JobLogger } from '../../common/queue/job-logger';
import { JobIdempotencyService } from '../../common/queue/job-idempotency.service';
import { handleDlq } from '../../common/queue/dlq-handler';

export const CIQ_SCORING_QUEUE = 'ciq-scoring';
export type CiqJobType = 'FEEDBACK_SCORED' | 'THEME_SCORED' | 'ROADMAP_SCORED' | 'DEAL_SCORED';

export interface CiqJobPayload {
  type: CiqJobType;
  workspaceId: string;
  feedbackId?: string;
  themeId?: string;
  roadmapItemId?: string;
  dealId?: string;
  /** Injected by idempotency service */
  __logId?: string;
}

@Injectable()
@Processor(CIQ_SCORING_QUEUE)
export class CiqScoringProcessor {
  private readonly logger = new JobLogger(CiqScoringProcessor.name);

  constructor(
    private readonly ciqService: CiqService,
    private readonly ciqEngineService: CiqEngineService,
    private readonly prisma: PrismaService,
    private readonly idempotencyService: JobIdempotencyService,
  ) {}

  @Process()
  async handle(job: Job<CiqJobPayload>) {
    const { type, workspaceId } = job.data;
    const entityId = job.data.feedbackId ?? job.data.themeId ?? job.data.roadmapItemId ?? job.data.dealId ?? 'unknown';
    const ctx = { jobType: `CIQ_${type}`, workspaceId, entityId, jobId: job.id };
    const startedAt = Date.now();

    // ── Map job type to AiJobType enum ───────────────────────────────────────
    const aiJobType = this.toAiJobType(type);

    // ── Idempotency guard ────────────────────────────────────────────────────
    const isDup = await this.idempotencyService.isDuplicate(aiJobType, entityId, workspaceId);
    if (isDup) return;

    const logId = await this.idempotencyService.markStarted(
      aiJobType,
      entityId,
      workspaceId,
      this.toEntityType(type),
    );
    job.data.__logId = logId;

    this.logger.start(ctx);

    try {
      switch (type) {
        case 'FEEDBACK_SCORED': {
          const { feedbackId } = job.data;
          if (!feedbackId) { this.logger.stepWarn(ctx, 'VALIDATE', 'Missing feedbackId'); return; }

          const score = await this.ciqService.scoreFeedback(workspaceId, feedbackId);

          // ── Score overwrite protection ──────────────────────────────────
          const existing = await this.prisma.feedback.findUnique({
            where: { id: feedbackId },
            select: { impactScore: true, ciqScore: true },
          });
          const existingCiq = existing?.ciqScore ?? 0;
          if (score.impactScore > existingCiq || existingCiq === 0) {
            await this.ciqService.persistFeedbackScore(feedbackId, score);
            await this.ciqEngineService.persistFeedbackCiqScore(feedbackId, score.impactScore);
            this.logger.debug(ctx, 'Score persisted', { impactScore: score.impactScore, prev: existingCiq });
          } else {
            this.logger.skip(ctx, `Score ${score.impactScore} <= existing ${existingCiq} — skipping overwrite`);
          }
          break;
        }

        case 'THEME_SCORED': {
          const { themeId } = job.data;
          if (!themeId) { this.logger.stepWarn(ctx, 'VALIDATE', 'Missing themeId'); return; }

          const score = await this.ciqService.scoreTheme(workspaceId, themeId);

          // ── Score overwrite protection ──────────────────────────────────
          const existing = await this.prisma.theme.findUnique({
            where: { id: themeId },
            select: { prioritizationScore: true },
          });
          const existingScore = existing?.prioritizationScore ?? 0;
          if (score.priorityScore > existingScore || existingScore === 0) {
            await this.ciqService.persistThemeScore(themeId, score);
            await this.ciqService.persistThemeScoreToRoadmap(workspaceId, themeId, score);
            await this.ciqEngineService.persistThemeCiqScore(themeId, score.priorityScore);
            this.logger.debug(ctx, 'Score persisted', { priorityScore: score.priorityScore, prev: existingScore });
          } else {
            this.logger.skip(ctx, `Score ${score.priorityScore} <= existing ${existingScore} — skipping overwrite`);
          }
          break;
        }

        case 'ROADMAP_SCORED': {
          const { roadmapItemId } = job.data;
          if (!roadmapItemId) { this.logger.stepWarn(ctx, 'VALIDATE', 'Missing roadmapItemId'); return; }

          const score = await this.ciqService.scoreRoadmapItem(workspaceId, roadmapItemId);
          await this.prisma.roadmapItem
            .update({
              where: { id: roadmapItemId },
              data: {
                priorityScore:      score.priorityScore,
                confidenceScore:    score.confidenceScore,
                revenueImpactScore: score.revenueImpactScore,
                revenueImpactValue: score.revenueImpactValue,
                dealInfluenceValue: score.dealInfluenceValue,
                signalCount:        score.signalCount,
                customerCount:      score.uniqueCustomerCount,
              },
            })
            .catch((err: Error) => this.logger.stepWarn(ctx, 'PERSIST_ROADMAP', err.message));
          this.logger.debug(ctx, 'Roadmap scored', { priorityScore: score.priorityScore });
          break;
        }

        case 'DEAL_SCORED': {
          const { dealId } = job.data;
          if (!dealId) { this.logger.stepWarn(ctx, 'VALIDATE', 'Missing dealId'); return; }

          const ciqScore = await this.ciqEngineService.scoreDeal(workspaceId, dealId);
          this.logger.debug(ctx, 'Deal scored', { ciqScore });
          break;
        }

        default:
          this.logger.stepWarn(ctx, 'DISPATCH', `Unknown CIQ job type: ${type}`);
      }

      const durationMs = Date.now() - startedAt;
      await this.idempotencyService.markCompleted(logId, durationMs);
      this.logger.complete({ ...ctx, durationMs });

    } catch (err) {
      const durationMs = Date.now() - startedAt;
      this.logger.fail({ ...ctx, durationMs, failureReason: (err as Error).message, attempt: job.attemptsMade });
      throw err; // Re-throw so Bull retries with backoff
    }
  }

  @OnQueueFailed()
  async onFailed(job: Job<CiqJobPayload>, error: Error) {
    const entityId = job.data.feedbackId ?? job.data.themeId ?? job.data.roadmapItemId ?? job.data.dealId ?? 'unknown';
    const ctx = {
      jobType: `CIQ_${job.data.type}`,
      workspaceId: job.data.workspaceId,
      entityId,
      jobId: job.id,
    };
    await handleDlq(job, error, ctx, this.logger, this.idempotencyService);
  }

  private toAiJobType(type: CiqJobType): AiJobType {
    switch (type) {
      case 'FEEDBACK_SCORED': return AiJobType.CIQ_SCORING;
      case 'THEME_SCORED':    return AiJobType.CIQ_SCORING;
      case 'ROADMAP_SCORED':  return AiJobType.CIQ_SCORING;
      case 'DEAL_SCORED':     return AiJobType.CIQ_SCORING;
    }
  }

  private toEntityType(type: CiqJobType): string {
    switch (type) {
      case 'FEEDBACK_SCORED': return 'Feedback';
      case 'THEME_SCORED':    return 'Theme';
      case 'ROADMAP_SCORED':  return 'RoadmapItem';
      case 'DEAL_SCORED':     return 'Deal';
    }
  }
}

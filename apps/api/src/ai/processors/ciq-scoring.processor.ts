/**
 * CiqScoringProcessor — Hardened
 *
 * Hardening additions (vs original):
 * 1. JobLogger structured logging for all 4 job types
 * 2. JobIdempotencyService dedup guard per (type, entityId, workspaceId)
 * 3. THEME_SCORED always re-scores (no overwrite guard) so post-merge CIQ is always fresh.
 *    FEEDBACK_SCORED retains the overwrite guard (score can only increase per item).
 * 4. @OnQueueFailed DLQ handler for exhausted jobs
 * 5. Re-throw on fatal failure so Bull retries with exponential backoff
 *
 * Note on score overwrite protection:
 * - FEEDBACK scores are immutable per item — once scored, a feedback item's CIQ
 *   cannot decrease. The guard prevents accidental downgrades.
 * - THEME scores MUST always reflect the current cluster state. After a merge,
 *   the target theme gains more feedback but may score lower on some dimensions
 *   (e.g. diversity). Keeping the old score would be misleading. The guard is
 *   therefore removed for THEME_SCORED.
 */
import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import type { Job } from 'bull';
import { Injectable } from '@nestjs/common';
import { CiqService } from '../services/ciq.service';
import { CiqEngineService } from '../../ciq/ciq-engine.service';
import { ThemeNarrationService } from '../services/theme-narration.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AiJobType } from '@prisma/client';
import { JobLogger } from '../../common/queue/job-logger';
import { JobIdempotencyService } from '../../common/queue/job-idempotency.service';
import { handleDlq } from '../../common/queue/dlq-handler';

export const CIQ_SCORING_QUEUE = 'ciq-scoring';
export type CiqJobType =
  | 'FEEDBACK_SCORED'
  | 'THEME_SCORED'
  | 'ROADMAP_SCORED'
  | 'DEAL_SCORED';

export interface CiqJobPayload {
  type: CiqJobType;
  workspaceId: string;
  feedbackId?: string;
  themeId?: string;
  roadmapItemId?: string;
  dealId?: string;
  /** Injected by idempotency service */
  __logId?: string;
  [key: string]: unknown;
}

@Injectable()
@Processor(CIQ_SCORING_QUEUE)
export class CiqScoringProcessor {
  private readonly logger = new JobLogger(CiqScoringProcessor.name);

  constructor(
    private readonly ciqService: CiqService,
    private readonly ciqEngineService: CiqEngineService,
    private readonly themeNarrationService: ThemeNarrationService,
    private readonly prisma: PrismaService,
    private readonly idempotencyService: JobIdempotencyService,
  ) {}

  @Process()
  async handle(job: Job<CiqJobPayload>) {
    const { type, workspaceId } = job.data;
    const entityId =
      job.data.feedbackId ??
      job.data.themeId ??
      job.data.roadmapItemId ??
      job.data.dealId ??
      'unknown';
    const ctx = {
      jobType: `CIQ_${type}`,
      workspaceId,
      entityId,
      jobId: job.id,
    };
    const startedAt = Date.now();

    // ── Map job type to AiJobType enum ───────────────────────────────────────
    const aiJobType = this.toAiJobType(type);

    // ── Idempotency guard ────────────────────────────────────────────────────
    const isDup = await this.idempotencyService.isDuplicate(
      aiJobType,
      entityId,
      workspaceId,
    );
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
          if (!feedbackId) {
            this.logger.stepWarn(ctx, 'VALIDATE', 'Missing feedbackId');
            return;
          }

          const score = await this.ciqService.scoreFeedback(
            workspaceId,
            feedbackId,
          );

          // ── Score overwrite protection ──────────────────────────────────
          const existing = await this.prisma.feedback.findUnique({
            where: { id: feedbackId },
            select: { impactScore: true, ciqScore: true },
          });
          const existingCiq = existing?.ciqScore ?? 0;
          if (score.impactScore > existingCiq || existingCiq === 0) {
            await this.ciqService.persistFeedbackScore(feedbackId, score);
            await this.ciqEngineService.persistFeedbackCiqScore(
              feedbackId,
              score.impactScore,
            );
            this.logger.debug(ctx, 'Score persisted', {
              impactScore: score.impactScore,
              prev: existingCiq,
            });
          } else {
            this.logger.skip(
              ctx,
              `Score ${score.impactScore} <= existing ${existingCiq} — skipping overwrite`,
            );
          }
          break;
        }

        case 'THEME_SCORED': {
          const { themeId } = job.data;
          if (!themeId) {
            this.logger.stepWarn(ctx, 'VALIDATE', 'Missing themeId');
            return;
          }

          const score = await this.ciqService.scoreTheme(workspaceId, themeId);

          // ── Always persist theme CIQ — no overwrite guard ───────────────
          // Theme scores MUST reflect the current cluster state at all times.
          // After a merge or batch finalization, the target theme's membership
          // changes and the score must be recomputed from scratch. Keeping the
          // old score would surface stale data on the dashboard.
          await this.ciqService.persistThemeScore(themeId, score);
          await this.ciqService.persistThemeScoreToRoadmap(
            workspaceId,
            themeId,
            score,
          );
          await this.ciqEngineService.persistThemeCiqScore(
            themeId,
            score.priorityScore,
          );
          this.logger.debug(ctx, 'Score persisted', {
            priorityScore: score.priorityScore,
          });

          // ── Stage-2: AI Narration ─────────────────────────────────────────
          // Run after scoring so narration has access to the latest priorityScore.
          // Failure is non-fatal — fallback narration is applied automatically.
          await this.generateThemeNarration(workspaceId, themeId, ctx);
          break;
        }

        case 'ROADMAP_SCORED': {
          const { roadmapItemId } = job.data;
          if (!roadmapItemId) {
            this.logger.stepWarn(ctx, 'VALIDATE', 'Missing roadmapItemId');
            return;
          }

          const score = await this.ciqService.scoreRoadmapItem(
            workspaceId,
            roadmapItemId,
          );
          await this.prisma.roadmapItem
            .update({
              where: { id: roadmapItemId },
              data: {
                priorityScore: score.priorityScore,
                confidenceScore: score.confidenceScore,
                revenueImpactScore: score.revenueImpactScore,
                revenueImpactValue: score.revenueImpactValue,
                dealInfluenceValue: score.dealInfluenceValue,
                signalCount: score.signalCount,
                customerCount: score.uniqueCustomerCount,
              },
            })
            .catch((err: Error) =>
              this.logger.stepWarn(ctx, 'PERSIST_ROADMAP', err.message),
            );
          this.logger.debug(ctx, 'Roadmap scored', {
            priorityScore: score.priorityScore,
          });
          break;
        }

        case 'DEAL_SCORED': {
          const { dealId } = job.data;
          if (!dealId) {
            this.logger.stepWarn(ctx, 'VALIDATE', 'Missing dealId');
            return;
          }

          const ciqScore = await this.ciqEngineService.scoreDeal(
            workspaceId,
            dealId,
          );
          this.logger.debug(ctx, 'Deal scored', { ciqScore });
          break;
        }

        default:
          this.logger.stepWarn(
            ctx,
            'DISPATCH',
            `Unknown CIQ job type: ${type}`,
          );
      }

      const durationMs = Date.now() - startedAt;
      await this.idempotencyService.markCompleted(logId, durationMs);
      this.logger.complete({ ...ctx, durationMs });
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      this.logger.fail({
        ...ctx,
        durationMs,
        failureReason: (err as Error).message,
        attempt: job.attemptsMade,
      });
      throw err; // Re-throw so Bull retries with backoff
    }
  }

  @OnQueueFailed()
  async onFailed(job: Job<CiqJobPayload>, error: Error) {
    const entityId =
      job.data.feedbackId ??
      job.data.themeId ??
      job.data.roadmapItemId ??
      job.data.dealId ??
      'unknown';
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
      case 'FEEDBACK_SCORED':
        return AiJobType.CIQ_SCORING_FEEDBACK;
      case 'THEME_SCORED':
        return AiJobType.CIQ_SCORING_THEME;
      case 'ROADMAP_SCORED':
        return AiJobType.CIQ_SCORING_ROADMAP;
      case 'DEAL_SCORED':
        return AiJobType.CIQ_SCORING_DEAL;
    }
  }

  private toEntityType(type: CiqJobType): string {
    switch (type) {
      case 'FEEDBACK_SCORED':
        return 'Feedback';
      case 'THEME_SCORED':
        return 'Theme';
      case 'ROADMAP_SCORED':
        return 'RoadmapItem';
      case 'DEAL_SCORED':
        return 'Deal';
    }
  }

  /**
   * Generate and persist AI narration for a theme.
   * Collects context (feedback samples, sentiment, scores) then calls
   * ThemeNarrationService. Falls back to rule-based narration on failure.
   * Never throws — all errors are caught internally.
   */
  private async generateThemeNarration(
    workspaceId: string,
    themeId: string,
    ctx: {
      jobType: string;
      workspaceId: string;
      entityId: string;
      jobId: string | number;
    },
  ): Promise<void> {
    try {
      // Load theme + up to 8 feedback samples with sentiment + cross-source context
      const theme = await this.prisma.theme.findUnique({
        where: { id: themeId },
        select: {
          title: true,
          description: true,
          priorityScore: true,
          urgencyScore: true,
          trendDirection: true,
          trendDelta: true,
          totalSignalCount: true,
          voiceCount: true,
          supportCount: true,
          surveyCount: true,
          resurfaceCount: true,
          crossSourceInsight: true,
          dominantSignal: true,
          feedbacks: {
            take: 8,
            orderBy: { assignedAt: 'desc' },
            include: {
              feedback: {
                select: { description: true, sentiment: true },
              },
            },
          },
          _count: { select: { feedbacks: true } },
        },
      });

      if (!theme) {
        this.logger.stepWarn(
          ctx,
          'NARRATION',
          `Theme ${themeId} not found — skipping narration`,
        );
        return;
      }

      const feedbackSamples = theme.feedbacks.map((tf) => ({
        text: tf.feedback.description,
        sentiment: tf.feedback.sentiment,
      }));

      const sentiments = feedbackSamples
        .map((s) => s.sentiment)
        .filter((v): v is number => v !== null && v !== undefined);
      const avgSentiment =
        sentiments.length > 0
          ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
          : null;

      const input = {
        themeId,
        title: theme.title,
        description: theme.description,
        feedbackSamples,
        feedbackCount: theme._count.feedbacks,
        avgSentiment,
        priorityScore: theme.priorityScore,
        urgencyScore: theme.urgencyScore,
        // Extended cross-source context for richer narration
        trendDirection: theme.trendDirection,
        trendDelta: theme.trendDelta,
        totalSignalCount: theme.totalSignalCount,
        voiceCount: theme.voiceCount,
        supportCount: theme.supportCount,
        surveyCount: theme.surveyCount,
        resurfaceCount: theme.resurfaceCount,
        crossSourceInsight: theme.crossSourceInsight,
        dominantSignal: theme.dominantSignal,
      };

      // Try LLM narration; fall back to rule-based if it returns null
      const narration =
        (await this.themeNarrationService.narrate(input)) ??
        this.themeNarrationService.buildFallback(input);

      await this.prisma.theme.update({
        where: { id: themeId },
        data: {
          aiSummary: narration.summary,
          aiExplanation: narration.explanation,
          aiRecommendation: narration.recommendation,
          aiConfidence: narration.confidence,
          aiNarratedAt: new Date(),
        },
      });

      this.logger.debug(ctx, 'Narration persisted', {
        confidence: narration.confidence,
      });
    } catch (err) {
      // Non-fatal — log and continue; the scoring job is already complete
      this.logger.stepWarn(ctx, 'NARRATION', (err as Error).message);
    }
  }
}

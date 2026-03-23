/**
 * CiqScoringProcessor
 *
 * Consumes the `ciq-scoring` Bull queue.
 * Handles three job types:
 *   - FEEDBACK_SCORED   : score a single feedback item and persist impactScore
 *   - THEME_SCORED      : score a theme and persist to linked roadmap items
 *   - ROADMAP_SCORED    : score a roadmap item (delegates to theme if linked)
 *
 * Triggered by:
 *   - FeedbackService.create / merge
 *   - ThemeService.update / addFeedback / removeFeedback
 *   - RoadmapService.create / update / createFromTheme
 *   - Customer ARR update (workspace member can trigger via API)
 */

import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { CiqService } from '../services/ciq.service';

export const CIQ_SCORING_QUEUE = 'ciq-scoring';

export type CiqJobType = 'FEEDBACK_SCORED' | 'THEME_SCORED' | 'ROADMAP_SCORED';

export interface CiqJobPayload {
  type: CiqJobType;
  workspaceId: string;
  /** feedbackId — required when type === FEEDBACK_SCORED */
  feedbackId?: string;
  /** themeId — required when type === THEME_SCORED */
  themeId?: string;
  /** roadmapItemId — required when type === ROADMAP_SCORED */
  roadmapItemId?: string;
}

@Injectable()
@Processor(CIQ_SCORING_QUEUE)
export class CiqScoringProcessor {
  private readonly logger = new Logger(CiqScoringProcessor.name);

  constructor(private readonly ciqService: CiqService) {}

  @Process()
  async handle(job: Job<CiqJobPayload>) {
    const { type, workspaceId } = job.data;

    try {
      switch (type) {
        case 'FEEDBACK_SCORED': {
          const { feedbackId } = job.data;
          if (!feedbackId) {
            this.logger.warn('CIQ FEEDBACK_SCORED job missing feedbackId');
            return;
          }
          const score = await this.ciqService.scoreFeedback(workspaceId, feedbackId);
          await this.ciqService.persistFeedbackScore(feedbackId, score);
          this.logger.debug(
            `CIQ feedback scored: ${feedbackId} → impactScore=${score.impactScore}`,
          );
          break;
        }

        case 'THEME_SCORED': {
          const { themeId } = job.data;
          if (!themeId) {
            this.logger.warn('CIQ THEME_SCORED job missing themeId');
            return;
          }
          const score = await this.ciqService.scoreTheme(workspaceId, themeId);
          // Persist to Theme row (priorityScore, lastScoredAt, revenueInfluence, signalBreakdown)
          await this.ciqService.persistThemeScore(themeId, score);
          // Also propagate to linked RoadmapItem rows
          await this.ciqService.persistThemeScoreToRoadmap(workspaceId, themeId, score);
          this.logger.debug(
            `CIQ theme scored: ${themeId} → priorityScore=${score.priorityScore}, ` +
              `confidence=${score.confidenceScore}`,
          );
          break;
        }

        case 'ROADMAP_SCORED': {
          const { roadmapItemId } = job.data;
          if (!roadmapItemId) {
            this.logger.warn('CIQ ROADMAP_SCORED job missing roadmapItemId');
            return;
          }
          const score = await this.ciqService.scoreRoadmapItem(workspaceId, roadmapItemId);
          // Persist directly to the roadmap item
          await this.ciqService['prisma'].roadmapItem
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
            .catch((err: Error) =>
              this.logger.warn(`CIQ roadmap persist failed: ${err.message}`),
            );
          this.logger.debug(
            `CIQ roadmap scored: ${roadmapItemId} → priorityScore=${score.priorityScore}`,
          );
          break;
        }

        default:
          this.logger.warn(`Unknown CIQ job type: ${type}`);
      }
    } catch (err) {
      this.logger.error(
        `CIQ scoring job failed [${type}]: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err; // Re-throw so Bull marks the job as failed and retries
    }
  }
}

/**
 * PrioritizationWorker
 *
 * Bull queue processor for the PRIORITIZATION_QUEUE.
 *
 * Handles two job types:
 *   - WORKSPACE_RECOMPUTE: full 4-dimension recompute for all themes + feedback in a workspace
 *   - THEME_RECOMPUTE:     targeted recompute for a single theme
 *
 * After scoring, results are persisted back to the DB via AggregationService.
 * The priority cache (in-memory Map keyed by workspaceId) is invalidated on completion.
 */
import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bull';
import { AggregationService } from '../services/aggregation.service';
import { PrioritizationCacheService } from '../services/prioritization-cache.service';

export const PRIORITIZATION_QUEUE = 'prioritization';

export type PrioritizationJobType = 'WORKSPACE_RECOMPUTE' | 'THEME_RECOMPUTE';

export interface PrioritizationJobPayload {
  type: PrioritizationJobType;
  workspaceId: string;
  themeId?: string;
  userId?: string;
}

@Processor(PRIORITIZATION_QUEUE)
export class PrioritizationWorker {
  private readonly logger = new Logger(PrioritizationWorker.name);

  constructor(
    private readonly aggregationService: AggregationService,
    private readonly cacheService: PrioritizationCacheService,
  ) {}

  @Process()
  async handle(job: Job<PrioritizationJobPayload>): Promise<void> {
    const { type, workspaceId, themeId } = job.data;
    this.logger.log(
      `Processing prioritization job [${type}] for workspace ${workspaceId}`,
    );

    try {
      if (type === 'WORKSPACE_RECOMPUTE') {
        // 1. Compute all theme priority scores
        const themes = await this.aggregationService.getThemePriorityRanking(
          workspaceId,
          200,
        );
        await this.aggregationService.persistThemeScores(workspaceId, themes);

        // 2. Compute all feature priority scores (urgency signals)
        const features =
          await this.aggregationService.getFeaturePriorityRanking(
            workspaceId,
            500,
          );
        await this.aggregationService.persistFeedbackSignals(
          workspaceId,
          features,
        );

        // 3. Invalidate cache
        this.cacheService.invalidate(workspaceId);

        this.logger.log(
          `WORKSPACE_RECOMPUTE complete: ${themes.length} themes, ${features.length} features scored for workspace ${workspaceId}`,
        );
      } else if (type === 'THEME_RECOMPUTE' && themeId) {
        // Targeted single-theme recompute: run full ranking and persist only the target theme
        const themes = await this.aggregationService.getThemePriorityRanking(
          workspaceId,
          200,
        );
        const target = themes.filter((t) => t.themeId === themeId);
        if (target.length > 0) {
          await this.aggregationService.persistThemeScores(workspaceId, target);
        }
        this.cacheService.invalidate(workspaceId);
        this.logger.log(
          `THEME_RECOMPUTE complete for theme ${themeId} in workspace ${workspaceId}`,
        );
      } else {
        this.logger.warn(`Unknown prioritization job type: ${type}`);
      }
    } catch (err) {
      this.logger.error(
        `Prioritization job failed [${type}]: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err;
    }
  }
}

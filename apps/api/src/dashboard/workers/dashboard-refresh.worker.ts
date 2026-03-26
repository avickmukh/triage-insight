/**
 * DashboardRefreshWorker
 *
 * Bull queue processor that handles async dashboard cache refresh jobs.
 * Triggered by: POST /dashboard/refresh, scheduled cron (every 15 min),
 * and after CIQ/prioritization recompute.
 */
import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DashboardAggregationService } from '../services/dashboard-aggregation.service';
import { ExecutiveInsightService } from '../services/executive-insight.service';
import { DashboardCacheService } from '../services/dashboard-cache.service';

export const DASHBOARD_QUEUE = 'dashboard-refresh';

export const DASHBOARD_JOB_TYPES = {
  REFRESH_ALL:      'REFRESH_ALL',
  REFRESH_SURFACE:  'REFRESH_SURFACE',
} as const;

export type DashboardSurface =
  | 'productDirection'
  | 'emergingThemes'
  | 'revenueRisk'
  | 'voiceSentiment'
  | 'supportPressure'
  | 'roadmapHealth'
  | 'executiveSummary';

@Processor(DASHBOARD_QUEUE)
export class DashboardRefreshWorker {
  private readonly logger = new Logger(DashboardRefreshWorker.name);

  constructor(
    private readonly aggregation: DashboardAggregationService,
    private readonly insight:     ExecutiveInsightService,
    private readonly cache:       DashboardCacheService,
  ) {}

  @Process(DASHBOARD_JOB_TYPES.REFRESH_ALL)
  async handleRefreshAll(job: Job<{ workspaceId: string }>): Promise<void> {
    const { workspaceId } = job.data;
    this.logger.log(`[DASHBOARD] Refreshing all surfaces for workspace ${workspaceId}`);

    try {
      const [pd, et, rr, vs, sp, rh] = await Promise.all([
        this.aggregation.getProductDirection(workspaceId),
        this.aggregation.getEmergingThemes(workspaceId),
        this.aggregation.getRevenueRisk(workspaceId),
        this.aggregation.getVoiceSentiment(workspaceId),
        this.aggregation.getSupportPressure(workspaceId),
        this.aggregation.getRoadmapHealth(workspaceId),
      ]);

      const summary = this.insight.synthesise(pd, et, rr, vs, sp, rh);

      this.cache.set(workspaceId, 'productDirection',  pd);
      this.cache.set(workspaceId, 'emergingThemes',    et);
      this.cache.set(workspaceId, 'revenueRisk',       rr);
      this.cache.set(workspaceId, 'voiceSentiment',    vs);
      this.cache.set(workspaceId, 'supportPressure',   sp);
      this.cache.set(workspaceId, 'roadmapHealth',     rh);
      this.cache.set(workspaceId, 'executiveSummary',  summary);

      this.logger.log(`[DASHBOARD] All surfaces refreshed for workspace ${workspaceId}`);
    } catch (err) {
      this.logger.error(`[DASHBOARD] Refresh failed for workspace ${workspaceId}: ${err}`);
      throw err;
    }
  }

  @Process(DASHBOARD_JOB_TYPES.REFRESH_SURFACE)
  async handleRefreshSurface(job: Job<{ workspaceId: string; surface: DashboardSurface }>): Promise<void> {
    const { workspaceId, surface } = job.data;
    this.logger.log(`[DASHBOARD] Refreshing surface "${surface}" for workspace ${workspaceId}`);

    try {
      switch (surface) {
        case 'productDirection': {
          const data = await this.aggregation.getProductDirection(workspaceId);
          this.cache.set(workspaceId, surface, data);
          break;
        }
        case 'emergingThemes': {
          const data = await this.aggregation.getEmergingThemes(workspaceId);
          this.cache.set(workspaceId, surface, data);
          break;
        }
        case 'revenueRisk': {
          const data = await this.aggregation.getRevenueRisk(workspaceId);
          this.cache.set(workspaceId, surface, data);
          break;
        }
        case 'voiceSentiment': {
          const data = await this.aggregation.getVoiceSentiment(workspaceId);
          this.cache.set(workspaceId, surface, data);
          break;
        }
        case 'supportPressure': {
          const data = await this.aggregation.getSupportPressure(workspaceId);
          this.cache.set(workspaceId, surface, data);
          break;
        }
        case 'roadmapHealth': {
          const data = await this.aggregation.getRoadmapHealth(workspaceId);
          this.cache.set(workspaceId, surface, data);
          break;
        }
        case 'executiveSummary': {
          const [pd, et, rr, vs, sp, rh] = await Promise.all([
            this.aggregation.getProductDirection(workspaceId),
            this.aggregation.getEmergingThemes(workspaceId),
            this.aggregation.getRevenueRisk(workspaceId),
            this.aggregation.getVoiceSentiment(workspaceId),
            this.aggregation.getSupportPressure(workspaceId),
            this.aggregation.getRoadmapHealth(workspaceId),
          ]);
          const summary = this.insight.synthesise(pd, et, rr, vs, sp, rh);
          this.cache.set(workspaceId, surface, summary);
          break;
        }
      }
    } catch (err) {
      this.logger.error(`[DASHBOARD] Surface refresh failed for ${surface}: ${err}`);
      throw err;
    }
  }
}

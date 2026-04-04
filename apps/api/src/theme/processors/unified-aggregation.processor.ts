/**
 * UnifiedAggregationProcessor
 *
 * Bull processor that runs cross-source aggregation for a single theme or an
 * entire workspace. Triggered by:
 *   - ThemeClusteringProcessor (after theme assignment)
 *   - SupportCorrelationProcessor (after cluster→theme linking)
 *   - POST /themes/aggregate-all  (on-demand workspace recompute)
 */
import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import type { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { UnifiedAggregationService } from '../services/unified-aggregation.service';

export const UNIFIED_AGGREGATION_QUEUE = 'unified-aggregation';

export type UnifiedAggregationJobType =
  | 'AGGREGATE_THEME'
  | 'AGGREGATE_WORKSPACE';

export interface UnifiedAggregationJobPayload {
  type: UnifiedAggregationJobType;
  workspaceId: string;
  themeId?: string;
}

@Injectable()
@Processor(UNIFIED_AGGREGATION_QUEUE)
export class UnifiedAggregationProcessor {
  private readonly logger = new Logger(UnifiedAggregationProcessor.name);

  constructor(
    private readonly unifiedAggregationService: UnifiedAggregationService,
  ) {}

  @Process({ concurrency: 3 })
  async handle(job: Job<UnifiedAggregationJobPayload>): Promise<void> {
    const { type, workspaceId, themeId } = job.data;
    this.logger.log(
      `[UnifiedAggregation] Processing job type=${type} workspace=${workspaceId} theme=${themeId ?? 'all'}`,
    );

    if (type === 'AGGREGATE_THEME' && themeId) {
      await this.unifiedAggregationService.aggregateTheme(themeId);
    } else if (type === 'AGGREGATE_WORKSPACE') {
      await this.unifiedAggregationService.aggregateWorkspace(workspaceId);
    } else {
      this.logger.warn(`[UnifiedAggregation] Unknown job type: ${type}`);
    }
  }

  @OnQueueFailed()
  onFailed(job: Job<UnifiedAggregationJobPayload>, err: Error): void {
    this.logger.error(
      `[UnifiedAggregation] Job ${job.id} failed after ${job.attemptsMade} attempts: ${err.message}`,
      err.stack,
    );
  }
}

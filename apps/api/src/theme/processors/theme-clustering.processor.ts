import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { ThemeClusteringService } from '../../ai/services/theme-clustering.service';
import { AI_CLUSTERING_QUEUE } from '../services/theme.service';

interface ClusteringJobPayload {
  workspaceId: string;
}

/**
 * ThemeClusteringProcessor
 *
 * Consumes the `ai-clustering` queue.
 * Triggered by `POST /workspaces/:id/themes/recluster` (ADMIN only).
 * Runs a full workspace reclustering pass via ThemeClusteringService.
 */
@Injectable()
@Processor(AI_CLUSTERING_QUEUE)
export class ThemeClusteringProcessor {
  private readonly logger = new Logger(ThemeClusteringProcessor.name);

  constructor(private readonly themeClusteringService: ThemeClusteringService) {}

  @Process()
  async handleClustering(job: Job<ClusteringJobPayload>) {
    const { workspaceId } = job.data;
    this.logger.log(`Processing theme clustering job for workspace ${workspaceId}`);

    try {
      const result = await this.themeClusteringService.runClustering(workspaceId);
      this.logger.log(
        `Theme clustering complete for workspace ${workspaceId}: ` +
          `processed=${result.processed}, assigned=${result.assigned}, created=${result.created}`,
      );
      return result;
    } catch (err) {
      this.logger.error(
        `Theme clustering failed for workspace ${workspaceId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err; // Re-throw so Bull marks the job as failed
    }
  }
}

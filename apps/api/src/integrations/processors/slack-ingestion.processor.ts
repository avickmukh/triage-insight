import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { SlackIngestionService } from '../services/slack-ingestion.service';

export const SLACK_INGESTION_QUEUE = 'slack-ingestion';

export interface SlackIngestionJobData {
  workspaceId: string;
}

/**
 * SlackIngestionProcessor
 *
 * Async Bull worker that processes Slack ingestion jobs.
 * Each job fetches messages from all configured channels for a workspace,
 * deduplicates them, and creates Feedback records that enter the standard
 * AI analysis + CIQ scoring pipeline.
 */
@Processor(SLACK_INGESTION_QUEUE)
export class SlackIngestionProcessor {
  private readonly logger = new Logger(SlackIngestionProcessor.name);

  constructor(private readonly slackIngestionService: SlackIngestionService) {}

  @Process()
  async handleIngestion(job: Job<SlackIngestionJobData>) {
    const { workspaceId } = job.data;
    this.logger.log(`Starting Slack ingestion for workspace ${workspaceId}`);

    try {
      const result = await this.slackIngestionService.ingestWorkspace(workspaceId);
      this.logger.log(
        `Slack ingestion complete for ${workspaceId}: ` +
          `ingested=${result.ingested}, skipped=${result.skipped}, errors=${result.errors}, ` +
          `channels=[${result.channelsSynced.join(', ')}]`,
      );
      return result;
    } catch (err) {
      this.logger.error(`Slack ingestion failed for workspace ${workspaceId}: ${String(err)}`);
      throw err;
    }
  }
}

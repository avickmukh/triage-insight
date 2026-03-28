/**
 * SentimentProcessor
 *
 * Bull processor for the 'support-sentiment' queue.
 * Runs after clustering to score all tickets and aggregate cluster sentiment.
 *
 * Hardening:
 * - JobLogger structured logging
 * - try/catch with re-throw for Bull retry
 * - @OnQueueFailed DLQ handler
 * - 5-minute in-memory dedup guard
 */
import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import type { Job } from 'bull';
import { Injectable } from '@nestjs/common';
import { SentimentService } from '../services/sentiment.service';
import { JobLogger } from '../../common/queue/job-logger';

interface SentimentJobData {
  workspaceId: string;
}

const DEDUP_WINDOW_MS = 5 * 60 * 1000;
const lastRunMap = new Map<string, number>();

@Injectable()
@Processor('support-sentiment')
export class SentimentProcessor {
  private readonly logger = new JobLogger(SentimentProcessor.name);

  constructor(private readonly sentimentService: SentimentService) {}

  @Process()
  async handleSentiment(job: Job<SentimentJobData>) {
    const { workspaceId } = job.data;
    const ctx = { jobType: 'SUPPORT_SENTIMENT', workspaceId, jobId: job.id };
    const startedAt = Date.now();

    const lastRun = lastRunMap.get(workspaceId) ?? 0;
    if (Date.now() - lastRun < DEDUP_WINDOW_MS) {
      this.logger.skip(
        ctx,
        `Sentiment ran ${Math.round((Date.now() - lastRun) / 1000)}s ago — skipping`,
      );
      return;
    }

    this.logger.start(ctx);
    try {
      const result = await this.sentimentService.runFullSentimentPass(workspaceId);
      lastRunMap.set(workspaceId, Date.now());
      const durationMs = Date.now() - startedAt;
      this.logger.complete({ ...ctx, durationMs, ...result });
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      this.logger.fail({
        ...ctx,
        durationMs,
        failureReason: (err as Error).message,
        attempt: job.attemptsMade,
      });
      throw err;
    }
  }

  @OnQueueFailed()
  onFailed(job: Job<SentimentJobData>, error: Error) {
    this.logger.dlq({
      jobType: 'SUPPORT_SENTIMENT',
      workspaceId: job.data.workspaceId,
      jobId: job.id,
      failureReason: error.message,
      attempts: job.attemptsMade,
    });
  }
}

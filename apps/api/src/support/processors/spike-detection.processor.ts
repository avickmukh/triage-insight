/**
 * SpikeDetectionProcessor — Hardened
 *
 * Hardening additions (vs original):
 * 1. JobLogger structured logging
 * 2. try/catch with re-throw so Bull retries with backoff
 * 3. @OnQueueFailed DLQ handler
 * 4. In-memory dedup guard (5-minute window per workspace)
 */
import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import type { Job } from 'bull';
import { Injectable } from '@nestjs/common';
import { SpikeDetectionService } from '../services/spike-detection.service';
import { JobLogger } from '../../common/queue/job-logger';

interface SpikeDetectionJobData {
  workspaceId: string;
}

const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const lastRunMap = new Map<string, number>();

@Injectable()
@Processor('support-spike-detection')
export class SpikeDetectionProcessor {
  private readonly logger = new JobLogger(SpikeDetectionProcessor.name);

  constructor(private readonly spikeDetectionService: SpikeDetectionService) {}

  @Process()
  async handleSpikeDetection(job: Job<SpikeDetectionJobData>) {
    const { workspaceId } = job.data;
    const ctx = {
      jobType: 'SUPPORT_SPIKE_DETECTION',
      workspaceId,
      jobId: job.id,
    };
    const startedAt = Date.now();

    // ── In-memory idempotency guard ──────────────────────────────────────────
    const lastRun = lastRunMap.get(workspaceId) ?? 0;
    if (Date.now() - lastRun < DEDUP_WINDOW_MS) {
      this.logger.skip(
        ctx,
        `Spike detection ran ${Math.round((Date.now() - lastRun) / 1000)}s ago — skipping`,
      );
      return;
    }

    this.logger.start(ctx);
    try {
      await this.spikeDetectionService.detectSpikes(workspaceId);
      lastRunMap.set(workspaceId, Date.now());
      const durationMs = Date.now() - startedAt;
      this.logger.complete({ ...ctx, durationMs });
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      this.logger.fail({
        ...ctx,
        durationMs,
        failureReason: (err as Error).message,
        attempt: job.attemptsMade,
      });
      throw err; // Re-throw so Bull retries
    }
  }

  @OnQueueFailed()
  onFailed(job: Job<SpikeDetectionJobData>, error: Error) {
    this.logger.dlq({
      jobType: 'SUPPORT_SPIKE_DETECTION',
      workspaceId: job.data.workspaceId,
      jobId: job.id,
      failureReason: error.message,
      attempts: job.attemptsMade,
    });
  }
}

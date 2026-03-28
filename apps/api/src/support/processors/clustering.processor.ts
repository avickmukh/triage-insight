/**
 * ClusteringProcessor — Hardened
 *
 * Hardening additions (vs original):
 * 1. JobLogger structured logging
 * 2. try/catch with re-throw so Bull retries with backoff
 * 3. @OnQueueFailed DLQ handler
 * 4. Idempotency guard — skips if a clustering job ran for this workspace in the last 5 minutes
 *
 * CIQ Integration (Phase 4):
 * After correlateWithFeedback(), enqueues a THEME_SCORED CIQ job for every
 * theme that just had a support cluster linked to it.  This ensures CIQ scores
 * are automatically recomputed whenever new support data arrives.
 */
import { Processor, Process, OnQueueFailed, InjectQueue } from '@nestjs/bull';
import type { Job, Queue } from 'bull';
import { Injectable } from '@nestjs/common';
import { ClusteringService } from '../services/clustering.service';
import { JobLogger } from '../../common/queue/job-logger';
import { PrismaService } from '../../prisma/prisma.service';
import { CIQ_SCORING_QUEUE } from '../../ai/processors/ciq-scoring.processor';
import type { CiqJobPayload } from '../../ai/processors/ciq-scoring.processor';
import { RetryPolicy } from '../../common/queue/retry-policy';

interface ClusteringJobData {
  workspaceId: string;
}

const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const lastRunMap = new Map<string, number>();

@Injectable()
@Processor('support-clustering')
export class ClusteringProcessor {
  private readonly logger = new JobLogger(ClusteringProcessor.name);

  constructor(
    private readonly clusteringService: ClusteringService,
    private readonly prisma: PrismaService,
    @InjectQueue(CIQ_SCORING_QUEUE)
    private readonly ciqQueue: Queue<CiqJobPayload>,
  ) {}

  @Process()
  async handleClustering(job: Job<ClusteringJobData>) {
    const { workspaceId } = job.data;
    const ctx = { jobType: 'SUPPORT_CLUSTERING', workspaceId, jobId: job.id };
    const startedAt = Date.now();

    // ── In-memory idempotency guard (5-minute dedup window) ─────────────────
    const lastRun = lastRunMap.get(workspaceId) ?? 0;
    if (Date.now() - lastRun < DEDUP_WINDOW_MS) {
      this.logger.skip(ctx, `Clustering ran ${Math.round((Date.now() - lastRun) / 1000)}s ago — skipping`);
      return;
    }

    this.logger.start(ctx);
    try {
      await this.clusteringService.clusterTickets(workspaceId);
      await this.clusteringService.correlateWithFeedback(workspaceId);
      lastRunMap.set(workspaceId, Date.now());

      // ── Enqueue CIQ re-scoring for all themes with linked support clusters ─
      // After correlateWithFeedback(), clusters that were matched to themes have
      // their themeId set.  We query all distinct themeIds now and fire CIQ jobs.
      try {
        const linkedClusters = await this.prisma.supportIssueCluster.findMany({
          where: { workspaceId, themeId: { not: null } },
          select: { themeId: true },
          distinct: ['themeId'],
        });

        const themeIds = linkedClusters
          .map((c) => c.themeId)
          .filter((id): id is string => id != null);

        if (themeIds.length > 0) {
          await Promise.all(
            themeIds.map((themeId) =>
              this.ciqQueue.add(
                { type: 'THEME_SCORED', themeId, workspaceId },
                RetryPolicy.standard(),
              ),
            ),
          );
          this.logger.debug(ctx, `Enqueued CIQ re-scoring for ${themeIds.length} themes after support clustering`);
        }
      } catch (ciqErr) {
        // Non-fatal: log and continue — CIQ will be recomputed on next run
        this.logger.stepWarn(ctx, 'CIQ_ENQUEUE', (ciqErr as Error).message);
      }

      const durationMs = Date.now() - startedAt;
      this.logger.complete({ ...ctx, durationMs });
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      this.logger.fail({ ...ctx, durationMs, failureReason: (err as Error).message, attempt: job.attemptsMade });
      throw err; // Re-throw so Bull retries
    }
  }

  @OnQueueFailed()
  onFailed(job: Job<ClusteringJobData>, error: Error) {
    this.logger.dlq({
      jobType: 'SUPPORT_CLUSTERING',
      workspaceId: job.data.workspaceId,
      jobId: job.id,
      failureReason: error.message,
      attempts: job.attemptsMade,
    });
  }
}

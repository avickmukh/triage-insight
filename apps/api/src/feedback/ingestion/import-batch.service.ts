import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { AI_ANALYSIS_QUEUE } from '../../ai/processors/analysis.processor';

export interface BatchStatusResponse {
  batchId: string;
  stage: string;
  isRunning: boolean;
  total: number;
  completed: number;
  failed: number;
  pending: number;
  pct: number;
}

/**
 * ImportBatchService
 *
 * Returns pipeline progress scoped to a single ImportBatch.
 * This replaces the workspace-wide getPipelineStatus() for upload progress
 * so that uploading 50 items shows total=50 (not 2307 historical items).
 *
 * Completion logic uses queue job counts (waiting + active + delayed === 0)
 * combined with batch-scoped AiJobLog counts — NOT a percentage threshold.
 */
@Injectable()
export class ImportBatchService {
  private readonly logger = new Logger(ImportBatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(AI_ANALYSIS_QUEUE) private readonly analysisQueue: Queue,
  ) {}

  async getBatchStatus(batchId: string, workspaceId: string): Promise<BatchStatusResponse> {
    // 1. Load the batch record (security: ensure it belongs to this workspace)
    const batch = await this.prisma.importBatch.findFirst({
      where: { id: batchId, workspaceId },
      select: {
        id: true,
        stage: true,
        status: true,
        totalRows: true,
        completedRows: true,
        failedRows: true,
      },
    });

    if (!batch) {
      throw new NotFoundException(`Import batch ${batchId} not found`);
    }

    // 2. Count AiJobLog entries for feedback items in this batch
    //    We scope by feedbackId membership in the batch rather than a direct FK
    //    so this works even if AiJobLog doesn't have importBatchId.
    const [completedJobs, failedJobs, pendingJobs] = await Promise.all([
      this.prisma.aiJobLog.count({
        where: {
          workspaceId,
          jobType: 'FEEDBACK_SUMMARY',
          status: 'COMPLETED',
          entityId: {
            in: await this.getFeedbackIdsForBatch(batchId),
          },
        },
      }),
      this.prisma.aiJobLog.count({
        where: {
          workspaceId,
          jobType: 'FEEDBACK_SUMMARY',
          status: { in: ['FAILED', 'DEAD_LETTERED'] },
          entityId: {
            in: await this.getFeedbackIdsForBatch(batchId),
          },
        },
      }),
      this.prisma.aiJobLog.count({
        where: {
          workspaceId,
          jobType: 'FEEDBACK_SUMMARY',
          status: { in: ['QUEUED', 'RUNNING'] },
          entityId: {
            in: await this.getFeedbackIdsForBatch(batchId),
          },
        },
      }),
    ]);

    // 3. Get BullMQ queue counts to detect if any jobs are still queued
    let queueWaiting = 0;
    let queueActive = 0;
    let queueDelayed = 0;
    try {
      const counts = await this.analysisQueue.getJobCounts();
      queueWaiting = counts.waiting ?? 0;
      queueActive = counts.active ?? 0;
      queueDelayed = counts.delayed ?? 0;
    } catch (err) {
      this.logger.warn(`[ImportBatch] Could not get queue counts: ${(err as Error).message}`);
    }

    const total = batch.totalRows;

    // 4. Determine completion:
    //    isDone = no pending DB jobs AND queue is drained
    const queueDrained = queueWaiting === 0 && queueActive === 0 && queueDelayed === 0;
    const isDone = pendingJobs === 0 && queueDrained;

    // 5. Derive stage
    let stage = String(batch.stage);
    if (isDone && total > 0) {
      stage = 'COMPLETED';
    } else if (pendingJobs > 0 || queueActive > 0) {
      stage = 'ANALYZING';
    } else if (queueWaiting > 0 || queueDelayed > 0) {
      stage = 'QUEUED';
    }

    // 6. Persist stage back to ImportBatch if it changed
    if (stage !== String(batch.stage)) {
      this.prisma.importBatch.update({
        where: { id: batchId },
        data: {
          stage: stage as any,
          status: isDone ? 'COMPLETED' : 'PROCESSING',
          completedRows: completedJobs,
          failedRows: failedJobs,
        },
      }).catch(() => { /* non-critical */ });
    }

    const pct = total === 0 ? 100 : Math.floor(((completedJobs + failedJobs) / total) * 100);

    return {
      batchId,
      stage,
      isRunning: !isDone,
      total,
      completed: completedJobs,
      failed: failedJobs,
      pending: pendingJobs,
      pct,
    };
  }

  /** Returns the list of feedbackIds that belong to this batch. Cached per call. */
  private async getFeedbackIdsForBatch(batchId: string): Promise<string[]> {
    const rows = await this.prisma.feedback.findMany({
      where: { importBatchId: batchId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}

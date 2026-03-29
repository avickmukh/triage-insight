import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
 *
 * ── Completion logic ──────────────────────────────────────────────────────────
 *
 * We use ONLY ImportBatch.completedRows + failedRows >= totalRows as the
 * completion signal. This avoids two broken approaches:
 *
 *  ✗ AiJobLog IN-query: the idempotency service creates records with status=RUNNING
 *    (never QUEUED), so counting QUEUED records always returns 0 and the
 *    "pending" count is unreliable.
 *
 *  ✗ BullMQ queue.getJobCounts(): the queue is shared across ALL workspaces.
 *    Other workspaces' jobs keep waiting/active counts > 0, so queueDrained
 *    is never true in a multi-tenant environment.
 *
 *  ✓ ImportBatch.completedRows: incremented atomically by the analysis
 *    processor after each job completes (or failedRows for failures).
 *    This is tenant-isolated and requires no cross-table joins.
 *
 * isDone = (completedRows + failedRows) >= totalRows AND totalRows > 0
 */
@Injectable()
export class ImportBatchService {
  private readonly logger = new Logger(ImportBatchService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getBatchStatus(batchId: string, workspaceId: string): Promise<BatchStatusResponse> {
    // Load the batch record (security: ensure it belongs to this workspace)
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

    const total     = batch.totalRows;
    const completed = batch.completedRows;
    const failed    = batch.failedRows;
    const processed = completed + failed;
    const pending   = Math.max(0, total - processed);

    // ── Completion: all rows accounted for ──────────────────────────────────
    // We add a 1-second grace window (processedRows >= total) rather than
    // strict equality so that race conditions between the last increment and
    // the poll don't leave the banner stuck.
    const isDone = total > 0 && processed >= total;

    // ── Derive stage ────────────────────────────────────────────────────────
    let stage = String(batch.stage);
    if (isDone) {
      stage = 'COMPLETED';
    } else if (total > 0 && processed > 0) {
      stage = 'ANALYZING';
    } else {
      // Nothing processed yet — still queued
      stage = String(batch.stage) === 'UPLOADED' ? 'QUEUED' : String(batch.stage);
    }

    // ── Persist stage back to ImportBatch if it changed ────────────────────
    if (stage !== String(batch.stage)) {
      this.prisma.importBatch.update({
        where: { id: batchId },
        data: {
          stage:  stage as any,
          status: isDone ? 'COMPLETED' : 'PROCESSING',
        },
      }).catch((err) => {
        this.logger.warn(`[ImportBatch] Failed to persist stage: ${(err as Error).message}`);
      });
    }

    const pct = total === 0 ? 0 : Math.min(100, Math.floor((processed / total) * 100));

    return {
      batchId,
      stage,
      isRunning: !isDone,
      total,
      completed,
      failed,
      pending,
      pct,
    };
  }
}

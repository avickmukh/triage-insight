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
 * ── Full pipeline stages ──────────────────────────────────────────────────────
 *
 *  QUEUED      → feedback rows uploaded, waiting to be processed
 *  ANALYZING   → FEEDBACK_SUMMARY jobs running (embedding + summaries)
 *  CLUSTERING  → THEME_CLUSTERING jobs running
 *  SCORING     → CIQ_SCORING_THEME / CIQ_SCORING_FEEDBACK jobs running
 *                (enqueued by runBatchFinalization after clustering)
 *  COMPLETED   → all phases done (embedding + clustering + CIQ scoring)
 *  FAILED      → all rows failed
 *
 * ── Completion logic ──────────────────────────────────────────────────────────
 *
 * Phase 1 (embedding/clustering) completion:
 *   ImportBatch.completedRows + failedRows >= totalRows
 *   (incremented atomically by the analysis processor)
 *
 * Phase 2 (CIQ scoring) completion:
 *   No AiJobLog records with jobType IN (CIQ_SCORING_THEME, CIQ_SCORING_FEEDBACK)
 *   and status = RUNNING for this workspace, created in the last 2 hours.
 *   We use a 2h window to avoid picking up stale records from previous runs.
 *
 * Only when BOTH phases are done do we return stage = COMPLETED.
 *
 * ── Why not BullMQ queue counts? ─────────────────────────────────────────────
 *  ✗ The queue is shared across ALL workspaces. Other workspaces' jobs keep
 *    waiting/active counts > 0, so queueDrained is never true in multi-tenant.
 *
 * ── Why not AiJobLog QUEUED counts? ─────────────────────────────────────────
 *  ✗ The idempotency service creates records with status=RUNNING (never QUEUED),
 *    so counting QUEUED records always returns 0.
 *
 * ── CIQ scoring grace window ─────────────────────────────────────────────────
 *  CIQ jobs are enqueued fire-and-forget after batch finalization. There is a
 *  small gap (~100-500ms) between the last analysis job completing and the first
 *  CIQ job being created. We add a 5-second grace window: if embedding is done
 *  but no CIQ jobs exist yet, we stay in SCORING stage for up to 5 seconds
 *  before declaring COMPLETED. This prevents a brief flash of "Done" before
 *  CIQ jobs appear.
 */
@Injectable()
export class ImportBatchService {
  private readonly logger = new Logger(ImportBatchService.name);

  /** Grace window in ms: stay in SCORING after embedding completes */
  private readonly CIQ_GRACE_MS = 5_000;

  /** Only look at CIQ jobs created in this window (avoids stale records) */
  private readonly CIQ_WINDOW_MS = 2 * 60 * 60 * 1_000; // 2 hours

  constructor(private readonly prisma: PrismaService) {}

  async getBatchStatus(
    batchId: string,
    workspaceId: string,
  ): Promise<BatchStatusResponse> {
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
        updatedAt: true,
      },
    });

    if (!batch) {
      throw new NotFoundException(`Import batch ${batchId} not found`);
    }

    const total = batch.totalRows;
    const completed = batch.completedRows;
    const failed = batch.failedRows;
    const processed = completed + failed;
    const pending = Math.max(0, total - processed);

    // ── Phase 1 completion: all feedback rows embedded + clustered ───────────
    const embeddingDone = total > 0 && processed >= total;

    // ── Phase 2: CIQ scoring status ──────────────────────────────────────────
    // Check if CIQ scoring jobs are still running for this workspace.
    // We scope to the last 2 hours to avoid stale records from previous runs.
    const ciqSince = new Date(Date.now() - this.CIQ_WINDOW_MS);
    const [ciqRunning, ciqTotal] = await Promise.all([
      this.prisma.aiJobLog.count({
        where: {
          workspaceId,
          jobType: { in: ['CIQ_SCORING_THEME', 'CIQ_SCORING_FEEDBACK'] as any[] },
          status: 'RUNNING',
          createdAt: { gte: ciqSince },
        },
      }),
      this.prisma.aiJobLog.count({
        where: {
          workspaceId,
          jobType: { in: ['CIQ_SCORING_THEME', 'CIQ_SCORING_FEEDBACK'] as any[] },
          createdAt: { gte: ciqSince },
        },
      }),
    ]);

    const ciqDone = ciqTotal > 0 && ciqRunning === 0;

    // Grace window: if embedding just finished but CIQ jobs haven't appeared yet,
    // wait up to CIQ_GRACE_MS before declaring done.
    const msSinceEmbeddingDone = embeddingDone
      ? Date.now() - new Date(batch.updatedAt).getTime()
      : 0;
    const withinGrace = embeddingDone && ciqTotal === 0 && msSinceEmbeddingDone < this.CIQ_GRACE_MS;

    // ── Derive stage ─────────────────────────────────────────────────────────
    let stage: string;
    if (!embeddingDone) {
      // Phase 1 still running
      if (total > 0 && processed > 0) {
        stage = 'ANALYZING';
      } else {
        stage = String(batch.stage) === 'UPLOADED' ? 'QUEUED' : String(batch.stage);
      }
    } else if (withinGrace || ciqRunning > 0) {
      // Phase 2: CIQ scoring in progress (or grace window)
      stage = 'SCORING';
    } else if (ciqDone) {
      // Both phases complete
      stage = 'COMPLETED';
    } else if (ciqTotal === 0 && !withinGrace) {
      // CIQ jobs never appeared (e.g. no themes) — embedding done is enough
      stage = 'COMPLETED';
    } else {
      stage = 'COMPLETED';
    }

    // All failed
    if (embeddingDone && failed > 0 && completed === 0) {
      stage = 'FAILED';
    }

    // ── Persist stage back to ImportBatch if it changed ──────────────────────
    const batchStageStr = String(batch.stage);
    if (stage !== batchStageStr && stage !== 'SCORING') {
      // Don't persist SCORING — it's a transient state derived from AiJobLog
      this.prisma.importBatch
        .update({
          where: { id: batchId },
          data: {
            stage: stage as any,
            status: stage === 'COMPLETED' ? 'COMPLETED' : 'PROCESSING',
          },
        })
        .catch((err) => {
          this.logger.warn(
            `[ImportBatch] Failed to persist stage: ${(err as Error).message}`,
          );
        });
    }

    // ── Progress percentage ───────────────────────────────────────────────────
    // Phase 1 = 0–70%, Phase 2 (CIQ scoring) = 70–100%
    let pct: number;
    if (total === 0) {
      pct = 0;
    } else if (!embeddingDone) {
      // Phase 1: 0–70%
      pct = Math.min(70, Math.floor((processed / total) * 70));
    } else if (stage === 'SCORING' || withinGrace) {
      // Phase 2: 70–99%
      if (ciqTotal > 0) {
        const ciqCompleted = ciqTotal - ciqRunning;
        pct = 70 + Math.min(29, Math.floor((ciqCompleted / ciqTotal) * 29));
      } else {
        pct = 72; // grace window — show slight progress
      }
    } else {
      pct = 100;
    }

    const isRunning = stage !== 'COMPLETED' && stage !== 'FAILED';

    return {
      batchId,
      stage,
      isRunning,
      total,
      completed,
      failed,
      pending: isRunning ? Math.max(1, pending) : 0,
      pct,
    };
  }
}

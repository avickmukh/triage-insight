import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AutoMergeService } from './auto-merge.service';
import { ThemeLabelService } from './theme-label.service';
import { TrendComputationService } from './trend-computation.service';

/**
 * ClusterRefinementService
 *
 * Orchestrates periodic background refinement of theme clusters within a workspace.
 *
 * REFINEMENT PIPELINE (runs in order):
 *   1. PROMOTE  — Upgrade PROVISIONAL themes to STABLE when they meet the
 *                 dynamic minimum support threshold (≥ dynamicMinSupport signals).
 *   2. ARCHIVE  — Mark weak PROVISIONAL themes as ARCHIVED when they are older
 *                 than MAX_PROVISIONAL_AGE_DAYS and still below min support.
 *   3. MERGE    — Run the convergent auto-merge pass to collapse near-duplicate
 *                 clusters (delegates to AutoMergeService).
 *   4. LABEL    — Refresh stale shortLabels for all active themes
 *                 (delegates to ThemeLabelService).
 *   5. TREND    — Recompute velocity and trend signals for all active themes
 *                 (delegates to TrendComputationService).
 *
 * DYNAMIC THRESHOLDS:
 *   - dynamicMinSupport = max(2, Math.ceil(Math.log(N + 1)))
 *     where N = total live feedback count in the workspace.
 *   - This ensures small workspaces (N=10) use minSupport=2 while
 *     large workspaces (N=1000) use minSupport=7.
 *
 * INVOCATION:
 *   - Called by the CIQ scoring processor after each batch of theme scorings.
 *   - Can also be triggered manually via the /api/ai/refine-clusters endpoint.
 *   - Safe to call concurrently — uses per-workspace locking via a simple
 *     in-memory Set to prevent overlapping runs.
 */
@Injectable()
export class ClusterRefinementService {
  private readonly logger = new Logger(ClusterRefinementService.name);

  /** Maximum age (days) before an unsupported PROVISIONAL theme is archived. */
  private readonly MAX_PROVISIONAL_AGE_DAYS = 14;

  /** In-memory lock set to prevent concurrent runs per workspace. */
  private readonly runningWorkspaces = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly autoMerge: AutoMergeService,
    private readonly labelService: ThemeLabelService,
    private readonly trendService: TrendComputationService,
  ) {}

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Run the full refinement pipeline for a workspace.
   *
   * Returns a summary of all actions taken.
   */
  async refineWorkspace(workspaceId: string): Promise<RefinementSummary> {
    if (this.runningWorkspaces.has(workspaceId)) {
      this.logger.debug(`[Refine] Workspace ${workspaceId} already running — skipping`);
      return { workspaceId, promoted: 0, archived: 0, merged: 0, labelled: 0, trends: 0, skipped: true };
    }

    this.runningWorkspaces.add(workspaceId);
    const start = Date.now();

    try {
      this.logger.log(`[Refine] Starting refinement for workspace ${workspaceId}`);

      // Step 1: Compute dynamic min support
      const dynamicMinSupport = await this.computeDynamicMinSupport(workspaceId);
      this.logger.debug(`[Refine] dynamicMinSupport=${dynamicMinSupport} for workspace ${workspaceId}`);

      // Step 2: Promote PROVISIONAL → STABLE
      const promoted = await this.promoteProvisionalThemes(workspaceId, dynamicMinSupport);

      // Step 3: Archive weak PROVISIONAL themes
      const archived = await this.archiveWeakProvisionalThemes(workspaceId);

      // Step 4: Convergent merge pass (autoExecute=true — merges are executed immediately)
      // The background refinement pass is the authoritative full-workspace merge sweep.
      const mergeResult = await this.autoMerge.detectAndMerge(workspaceId, {
        autoExecute: true,
        userId: 'system',
      });
      const merged = mergeResult.mergedCount;

      // Step 5: Refresh stale labels
      const labelResult = await this.labelService.generateLabelsForWorkspace(workspaceId);
      const labelled = labelResult.processed;

      // Step 6: Recompute trends
      const trendResult = await this.trendService.computeWorkspaceTrends(workspaceId);
      const trends = trendResult?.processed ?? 0;

      const durationMs = Date.now() - start;
      this.logger.log(
        `[Refine] Workspace ${workspaceId} done in ${durationMs}ms — ` +
        `promoted=${promoted} archived=${archived} merged=${merged} labelled=${labelled} trends=${trends}`,
      );

      return { workspaceId, promoted, archived, merged, labelled, trends, skipped: false };
    } catch (err) {
      this.logger.error(
        `[Refine] Workspace ${workspaceId} failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err;
    } finally {
      this.runningWorkspaces.delete(workspaceId);
    }
  }

  /**
   * Run refinement for ALL workspaces that have had recent activity.
   *
   * "Recent activity" = at least one feedback item updated in the last 24 hours.
   * This prevents running the pipeline on dormant workspaces.
   */
  async refineAllActiveWorkspaces(): Promise<RefinementSummary[]> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const activeWorkspaces = await this.prisma.workspace.findMany({
      where: {
        feedbacks: {
          some: { updatedAt: { gte: cutoff } },
        },
      },
      select: { id: true },
    });

    this.logger.log(`[Refine] Running refinement for ${activeWorkspaces.length} active workspaces`);

    const results: RefinementSummary[] = [];
    for (const { id } of activeWorkspaces) {
      try {
        const summary = await this.refineWorkspace(id);
        results.push(summary);
      } catch {
        // Already logged in refineWorkspace — continue with next workspace
        results.push({
          workspaceId: id,
          promoted: 0, archived: 0, merged: 0, labelled: 0, trends: 0,
          skipped: false,
          error: true,
        });
      }
    }

    return results;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Compute dynamic minimum support threshold for a workspace.
   *
   * Formula: max(2, ceil(log(N + 1)))
   * where N = total live feedback count in the workspace.
   *
   * Examples:
   *   N=10  → max(2, ceil(log(11))) = max(2, 3) = 3
   *   N=50  → max(2, ceil(log(51))) = max(2, 4) = 4
   *   N=500 → max(2, ceil(log(501))) = max(2, 7) = 7
   */
  private async computeDynamicMinSupport(workspaceId: string): Promise<number> {
    const count = await this.prisma.feedback.count({
      where: { workspaceId },
    });
    return Math.max(2, Math.ceil(Math.log(count + 1)));
  }

  /**
   * Promote PROVISIONAL themes to STABLE when they have enough direct signals.
   *
   * A theme is promoted when:
   *   - Its status is PROVISIONAL
   *   - Its _count.feedbacks >= dynamicMinSupport
   *
   * Returns the number of themes promoted.
   */
  private async promoteProvisionalThemes(
    workspaceId: string,
    dynamicMinSupport: number,
  ): Promise<number> {
    // Find PROVISIONAL themes with enough signals
    const candidates = await this.prisma.theme.findMany({
      where: {
        workspaceId,
        status: 'PROVISIONAL',
      },
      select: {
        id: true,
        _count: { select: { feedbacks: true } },
      },
    });

    const toPromote = candidates.filter(
      (t) => t._count.feedbacks >= dynamicMinSupport,
    );

    if (toPromote.length === 0) return 0;

    await this.prisma.theme.updateMany({
      where: {
        id: { in: toPromote.map((t) => t.id) },
      },
      data: { status: 'STABLE' },
    });

    this.logger.log(
      `[Refine] Promoted ${toPromote.length} PROVISIONAL → STABLE in workspace ${workspaceId}`,
    );

    return toPromote.length;
  }

  /**
   * Archive PROVISIONAL themes that are too old and still have insufficient signals.
   *
   * A theme is archived when:
   *   - Its status is PROVISIONAL
   *   - It was created more than MAX_PROVISIONAL_AGE_DAYS ago
   *   - It has fewer than 2 direct signals (absolute minimum)
   *
   * Returns the number of themes archived.
   */
  private async archiveWeakProvisionalThemes(workspaceId: string): Promise<number> {
    const cutoff = new Date(
      Date.now() - this.MAX_PROVISIONAL_AGE_DAYS * 24 * 60 * 60 * 1000,
    );

    // Find old PROVISIONAL themes with < 2 signals
    const candidates = await this.prisma.theme.findMany({
      where: {
        workspaceId,
        status: 'PROVISIONAL',
        createdAt: { lt: cutoff },
      },
      select: {
        id: true,
        _count: { select: { feedbacks: true } },
      },
    });

    const toArchive = candidates.filter((t) => t._count.feedbacks < 2);

    if (toArchive.length === 0) return 0;

    await this.prisma.theme.updateMany({
      where: {
        id: { in: toArchive.map((t) => t.id) },
      },
      data: { status: 'ARCHIVED' },
    });

    this.logger.log(
      `[Refine] Archived ${toArchive.length} weak PROVISIONAL themes in workspace ${workspaceId}`,
    );

    return toArchive.length;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RefinementSummary {
  workspaceId: string;
  promoted: number;
  archived: number;
  merged: number;
  labelled: number;
  trends: number;
  skipped: boolean;
  error?: boolean;
}

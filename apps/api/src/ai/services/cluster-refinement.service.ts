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
 *   1. PROMOTE  — Upgrade PROVISIONAL themes to AI_GENERATED when they meet the
 *                 dynamic minimum support threshold (≥ dynamicMinSupport signals).
 *   2. MERGE    — Run the convergent auto-merge pass to collapse near-duplicate
 *                 clusters (delegates to AutoMergeService).
 *   3. ARCHIVE  — Mark weak PROVISIONAL themes as ARCHIVED only when they are older
 *                 than MAX_PROVISIONAL_AGE_DAYS AND still below min support AND
 *                 no suitable merge target exists.
 *   4. LABEL    — Refresh stale shortLabels for all active themes
 *                 (delegates to ThemeLabelService).
 *   5. TREND    — Recompute velocity and trend signals for all active themes
 *                 (delegates to TrendComputationService).
 *
 * ARCHIVE POLICY:
 *   - Merge is always attempted BEFORE archive.
 *   - A theme is archived only when it is truly isolated (no merge target with
 *     similarity >= MERGE_SIMILARITY_FLOOR) AND older than MAX_PROVISIONAL_AGE_DAYS.
 *   - Bootstrap workspaces (≤ 20 active themes) use a relaxed age cutoff
 *     (MAX_PROVISIONAL_AGE_DAYS × 2) to prevent premature archiving.
 *
 * DYNAMIC THRESHOLDS:
 *   - dynamicMinSupport = max(1, ceil(log2(N + 1)))
 *     where N = total active (non-ARCHIVED) theme count in the workspace.
 *   - This ensures small workspaces (N=5) use minSupport=1 while
 *     large workspaces (N=50) use minSupport=6.
 *
 * INVOCATION:
 *   - Can be triggered manually via the /api/ai/refine-clusters endpoint.
 *   - Safe to call concurrently — uses per-workspace locking via a simple
 *     in-memory Set to prevent overlapping runs.
 */
@Injectable()
export class ClusterRefinementService {
  private readonly logger = new Logger(ClusterRefinementService.name);

  /**
   * Maximum age (days) before an unsupported PROVISIONAL theme is archived.
   * Extended from 14 → 30 days to prevent premature archiving of valid small themes.
   */
  private readonly MAX_PROVISIONAL_AGE_DAYS = 30;

  /**
   * Minimum cosine similarity for a merge-before-archive attempt.
   * If no neighbour exceeds this, the theme is archived.
   */
  private readonly MERGE_SIMILARITY_FLOOR = 0.6;

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
      this.logger.debug(
        `[Refine] Workspace ${workspaceId} already running — skipping`,
      );
      return {
        workspaceId,
        promoted: 0,
        archived: 0,
        merged: 0,
        labelled: 0,
        trends: 0,
        skipped: true,
      };
    }

    this.runningWorkspaces.add(workspaceId);
    const start = Date.now();

    try {
      this.logger.log(
        `[Refine] Starting refinement for workspace ${workspaceId}`,
      );

      // Step 1: Compute dynamic min support based on active theme count
      const dynamicMinSupport =
        await this.computeDynamicMinSupport(workspaceId);
      this.logger.debug(
        `[Refine] dynamicMinSupport=${dynamicMinSupport} for workspace ${workspaceId}`,
      );

      // Step 2: Promote PROVISIONAL → AI_GENERATED (correct post-AI status)
      const promoted = await this.promoteProvisionalThemes(
        workspaceId,
        dynamicMinSupport,
      );

      // Step 3: Convergent merge pass BEFORE archive so weak themes get a chance
      // to merge into a stronger neighbour rather than being discarded.
      const mergeResult = await this.autoMerge.detectAndMerge(workspaceId, {
        autoExecute: true,
        userId: 'system',
      });
      const merged = mergeResult.mergedCount;

      // Step 4: Archive only truly isolated, old, weak PROVISIONAL themes
      // (after merge pass so recently-merged themes are not double-counted)
      const archived = await this.archiveWeakProvisionalThemes(workspaceId);

      // Step 5: Refresh stale labels
      const labelResult =
        await this.labelService.generateLabelsForWorkspace(workspaceId);
      const labelled = labelResult.processed;

      // Step 6: Recompute trends
      const trendResult =
        await this.trendService.computeWorkspaceTrends(workspaceId);
      const trends = trendResult?.processed ?? 0;

      const durationMs = Date.now() - start;
      this.logger.log(
        `[Refine] Workspace ${workspaceId} done in ${durationMs}ms — ` +
          `promoted=${promoted} merged=${merged} archived=${archived} labelled=${labelled} trends=${trends}`,
      );

      return {
        workspaceId,
        promoted,
        archived,
        merged,
        labelled,
        trends,
        skipped: false,
      };
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

    this.logger.log(
      `[Refine] Running refinement for ${activeWorkspaces.length} active workspaces`,
    );

    const results: RefinementSummary[] = [];
    for (const { id } of activeWorkspaces) {
      try {
        const summary = await this.refineWorkspace(id);
        results.push(summary);
      } catch {
        // Already logged in refineWorkspace — continue with next workspace
        results.push({
          workspaceId: id,
          promoted: 0,
          archived: 0,
          merged: 0,
          labelled: 0,
          trends: 0,
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
   * Formula: max(1, ceil(log2(N + 1)))
   * where N = total active (non-ARCHIVED) theme count in the workspace.
   *
   * Using theme count (not feedback count) so the threshold scales with
   * cluster density rather than raw volume.
   *
   * Examples:
   *   N=5   → max(1, ceil(log2(6)))  = max(1, 3) = 3
   *   N=10  → max(1, ceil(log2(11))) = max(1, 4) = 4
   *   N=20  → max(1, ceil(log2(21))) = max(1, 5) = 5
   *   N=50  → max(1, ceil(log2(51))) = max(1, 6) = 6
   *
   * Bootstrap mode (N ≤ 5): minSupport = 1 so every surviving theme is promoted.
   */
  private async computeDynamicMinSupport(workspaceId: string): Promise<number> {
    const activeThemeCount = await this.prisma.theme.count({
      where: { workspaceId, status: { not: 'ARCHIVED' } },
    });
    // Bootstrap: single-item themes are valid when the workspace is small
    if (activeThemeCount <= 5) return 1;
    return Math.max(1, Math.ceil(Math.log2(activeThemeCount + 1)));
  }

  /**
   * Promote PROVISIONAL themes to AI_GENERATED when they have enough signals.
   *
   * A theme is promoted when:
   *   - Its status is PROVISIONAL
   *   - Its _count.feedbacks >= dynamicMinSupport
   *
   * AI_GENERATED is the correct post-AI-processing status.
   * STABLE is reserved for human-verified themes.
   *
   * Returns the number of themes promoted.
   */
  private async promoteProvisionalThemes(
    workspaceId: string,
    dynamicMinSupport: number,
  ): Promise<number> {
    const candidates = await this.prisma.$queryRaw<
      Array<{ id: string; feedbackCount: number }>
    >`
      SELECT t.id, COUNT(tf.*)::int AS "feedbackCount"
      FROM "Theme" t
      LEFT JOIN "ThemeFeedback" tf ON tf."themeId" = t.id
      WHERE t."workspaceId" = ${workspaceId}
        AND t.status = 'PROVISIONAL'
      GROUP BY t.id
    `;

    const toPromote = candidates.filter(
      (t) => t.feedbackCount >= dynamicMinSupport,
    );

    if (toPromote.length === 0) return 0;

    await this.prisma.theme.updateMany({
      where: {
        id: { in: toPromote.map((t) => t.id) },
      },
      data: { status: 'AI_GENERATED' },
    });

    this.logger.log(
      `[Refine] Promoted ${toPromote.length} PROVISIONAL → AI_GENERATED in workspace ${workspaceId}`,
    );

    return toPromote.length;
  }

  /**
   * Archive PROVISIONAL themes that are too old and still have insufficient signals.
   *
   * ARCHIVE POLICY (all conditions must be true):
   *   1. Status is PROVISIONAL (AI_GENERATED and STABLE themes are NEVER archived here)
   *   2. Created more than ageCutoffDays ago
   *   3. Has fewer than 2 direct signals (absolute minimum)
   *   4. No suitable merge target exists (similarity >= MERGE_SIMILARITY_FLOOR)
   *
   * Bootstrap workspaces (≤ 20 active themes) use 2× the age cutoff to give
   * small workspaces more time to accumulate evidence.
   *
   * Returns the number of themes archived.
   */
  private async archiveWeakProvisionalThemes(
    workspaceId: string,
  ): Promise<number> {
    const activeThemeCount = await this.prisma.theme.count({
      where: { workspaceId, status: { not: 'ARCHIVED' } },
    });

    // Bootstrap workspaces get a relaxed cutoff (60 days instead of 30)
    const ageCutoffDays =
      activeThemeCount <= 20
        ? this.MAX_PROVISIONAL_AGE_DAYS * 2
        : this.MAX_PROVISIONAL_AGE_DAYS;

    const cutoff = new Date(Date.now() - ageCutoffDays * 24 * 60 * 60 * 1000);

    // Find old PROVISIONAL themes with < 2 signals
    const candidates = await this.prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        hasEmbedding: boolean;
        feedbackCount: number;
      }>
    >`
      SELECT
        t.id,
        t.title,
        (t.embedding IS NOT NULL) AS "hasEmbedding",
        COUNT(tf.*)::int AS "feedbackCount"
      FROM "Theme" t
      LEFT JOIN "ThemeFeedback" tf ON tf."themeId" = t.id
      WHERE t."workspaceId" = ${workspaceId}
        AND t.status = 'PROVISIONAL'
        AND t."createdAt" < ${cutoff}
      GROUP BY t.id, t.title, t.embedding
      HAVING COUNT(tf.*) < 2;
    `;
    const weakCandidates = candidates;

    if (weakCandidates.length === 0) return 0;

    let archived = 0;

    for (const candidate of weakCandidates) {
      // Attempt merge-before-archive: find the nearest active neighbour
      if (candidate.hasEmbedding) {
        const neighbours = await this.prisma.$queryRaw<
          Array<{
            id: string;
            title: string;
            sim: number;
          }>
        >`
          SELECT
            t.id,
            t.title,
            1 - (t.embedding <=> (SELECT embedding FROM "Theme" WHERE id = ${candidate.id})) AS sim
          FROM "Theme" t
          WHERE t."workspaceId" = ${workspaceId}
            AND t.embedding IS NOT NULL
            AND t.status != 'ARCHIVED'
            AND t.id != ${candidate.id}
          ORDER BY sim DESC
          LIMIT 1;
        `;

        const nearest = neighbours[0];
        if (nearest && nearest.sim >= this.MERGE_SIMILARITY_FLOOR) {
          // Merge feedback into nearest neighbour before archiving
          await this.prisma.$executeRaw`
            INSERT INTO "ThemeFeedback" ("themeId", "feedbackId", "assignedBy", "confidence", "assignedAt")
            SELECT
              ${nearest.id}::text,
              tf."feedbackId",
              tf."assignedBy",
              tf."confidence",
              NOW()
            FROM "ThemeFeedback" tf
            WHERE tf."themeId" = ${candidate.id}
            ON CONFLICT ("themeId", "feedbackId") DO NOTHING;
          `;
          await this.prisma.themeFeedback.deleteMany({
            where: { themeId: candidate.id },
          });
          await this.prisma.theme.update({
            where: { id: candidate.id },
            data: { status: 'ARCHIVED' },
          });
          this.logger.log(
            `[Refine] Merged weak PROVISIONAL "${candidate.title}" (${candidate.id}) ` +
              `→ "${nearest.title}" (${nearest.id}, sim=${nearest.sim.toFixed(3)}) then archived`,
          );
          archived++;
          continue;
        }

        // No suitable merge target — keep as hidden candidate (do not archive yet)
        // unless the theme is truly isolated (no neighbour at all or sim very low)
        if (!nearest || nearest.sim < 0.3) {
          await this.prisma.theme.update({
            where: { id: candidate.id },
            data: { status: 'ARCHIVED' },
          });
          this.logger.log(
            `[Refine] Archived isolated PROVISIONAL "${candidate.title}" (${candidate.id}) ` +
              `[nearest sim=${nearest?.sim?.toFixed(3) ?? 'n/a'} < 0.30, age > ${ageCutoffDays}d]`,
          );
          archived++;
        } else {
          // Similarity is between 0.30 and MERGE_SIMILARITY_FLOOR — keep as hidden candidate
          this.logger.debug(
            `[Refine] Keeping weak PROVISIONAL "${candidate.title}" (${candidate.id}) as hidden candidate ` +
              `[nearest sim=${nearest.sim.toFixed(3)}, age > ${ageCutoffDays}d]`,
          );
        }
      } else {
        // No embedding — cannot determine similarity; archive as orphan
        await this.prisma.theme.update({
          where: { id: candidate.id },
          data: { status: 'ARCHIVED' },
        });
        this.logger.log(
          `[Refine] Archived no-embedding PROVISIONAL "${candidate.title}" (${candidate.id})`,
        );
        archived++;
      }
    }

    if (archived > 0) {
      this.logger.log(
        `[Refine] Archived ${archived} weak PROVISIONAL themes in workspace ${workspaceId} ` +
          `(age cutoff: ${ageCutoffDays}d, bootstrap: ${activeThemeCount <= 20})`,
      );
    }

    return archived;
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

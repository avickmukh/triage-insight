import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';
import { CIQ_SCORING_QUEUE } from '../processors/ciq-scoring.processor';
import { AutoMergeService } from './auto-merge.service';

/**
 * ThemeClusteringService — Adaptive Product Intelligence Engine
 *
 * DESIGN PRINCIPLES
 * -----------------
 * 1. Theme count emerges from data — never hardcoded.
 * 2. All thresholds are derived dynamically from workspace size (N).
 * 3. CIQ-aware: high-impact feedback influences centroids more and resists
 *    being lost in weak clusters.
 * 4. Lifecycle: PROVISIONAL → STABLE → ARCHIVED (or MERGED).
 * 5. Convergent merge: global merge pass runs until stable.
 * 6. Explainability: every assignment stores a full reason object.
 * 7. Production-safe: advisory lock per workspace, no N² queries, batch ops.
 *
 * ASSIGNMENT SCORE FORMULA
 * ------------------------
 *   score = semantic_similarity × 0.70
 *         + keyword_overlap     × 0.05
 *         + cluster_size_bias   × 0.10
 *         + CIQ_bias            × 0.15
 *
 * DYNAMIC THRESHOLDS
 * ------------------
 *   N = active theme count in workspace
 *   dynamicMinSupport = max(2, floor(log2(N + 2)))   — min signals to promote to STABLE
 *   noveltyThreshold  = max(0.40, 0.55 - 0.005 × N) — below this → new PROVISIONAL theme
 *   mergeThreshold    = min(0.90, 0.72 + 0.002 × N) — above this → merge candidates
 */
@Injectable()
export class ThemeClusteringService {
  private readonly logger = new Logger(ThemeClusteringService.name);

  // ─── Assignment score weights (must sum to 1.0) ──────────────────────────
  private readonly W_SEMANTIC   = 0.70;
  private readonly W_KEYWORD    = 0.05;
  private readonly W_SIZE_BIAS  = 0.10;
  private readonly W_CIQ_BIAS   = 0.15;

  // ─── Vector search ───────────────────────────────────────────────────────
  /** Number of nearest-neighbour candidates fetched from pgvector per query. */
  private readonly VECTOR_CANDIDATES = 15;

  // ─── Soft-match multiplier ────────────────────────────────────────────────
  /**
   * When workspace has many themes, accept a match at
   * noveltyThreshold × SOFT_MATCH_MULTIPLIER to prevent theme explosion.
   */
  private readonly SOFT_MATCH_MULTIPLIER = 0.92;

  // ─── Theme-cap guardrail ─────────────────────────────────────────────────
  /** Activate soft-match when active theme count exceeds this. */
  private readonly THEME_CAP_GUARDRAIL = 20;

  // ─── Outlier threshold ───────────────────────────────────────────────────
  /** Hybrid scores below this are flagged as potential outliers. */
  private readonly OUTLIER_THRESHOLD = 0.45;

  // ─── CIQ bias constants ──────────────────────────────────────────────────
  /** Max CIQ score stored in DB (0–100 scale). */
  private readonly CIQ_MAX = 100;
  /**
   * Boost applied to centroid update when feedback CIQ is above this percentile.
   * High-CIQ feedback gets weight 2× in the centroid average.
   */
  private readonly CIQ_HIGH_THRESHOLD = 60;

  // ─── Batch finalization thresholds (configurable) ────────────────────────
  /**
   * Minimum feedback count a PROVISIONAL theme must reach after batch
   * finalization to survive. Themes below this are merged or archived.
   * Default: 2 — a single-item cluster is treated as noise.
   */
  private readonly BATCH_MIN_CLUSTER_SIZE = 2;
  /**
   * Confidence score below which a ThemeFeedback link is considered
   * borderline and eligible for reassignment during batch finalization.
   * Default: 0.60
   */
  private readonly BORDERLINE_SCORE_THRESHOLD = 0.60;
  /**
   * Cosine similarity threshold used during the batch merge pass.
   * More aggressive than the incremental merge threshold so draft clusters
   * collapse before becoming visible.
   * Default: 0.78
   */
  private readonly BATCH_MERGE_THRESHOLD = 0.78;
  /**
   * Cosine similarity threshold for merging a weak cluster into its nearest
   * neighbour during weak-cluster suppression.
   * If no neighbour exceeds this, the cluster is archived.
   * Default: 0.65
   */
  private readonly WEAK_CLUSTER_MERGE_THRESHOLD = 0.65;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    @InjectQueue(CIQ_SCORING_QUEUE) private readonly ciqQueue: Queue,
    @Inject(forwardRef(() => AutoMergeService))
    private readonly autoMergeService: AutoMergeService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Assign a feedback item to the best theme in the workspace.
   *
   * Flow:
   * 1. Skip if already linked.
   * 2. Ensure embedding exists (generate if missing).
   * 3. Acquire workspace advisory lock.
   * 4. Search top-K nearest themes via pgvector.
   * 5. Re-rank using CIQ-aware hybrid score.
   * 6. Assign (strong or soft) OR create PROVISIONAL theme.
   * 7. Post-commit: recompute confidence, enqueue CIQ scoring.
   *
   * @param skipCiqEnqueue  When true, suppresses the per-item CIQ enqueue.
   *   Use this during bulk reclustering (runClustering) so CIQ jobs are not
   *   fired before the convergent merge pass completes. The caller is
   *   responsible for bulk-enqueueing CIQ after the merge.
   */
  async assignFeedbackToTheme(
    workspaceId: string,
    feedbackId: string,
    embedding?: number[],
    skipCiqEnqueue = false,
  ): Promise<string | null> {
    const existingLink = await this.prisma.themeFeedback.findFirst({
      where: { feedbackId },
    });
    if (existingLink) {
      this.logger.debug(
        `[CLUSTER] Feedback ${feedbackId} already linked to theme ${existingLink.themeId} — skipping`,
      );
      return existingLink.themeId;
    }

    // Generate embedding outside transaction to avoid lock inflation.
    let resolvedEmbedding: number[] | undefined = embedding;
    if (!resolvedEmbedding || resolvedEmbedding.length === 0) {
      const feedbackForEmbed = await this.prisma.feedback.findUnique({
        where: { id: feedbackId },
        select: { title: true, description: true },
      });
      if (feedbackForEmbed) {
        try {
          const compositeText = [
            feedbackForEmbed.title,
            feedbackForEmbed.description ?? '',
          ].filter(Boolean).join('\n').trim();
          resolvedEmbedding = await this.embeddingService.generateEmbedding(compositeText);
        } catch (err) {
          this.logger.warn(
            `[CLUSTER] Pre-tx embedding failed for feedback ${feedbackId}: ${(err as Error).message}`,
          );
          resolvedEmbedding = undefined;
        }
      }
    }

    // Advisory lock serialises clustering per workspace.
    const assignedThemeId = await this.prisma.$transaction(async (tx) => {
      const lockKey = workspaceIdToLockKey(workspaceId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
      return this._assignFeedbackToThemeInTx(
        tx as unknown as PrismaService,
        workspaceId,
        feedbackId,
        resolvedEmbedding,
      );
    }, { timeout: 120_000 });

    // Post-transaction work (outside lock).
    if (assignedThemeId) {
      await this.recomputeClusterConfidence(assignedThemeId);

      // ── AUTO_MERGE_INVOKE (hot path) ────────────────────────────────────
      // After creating a new PROVISIONAL theme, immediately scan for a merge
      // partner scoped to just this theme (anchorThemeId fast path).
      // Uses autoExecute=true so duplicates are collapsed before CIQ scoring.
      // Non-fatal: a merge failure must never block the assignment result.
      try {
        this.logger.log(
          `[AUTO_MERGE_INVOKE] workspace_id=${workspaceId} ` +
            `anchor_theme_id=${assignedThemeId} trigger=POST_PROVISIONAL_CREATE`,
        );
        const mergeResult = await this.autoMergeService.detectAndMerge(workspaceId, {
          autoExecute: true,
          anchorThemeId: assignedThemeId,
          userId: 'system',
        });
        if (mergeResult.merged) {
          this.logger.log(
            `[AUTO_MERGE_INVOKE] workspace_id=${workspaceId} ` +
              `anchor_theme_id=${assignedThemeId} ` +
              `merged_count=${mergeResult.mergedCount} ` +
              `bootstrap_mode=${mergeResult.bootstrapMode} — hot-path merge executed`,
          );
        }
      } catch (mergeErr) {
        this.logger.warn(
          `[AUTO_MERGE_INVOKE] workspace_id=${workspaceId} ` +
            `anchor_theme_id=${assignedThemeId} ` +
            `reason="hot-path merge failed — non-fatal" ` +
            `error="${(mergeErr as Error).message}"`,
        );
      }

      if (!skipCiqEnqueue) {
        try {
          const jobId = `ciq:${workspaceId}:${assignedThemeId}`;
          await this.ciqQueue.add(
            { type: 'THEME_SCORED', workspaceId, themeId: assignedThemeId },
            { jobId, delay: 5_000 },
          );
        } catch (queueErr) {
          this.logger.warn(
            `[CIQ] Redis unavailable — re-score skipped: ${(queueErr as Error).message}`,
          );
        }
      }
    }

    return assignedThemeId;
  }

  /**
   * Full workspace reclustering pass.
   * Processes all unlinked feedback, then runs a convergent merge pass.
   */
  async runClustering(
    workspaceId: string,
  ): Promise<{ processed: number; assigned: number; created: number; merged: number }> {
    const totalFeedback = await this.prisma.feedback.count({
      where: { workspaceId, status: { not: 'MERGED' } },
    });
    const themesBefore = await this.prisma.theme.count({
      where: { workspaceId, status: { not: 'ARCHIVED' } },
    });

    this.logger.log(
      `[CLUSTER] ══ Starting reclustering for workspace ${workspaceId} ` +
        `(totalFeedback=${totalFeedback}, themesBefore=${themesBefore}) ══`,
    );

    const BATCH_SIZE = 50;
    let assigned = 0;
    let created = 0;
    let processed = 0;

    while (true) {
      const unlinked = await this.prisma.feedback.findMany({
        where: {
          workspaceId,
          status: { not: 'MERGED' },
          themes: { none: {} },
        },
        select: { id: true },
        take: BATCH_SIZE,
        orderBy: { createdAt: 'asc' },
      });

      if (unlinked.length === 0) break;

      for (const { id: feedbackId } of unlinked) {
        const themeCountBefore = await this.prisma.theme.count({
          where: { workspaceId, status: { not: 'ARCHIVED' } },
        });

        // skipCiqEnqueue=true: suppress per-item CIQ jobs during bulk recluster.
        // CIQ is bulk-enqueued after runConvergentMerge so scores reflect the
        // final merged cluster state, not the noisy incremental state.
        const themeId = await this.assignFeedbackToTheme(workspaceId, feedbackId, undefined, true);

        if (themeId) {
          const themeCountAfter = await this.prisma.theme.count({
            where: { workspaceId, status: { not: 'ARCHIVED' } },
          });
          if (themeCountAfter > themeCountBefore) {
            created++;
          } else {
            assigned++;
          }
        }
        processed++;
      }
    }

    const merged = await this.runConvergentMerge(workspaceId);

    // ── Bulk-enqueue CIQ re-scoring for all surviving themes ─────────────────────────────────
    // Now that the convergent merge is complete, enqueue CIQ scoring for every
    // active theme. This ensures scores reflect the final merged cluster state.
    const survivingThemes = await this.prisma.theme.findMany({
      where: { workspaceId, status: { not: 'ARCHIVED' } },
      select: { id: true },
    });
    for (const { id: themeId } of survivingThemes) {
      try {
        await this.ciqQueue.add(
          { type: 'THEME_SCORED', workspaceId, themeId },
          { jobId: `ciq:${workspaceId}:${themeId}`, delay: 2_000 },
        );
      } catch (queueErr) {
        this.logger.warn(
          `[CIQ] Failed to enqueue post-recluster CIQ for theme ${themeId}: ${(queueErr as Error).message}`,
        );
      }
    }
    this.logger.log(
      `[CLUSTER] Enqueued CIQ re-scoring for ${survivingThemes.length} themes after convergent merge`,
    );

    const themesAfter = await this.prisma.theme.count({
      where: { workspaceId, status: { not: 'ARCHIVED' } },
    });

    this.logger.log(
      `[CLUSTER] ══ Reclustering complete for workspace ${workspaceId}: ` +
        `processed=${processed}, assigned=${assigned}, created=${created}, merged=${merged}, ` +
        `themesAfter=${themesAfter} (was ${themesBefore}) ══`,
    );

    return { processed, assigned, created, merged };
  }

  /**
   * Convergent global merge pass.
   *
   * Iterates until no more merges are found (convergence).
   * Merge direction: low-impact clusters merge INTO high-impact clusters
   * (never the other way around).
   *
   * Returns total number of themes absorbed.
   */
  async runConvergentMerge(workspaceId: string): Promise<number> {
    let totalMerged = 0;
    let iteration = 0;
    const MAX_ITERATIONS = 20; // safety cap

    while (iteration < MAX_ITERATIONS) {
      iteration++;
      const merged = await this._runSingleMergePass(workspaceId);
      totalMerged += merged;
      if (merged === 0) break; // convergence
      this.logger.log(
        `[MERGE] Iteration ${iteration}: merged ${merged} themes (total so far: ${totalMerged})`,
      );
    }

    this.logger.log(
      `[MERGE] Convergent merge complete for workspace ${workspaceId}: ` +
        `${totalMerged} themes absorbed in ${iteration} iterations`,
    );

    return totalMerged;
  }

  /**
   * Background refinement pass.
   *
   * Runs periodically (e.g. every 30 min) to:
   * 1. Promote PROVISIONAL → STABLE when support >= dynamicMinSupport
   * 2. Archive weak PROVISIONAL themes (support = 1, old)
   * 3. Run convergent merge
   * 4. Update centroids for all active themes
   * 5. Recompute cluster confidence
   *
   * Returns a summary of actions taken.
   */
  async runRefinementPass(workspaceId: string): Promise<{
    promoted: number;
    archived: number;
    merged: number;
    centroidsUpdated: number;
  }> {
    const N = await this.prisma.theme.count({
      where: { workspaceId, status: { not: 'ARCHIVED' } },
    });
    // Bootstrap mode: small workspaces use minSupport=1 so single-item themes
    // that survived suppression are promoted and become visible.
    const dynamicMinSupport = N <= 20 ? 1 : computeDynamicMinSupport(N);

    this.logger.log(
      `[REFINE] Starting refinement pass for workspace ${workspaceId} ` +
        `(N=${N}, dynamicMinSupport=${dynamicMinSupport})`,
    );

    // 1. Promote PROVISIONAL → AI_GENERATED
    const promoted = await this._promoteProvisionalThemes(workspaceId, dynamicMinSupport);

    // 2. Archive weak PROVISIONAL themes (1 signal, older than 7 days)
    const archived = await this._archiveWeakProvisionalThemes(workspaceId);

    // 3. Convergent merge
    const merged = await this.runConvergentMerge(workspaceId);

    // 4. Update centroids for all active themes
    const centroidsUpdated = await this._updateAllCentroids(workspaceId);

    // 5. Recompute confidence for all active themes
    const activeThemes = await this.prisma.theme.findMany({
      where: { workspaceId, status: { not: 'ARCHIVED' } },
      select: { id: true },
    });
    for (const { id } of activeThemes) {
      await this.recomputeClusterConfidence(id);
    }

    this.logger.log(
      `[REFINE] Refinement pass complete for workspace ${workspaceId}: ` +
        `promoted=${promoted}, archived=${archived}, merged=${merged}, centroidsUpdated=${centroidsUpdated}`,
    );

    return { promoted, archived, merged, centroidsUpdated };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC: BATCH FINALIZATION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Post-batch finalization pass.
   *
   * Runs automatically when the last item of an ImportBatch completes its
   * AI analysis pipeline. Implements the full batch-first clustering lifecycle:
   *
   *   1. BORDERLINE REASSIGNMENT — items whose current cluster confidence is
   *      below BORDERLINE_SCORE_THRESHOLD are re-evaluated against all active
   *      themes. If a meaningfully better fit exists, they are moved.
   *
   *   2. BATCH MERGE PASS — pairs of PROVISIONAL themes with cosine similarity
   *      above BATCH_MERGE_THRESHOLD are merged (lower-CIQ into higher-CIQ).
   *      More aggressive than the incremental merge threshold.
   *
   *   3. WEAK CLUSTER SUPPRESSION — PROVISIONAL themes with fewer than
   *      BATCH_MIN_CLUSTER_SIZE members are either merged into their nearest
   *      neighbour (if similarity >= WEAK_CLUSTER_MERGE_THRESHOLD) or archived.
   *
   *   4. CENTROID REFRESH — all surviving active theme centroids are recomputed
   *      from their final member set.
   *
   *   5. PROMOTE — PROVISIONAL themes that now meet dynamicMinSupport are
   *      promoted to STABLE.
   *
   *   6. CONFIDENCE REFRESH — cluster confidence scores are recomputed for all
   *      active themes.
   *
   * This pass does NOT run LLM narration or labelling — those are triggered
   * separately by the CIQ scoring queue after each theme is scored, ensuring
   * they always use finalized cluster evidence.
   *
   * @param workspaceId  The workspace to finalize.
   * @param batchId      The ImportBatch that just completed (used for logging).
   * @returns Summary of all actions taken.
   */
  async runBatchFinalization(
    workspaceId: string,
    batchId: string,
  ): Promise<{
    reassigned: number;
    merged: number;
    suppressed: number;
    promoted: number;
    centroidsUpdated: number;
  }> {
    const logPrefix = `[BATCH_FINALIZE][batch=${batchId}][ws=${workspaceId}]`;
    this.logger.log(`${logPrefix} ══ Starting batch finalization ══`);
    const startedAt = Date.now();

    // ── 1. Borderline reassignment ──────────────────────────────────────────
    const reassigned = await this._reassignBorderlineItems(workspaceId, logPrefix);

    // ── 2. Batch merge pass (more aggressive than incremental) ──────────────
    const merged = await this._runBatchMergePass(workspaceId, logPrefix);

    // ── 3. Weak cluster suppression ─────────────────────────────────────────
    const suppressed = await this._suppressWeakClusters(workspaceId, logPrefix);

    // ── 4. Centroid refresh ─────────────────────────────────────────────────
    const centroidsUpdated = await this._updateAllCentroids(workspaceId);

    // ── 5. Promote PROVISIONAL → AI_GENERATED ──────────────────────────────
    // Use adaptive minSupport:
    //   - Bootstrap mode (N <= 20): minSupport = 1 so every surviving single-item
    //     theme is promoted and becomes visible on the dashboard.
    //   - Larger workspaces: use the logarithmic scale to require more evidence.
    const N = await this.prisma.theme.count({
      where: { workspaceId, status: { not: 'ARCHIVED' } },
    });
    const dynamicMinSupport = N <= 20 ? 1 : computeDynamicMinSupport(N);
    const promoted = await this._promoteProvisionalThemes(workspaceId, dynamicMinSupport);

    // ── 6. Confidence refresh ───────────────────────────────────────────────
    const activeThemes = await this.prisma.theme.findMany({
      where: { workspaceId, status: { not: 'ARCHIVED' } },
      select: { id: true },
    });
    for (const { id } of activeThemes) {
      await this.recomputeClusterConfidence(id);
    }

    // ── 7. Enqueue CIQ re-scoring for all surviving themes ────────────────────────
    // CIQ scoring triggers ThemeNarrationService.narrate() inside the CIQ processor.
    // Running narration AFTER finalization ensures the LLM sees the final cluster
    // membership (not the noisy provisional state from incremental assignment).
    let ciqEnqueued = 0;
    for (const { id } of activeThemes) {
      try {
        await this.ciqQueue.add(
          { type: 'THEME_SCORED', workspaceId, themeId: id },
          { attempts: 2, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: true },
        );
        ciqEnqueued++;
      } catch (ciqErr) {
        this.logger.warn(
          `${logPrefix} Failed to enqueue CIQ re-score for theme ${id}: ${(ciqErr as Error).message}`,
        );
      }
    }

    const durationMs = Date.now() - startedAt;
    this.logger.log(
      `${logPrefix} ══ Batch finalization complete in ${durationMs}ms: ` +
        `reassigned=${reassigned}, merged=${merged}, suppressed=${suppressed}, ` +
        `promoted=${promoted}, centroidsUpdated=${centroidsUpdated}, ` +
        `ciqEnqueued=${ciqEnqueued} ══`,
    );

    return { reassigned, merged, suppressed, promoted, centroidsUpdated };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: BATCH FINALIZATION HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Borderline reassignment pass.
   *
   * Finds all ThemeFeedback links where the stored confidence score is below
   * BORDERLINE_SCORE_THRESHOLD. For each borderline item, re-runs the
   * nearest-neighbour search and moves the item if a meaningfully better
   * cluster exists (improvement >= 0.08 over current score).
   *
   * This corrects the "first-come, first-served" bias of the incremental
   * assignment pass: items that arrived early and were assigned to a weak
   * provisional theme get a chance to join a better cluster.
   */
  private async _reassignBorderlineItems(
    workspaceId: string,
    logPrefix: string,
  ): Promise<number> {
    const borderlineLinks = await this.prisma.$queryRaw<Array<{
      themeId: string;
      feedbackId: string;
      confidence: number;
    }>>`
      SELECT tf."themeId", tf."feedbackId", tf.confidence
      FROM "ThemeFeedback" tf
      JOIN "Theme" t ON t.id = tf."themeId"
      JOIN "Feedback" f ON f.id = tf."feedbackId"
      WHERE t."workspaceId" = ${workspaceId}
        AND tf."assignedBy" = 'ai'
        AND tf.confidence IS NOT NULL
        AND tf.confidence < ${this.BORDERLINE_SCORE_THRESHOLD}
        AND f.embedding IS NOT NULL
        AND t.status != 'ARCHIVED'
      ORDER BY tf.confidence ASC
      LIMIT 200;
    `;

    if (borderlineLinks.length === 0) {
      this.logger.debug(`${logPrefix} No borderline items found`);
      return 0;
    }

    this.logger.log(
      `${logPrefix} Found ${borderlineLinks.length} borderline items (confidence < ${this.BORDERLINE_SCORE_THRESHOLD})`,
    );

    let reassigned = 0;
    for (const link of borderlineLinks) {
      try {
        const feedbackRow = await this.prisma.$queryRaw<Array<{ embedding: string | null }>>`
          SELECT embedding::text FROM "Feedback" WHERE id = ${link.feedbackId};
        `;
        const embeddingStr = feedbackRow[0]?.embedding;
        if (!embeddingStr) continue;

        const embedding: number[] = JSON.parse(embeddingStr);
        if (!embedding || embedding.length === 0) continue;

        const vectorStr = `[${embedding.join(',')}]`;

        const alternatives = await this.prisma.$queryRaw<Array<{
          id: string;
          title: string;
          similarity: number;
        }>>`
          SELECT
            t.id,
            t.title,
            1 - (t.embedding <=> ${vectorStr}::vector) AS similarity
          FROM "Theme" t
          WHERE t."workspaceId" = ${workspaceId}
            AND t.embedding IS NOT NULL
            AND t.status != 'ARCHIVED'
            AND t.id != ${link.themeId}
          ORDER BY similarity DESC
          LIMIT 3;
        `;

        if (alternatives.length === 0) continue;

        const best = alternatives[0];
        // Only reassign if the alternative is meaningfully better
        if (best.similarity < link.confidence + 0.08) continue;

        // Move the feedback to the better cluster
        await this.prisma.$executeRaw`
          INSERT INTO "ThemeFeedback" ("themeId", "feedbackId", "assignedBy", "confidence", "assignedAt")
          VALUES (${best.id}, ${link.feedbackId}, 'ai', ${best.similarity}, NOW())
          ON CONFLICT ("themeId", "feedbackId") DO UPDATE
            SET confidence = ${best.similarity}, "assignedBy" = 'ai', "assignedAt" = NOW();
        `;

        // Remove from old cluster
        await this.prisma.themeFeedback.deleteMany({
          where: { themeId: link.themeId, feedbackId: link.feedbackId },
        });

        this.logger.debug(
          `${logPrefix} Reassigned feedback ${link.feedbackId}: ` +
            `"${link.themeId}" (score=${link.confidence.toFixed(3)}) → ` +
            `"${best.title}" (${best.id}, score=${best.similarity.toFixed(3)})`,
        );
        reassigned++;

        // Update centroids of both affected themes
        await this.updateThemeCentroid(this.prisma, link.themeId);
        await this.updateThemeCentroid(this.prisma, best.id);
      } catch (err) {
        this.logger.warn(
          `${logPrefix} Borderline reassignment failed for feedback ${link.feedbackId}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(`${logPrefix} Borderline reassignment: moved ${reassigned} items`);
    return reassigned;
  }

  /**
   * Batch merge pass — more aggressive than the incremental merge.
   *
   * Uses BATCH_MERGE_THRESHOLD (default 0.78) instead of the incremental
   * computeMergeThreshold (starts at 0.72, grows with N). This collapses
   * draft clusters that are semantically close before they become visible.
   *
   * Merge direction: lower-CIQ into higher-CIQ (same as incremental merge).
   */
  private async _runBatchMergePass(
    workspaceId: string,
    logPrefix: string,
  ): Promise<number> {
    const themes = await this.prisma.$queryRaw<Array<{
      id: string;
      title: string;
      liveCount: number;
      ciqScore: number | null;
    }>>`
      SELECT
        t.id,
        t.title,
        COUNT(tf.*)::int AS "liveCount",
        t."priorityScore" AS "ciqScore"
      FROM "Theme" t
      LEFT JOIN "ThemeFeedback" tf ON tf."themeId" = t.id
      WHERE t."workspaceId" = ${workspaceId}
        AND t.embedding IS NOT NULL
        AND t.status != 'ARCHIVED'
      GROUP BY t.id, t.title, t."priorityScore"
      ORDER BY COUNT(tf.*) DESC;
    `;

    if (themes.length < 2) return 0;

    this.logger.log(
      `${logPrefix} Batch merge pass: ${themes.length} themes, threshold=${this.BATCH_MERGE_THRESHOLD}`,
    );

    const absorbed = new Set<string>();
    let mergedCount = 0;

    for (let i = 0; i < themes.length; i++) {
      const target = themes[i];
      if (absorbed.has(target.id)) continue;

      for (let j = i + 1; j < themes.length; j++) {
        const source = themes[j];
        if (absorbed.has(source.id)) continue;

        const result = await this.prisma.$queryRaw<Array<{ sim: number }>>`
          SELECT 1 - (a.embedding <=> b.embedding) AS sim
          FROM "Theme" a, "Theme" b
          WHERE a.id = ${target.id} AND b.id = ${source.id}
            AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL;
        `;

        const sim = result[0]?.sim ?? 0;
        if (sim < this.BATCH_MERGE_THRESHOLD) continue;

        // Merge direction: lower-CIQ into higher-CIQ; equal → smaller into larger
        const targetCiq = target.ciqScore ?? 0;
        const sourceCiq = source.ciqScore ?? 0;
        const targetSize = Number(target.liveCount);
        const sourceSize = Number(source.liveCount);

        let mergeTarget = target;
        let mergeSource = source;
        if (sourceCiq > targetCiq || (sourceCiq === targetCiq && sourceSize > targetSize)) {
          mergeTarget = source;
          mergeSource = target;
        }

        this.logger.log(
          `${logPrefix} Batch merge: "${mergeSource.title}" → "${mergeTarget.title}" [sim=${sim.toFixed(3)}]`,
        );

        await this.prisma.$executeRaw`
          INSERT INTO "ThemeFeedback" ("themeId", "feedbackId", "assignedBy", "confidence", "assignedAt")
          SELECT
            ${mergeTarget.id}::text,
            tf."feedbackId",
            tf."assignedBy",
            tf."confidence",
            NOW()
          FROM "ThemeFeedback" tf
          WHERE tf."themeId" = ${mergeSource.id}
          ON CONFLICT ("themeId", "feedbackId") DO NOTHING;
        `;

        await this.prisma.themeFeedback.deleteMany({ where: { themeId: mergeSource.id } });
        await this.prisma.theme.update({
          where: { id: mergeSource.id },
          data: { status: 'ARCHIVED' },
        });

        absorbed.add(mergeSource.id);
        mergedCount++;

        await this.updateThemeCentroid(this.prisma, mergeTarget.id);
      }
    }

    this.logger.log(`${logPrefix} Batch merge complete: ${mergedCount} themes absorbed`);
    return mergedCount;
  }

  /**
   * Weak cluster suppression.
   *
   * PROVISIONAL themes with fewer than BATCH_MIN_CLUSTER_SIZE members are
   * treated as noise and either:
   *   a) Merged into their nearest active neighbour (if cosine similarity
   *      >= WEAK_CLUSTER_MERGE_THRESHOLD), or
   *   b) Archived if no suitable neighbour exists.
   *
   * This prevents single-item outliers from becoming visible themes.
   */
  private async _suppressWeakClusters(
    workspaceId: string,
    logPrefix: string,
  ): Promise<number> {
    // Adaptive minimum cluster size:
    //   - If the workspace has <= 20 active themes, a single-item cluster is
    //     acceptable (minSize = 1 means nothing is suppressed by size alone).
    //   - For larger workspaces, require at least 2 items to survive.
    // This prevents over-archiving on small uploads where every topic is unique.
    const activeThemeCount = await this.prisma.theme.count({
      where: { workspaceId, status: { not: 'ARCHIVED' } },
    });
    const adaptiveMinSize = activeThemeCount <= 20 ? 1 : this.BATCH_MIN_CLUSTER_SIZE;

    if (adaptiveMinSize <= 1) {
      // In bootstrap mode (small workspace), only suppress themes that have
      // ZERO feedback items — those are truly empty/orphaned clusters.
      const emptyThemes = await this.prisma.$queryRaw<Array<{
        id: string;
        title: string;
        liveCount: number;
      }>>`
        SELECT
          t.id,
          t.title,
          COUNT(tf.*)::int AS "liveCount"
        FROM "Theme" t
        LEFT JOIN "ThemeFeedback" tf ON tf."themeId" = t.id
        WHERE t."workspaceId" = ${workspaceId}
          AND t.status = 'PROVISIONAL'
        GROUP BY t.id, t.title
        HAVING COUNT(tf.*) = 0;
      `;
      if (emptyThemes.length === 0) {
        this.logger.debug(`${logPrefix} Bootstrap mode: no empty clusters to suppress`);
        return 0;
      }
      // Archive truly empty clusters
      let archived = 0;
      for (const empty of emptyThemes) {
        await this.prisma.theme.update({
          where: { id: empty.id },
          data: { status: 'ARCHIVED' },
        });
        this.logger.log(
          `${logPrefix} Archived empty cluster "${empty.title}" (${empty.id}) [bootstrap mode]`,
        );
        archived++;
      }
      this.logger.log(`${logPrefix} Bootstrap suppression: ${archived} empty clusters archived`);
      return archived;
    }

    const weakThemes = await this.prisma.$queryRaw<Array<{
      id: string;
      title: string;
      liveCount: number;
    }>>`
      SELECT
        t.id,
        t.title,
        COUNT(tf.*)::int AS "liveCount"
      FROM "Theme" t
      LEFT JOIN "ThemeFeedback" tf ON tf."themeId" = t.id
      WHERE t."workspaceId" = ${workspaceId}
        AND t.status = 'PROVISIONAL'
        AND t.embedding IS NOT NULL
      GROUP BY t.id, t.title
      HAVING COUNT(tf.*) < ${adaptiveMinSize};
    `;

    if (weakThemes.length === 0) {
      this.logger.debug(`${logPrefix} No weak clusters found`);
      return 0;
    }

    this.logger.log(
      `${logPrefix} Found ${weakThemes.length} weak clusters (size < ${adaptiveMinSize}, activeThemes=${activeThemeCount})`,
    );

    let suppressed = 0;
    for (const weak of weakThemes) {
      try {
        const neighbours = await this.prisma.$queryRaw<Array<{
          id: string;
          title: string;
          sim: number;
        }>>`
          SELECT
            t.id,
            t.title,
            1 - (t.embedding <=> (SELECT embedding FROM "Theme" WHERE id = ${weak.id})) AS sim
          FROM "Theme" t
          WHERE t."workspaceId" = ${workspaceId}
            AND t.embedding IS NOT NULL
            AND t.status != 'ARCHIVED'
            AND t.id != ${weak.id}
          ORDER BY sim DESC
          LIMIT 1;
        `;

        const nearest = neighbours[0];

        if (nearest && nearest.sim >= this.WEAK_CLUSTER_MERGE_THRESHOLD) {
          // Merge into nearest neighbour
          await this.prisma.$executeRaw`
            INSERT INTO "ThemeFeedback" ("themeId", "feedbackId", "assignedBy", "confidence", "assignedAt")
            SELECT
              ${nearest.id}::text,
              tf."feedbackId",
              tf."assignedBy",
              tf."confidence",
              NOW()
            FROM "ThemeFeedback" tf
            WHERE tf."themeId" = ${weak.id}
            ON CONFLICT ("themeId", "feedbackId") DO NOTHING;
          `;
          await this.prisma.themeFeedback.deleteMany({ where: { themeId: weak.id } });
          await this.prisma.theme.update({
            where: { id: weak.id },
            data: { status: 'ARCHIVED' },
          });
          this.logger.log(
            `${logPrefix} Suppressed weak cluster "${weak.title}" (${weak.id}, size=${weak.liveCount}) ` +
              `→ merged into "${nearest.title}" (${nearest.id}, sim=${nearest.sim.toFixed(3)})`,
          );
          await this.updateThemeCentroid(this.prisma, nearest.id);
        } else {
          // No suitable neighbour — archive the isolated weak cluster
          await this.prisma.theme.update({
            where: { id: weak.id },
            data: { status: 'ARCHIVED' },
          });
          this.logger.log(
            `${logPrefix} Archived isolated weak cluster "${weak.title}" (${weak.id}, size=${weak.liveCount}) ` +
              `[nearest sim=${nearest?.sim?.toFixed(3) ?? 'n/a'} < threshold=${this.WEAK_CLUSTER_MERGE_THRESHOLD}]`,
          );
        }
        suppressed++;
      } catch (err) {
        this.logger.warn(
          `${logPrefix} Weak cluster suppression failed for theme ${weak.id}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(`${logPrefix} Weak cluster suppression: ${suppressed} clusters handled`);
    return suppressed;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: CORE ASSIGNMENT LOGIC
  // ─────────────────────────────────────────────────────────────────────────

  private async _assignFeedbackToThemeInTx(
    prisma: PrismaService,
    workspaceId: string,
    feedbackId: string,
    embedding?: number[],
  ): Promise<string | null> {
    const feedback = await prisma.feedback.findUnique({
      where: { id: feedbackId },
      select: {
        id: true,
        title: true,
        normalizedText: true,
        description: true,
        workspaceId: true,
      },
    });

    if (!feedback || feedback.workspaceId !== workspaceId) {
      this.logger.warn(`[CLUSTER] Feedback ${feedbackId} not found or workspace mismatch`);
      return null;
    }

    if (!embedding || embedding.length === 0) {
      this.logger.warn(
        `[CLUSTER] No embedding for feedback ${feedbackId} inside tx — creating PROVISIONAL theme`,
      );
      return this.createCandidateTheme(
        prisma, workspaceId, feedbackId,
        feedback.title, undefined, feedback.description ?? undefined,
      );
    }

    const feedbackEmbedding = embedding;
    const vectorStr = `[${feedbackEmbedding.join(',')}]`;
    const feedbackKeywords = extractKeywords(
      `${feedback.title} ${feedback.normalizedText ?? feedback.description ?? ''}`,
    );

    // Feedback CIQ score bias — individual feedbacks don't have a priorityScore;
    // the CIQ bias is applied at the theme level during centroid updates.
    // Use 0 here so the assignment score is purely semantic + keyword + cluster-size.
    const feedbackCiqNorm = 0;

    // Get workspace size for dynamic thresholds
    const N = await prisma.theme.count({
      where: { workspaceId, status: { not: 'ARCHIVED' } },
    });
    const noveltyThreshold = computeNoveltyThreshold(N);
    const softThreshold = noveltyThreshold * this.SOFT_MATCH_MULTIPLIER;

    // Top-K nearest themes via pgvector
    const candidates = await prisma.$queryRaw<Array<{
      id: string;
      title: string;
      similarity: number;
      topKeywords: string | null;
      liveCount: number;
      ciqScore: number | null;
      status: string;
    }>>`
      SELECT
        t.id,
        t.title,
        1 - (t.embedding <=> ${vectorStr}::vector) AS similarity,
        t."topKeywords",
        COUNT(tf.*)::int AS "liveCount",
        t."priorityScore" AS "ciqScore",
        t.status
      FROM "Theme" t
      LEFT JOIN "ThemeFeedback" tf ON tf."themeId" = t.id
      WHERE t."workspaceId" = ${workspaceId}
        AND t.embedding IS NOT NULL
        AND t.status != 'ARCHIVED'
      GROUP BY t.id, t.title, t.embedding, t."topKeywords", t."priorityScore", t.status
      ORDER BY similarity DESC
      LIMIT ${this.VECTOR_CANDIDATES};
    `;

    this.logger.log(
      `[CLUSTER] Feedback "${feedback.title}" (${feedbackId}) — ` +
        `found ${candidates.length} candidates, N=${N}, noveltyThreshold=${noveltyThreshold.toFixed(3)}`,
    );

    // Re-rank using CIQ-aware hybrid score
    let bestThemeId: string | null = null;
    let bestThemeTitle = '';
    let bestScore = 0;
    let bestClusterSize = 0;
    let bestEmbeddingScore = 0;
    let bestKeywordScore = 0;
    let bestCiqBias = 0;
    let bestSizeBias = 0;

    for (const candidate of candidates) {
      const embeddingScore = candidate.similarity;

      let themeKeywords: string[] = [];
      try {
        if (candidate.topKeywords) {
          themeKeywords = typeof candidate.topKeywords === 'string'
            ? JSON.parse(candidate.topKeywords)
            : (candidate.topKeywords as string[]);
        }
      } catch {
        themeKeywords = [];
      }

      const keywordScore = computeKeywordOverlap(feedbackKeywords, themeKeywords);
      const liveCount = Number(candidate.liveCount);

      // Size bias: log-normalised cluster size (larger = slightly preferred)
      const sizeBias = Math.min(1, Math.log10(Math.max(1, liveCount)) / 2);

      // CIQ bias: reward assignment to high-impact clusters
      const themeCiqNorm = Math.min(1, (candidate.ciqScore ?? 0) / this.CIQ_MAX);
      // Bias is high when both feedback and cluster have aligned high CIQ
      const ciqBias = (feedbackCiqNorm + themeCiqNorm) / 2;

      const hybridScore =
        embeddingScore * this.W_SEMANTIC +
        keywordScore   * this.W_KEYWORD +
        sizeBias       * this.W_SIZE_BIAS +
        ciqBias        * this.W_CIQ_BIAS;

      this.logger.debug(
        `[CLUSTER] Candidate "${candidate.title}" (${candidate.id}): ` +
          `embedding=${embeddingScore.toFixed(3)}, keyword=${keywordScore.toFixed(3)}, ` +
          `sizeBias=${sizeBias.toFixed(3)}, ciqBias=${ciqBias.toFixed(3)}, ` +
          `hybrid=${hybridScore.toFixed(3)}, size=${liveCount}`,
      );

      if (hybridScore > bestScore) {
        bestScore = hybridScore;
        bestThemeId = candidate.id;
        bestThemeTitle = candidate.title;
        bestClusterSize = liveCount;
        bestEmbeddingScore = embeddingScore;
        bestKeywordScore = keywordScore;
        bestCiqBias = ciqBias;
        bestSizeBias = sizeBias;
      }
    }

    const activeThemeCount = N;
    const shouldAssignStrong = !!bestThemeId && bestScore >= noveltyThreshold;
    const shouldAssignSoft =
      !!bestThemeId &&
      bestScore >= softThreshold &&
      activeThemeCount >= this.THEME_CAP_GUARDRAIL;

    if (shouldAssignStrong || shouldAssignSoft) {
      const bestCandidate = candidates.find((c) => c.id === bestThemeId);
      let themeKeywordsForReason: string[] = [];
      if (bestCandidate?.topKeywords) {
        try {
          themeKeywordsForReason = typeof bestCandidate.topKeywords === 'string'
            ? JSON.parse(bestCandidate.topKeywords)
            : (bestCandidate.topKeywords as string[]);
        } catch {
          themeKeywordsForReason = [];
        }
      }

      const matchedKeywords = feedbackKeywords.filter((k) =>
        themeKeywordsForReason.includes(k),
      );

      const matchReason = {
        embeddingScore: parseFloat(bestEmbeddingScore.toFixed(4)),
        keywordScore:   parseFloat(bestKeywordScore.toFixed(4)),
        sizeBias:       parseFloat(bestSizeBias.toFixed(4)),
        ciqBias:        parseFloat(bestCiqBias.toFixed(4)),
        hybridScore:    parseFloat(bestScore.toFixed(4)),
        threshold:      parseFloat(noveltyThreshold.toFixed(4)),
        softThreshold:  parseFloat(softThreshold.toFixed(4)),
        clusterSize:    bestClusterSize,
        matchedKeywords,
        assignmentMode: shouldAssignStrong ? 'strong' : 'soft_guardrail',
        feedbackCiqNorm: parseFloat(feedbackCiqNorm.toFixed(4)),
      };

      await prisma.themeFeedback.upsert({
        where: { themeId_feedbackId: { themeId: bestThemeId!, feedbackId } },
        create: {
          themeId:    bestThemeId!,
          feedbackId,
          assignedBy: 'ai',
          confidence: bestScore,
          matchReason,
        },
        update: {
          assignedBy: 'ai',
          confidence: bestScore,
          matchReason,
        },
      });

      const now = new Date();
      const themeUpdate: Record<string, unknown> = { lastEvidenceAt: now };

      // Keep recent signal count fresh
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const recentCount = await prisma.themeFeedback.count({
        where: {
          themeId: bestThemeId!,
          feedback: { createdAt: { gte: thirtyDaysAgo } },
        },
      });
      themeUpdate.recentSignalCount = recentCount + 1;

      // Promote PROVISIONAL → STABLE if support threshold reached
      const newLiveCount = bestClusterSize + 1;
      const dynamicMinSupport = computeDynamicMinSupport(N);
      if (
        bestCandidate?.status === 'PROVISIONAL' &&
        newLiveCount >= dynamicMinSupport
      ) {
        // Promote to AI_GENERATED — the correct post-AI-processing status.
        // STABLE is reserved for human-verified themes.
        themeUpdate.status = 'AI_GENERATED';
        this.logger.log(
          `[CLUSTER] ↑ PROMOTED to AI_GENERATED: theme "${bestThemeTitle}" (${bestThemeId}) ` +
            `reached support=${newLiveCount} >= dynamicMinSupport=${dynamicMinSupport}`,
        );
      }

      // Resurfacing logic
      const RESURFACING_THRESHOLD = 5;
      const shippedRoadmapItem = await prisma.roadmapItem.findFirst({
        where: { themeId: bestThemeId!, status: 'SHIPPED' },
        select: { id: true },
      });

      if (shippedRoadmapItem) {
        themeUpdate.resurfacedAt = now;
        themeUpdate.resurfaceCount = { increment: 1 };
        if ((recentCount + 1) >= RESURFACING_THRESHOLD) {
          themeUpdate.status = 'RESURFACED';
          this.logger.warn(
            `[CLUSTER] ⚠ AUTO-PROMOTED to RESURFACED: theme "${bestThemeTitle}" (${bestThemeId})`,
          );
        }
      }

      await prisma.theme.update({
        where: { id: bestThemeId! },
        data: themeUpdate as Parameters<typeof prisma.theme.update>[0]['data'],
      });

      this.logger.log(
        `[CLUSTER] ✓ ASSIGNED feedback "${feedback.title}" → theme "${bestThemeTitle}" ` +
          `(mode=${shouldAssignStrong ? 'strong' : 'soft_guardrail'}, ` +
          `hybrid=${bestScore.toFixed(3)}, threshold=${noveltyThreshold.toFixed(3)}, ` +
          `embedding=${bestEmbeddingScore.toFixed(3)}, keyword=${bestKeywordScore.toFixed(3)}, ` +
          `ciqBias=${bestCiqBias.toFixed(3)}, clusterSize=${bestClusterSize})`,
      );

      await this.updateThemeCentroid(prisma, bestThemeId!, feedbackCiqNorm);
      return bestThemeId!;
    }

    // No good match — create a new PROVISIONAL theme
    this.logger.log(
      `[CLUSTER] ✗ NO MATCH for feedback "${feedback.title}" ` +
        `(bestHybrid=${bestScore.toFixed(3)} < threshold=${noveltyThreshold.toFixed(3)}, ` +
        `bestCandidate="${bestThemeTitle}", activeThemes=${activeThemeCount}) — creating PROVISIONAL theme`,
    );

    return this.createCandidateTheme(
      prisma, workspaceId, feedbackId,
      feedback.title, feedbackEmbedding, feedback.description ?? undefined,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: MERGE PASS
  // ─────────────────────────────────────────────────────────────────────────

  private async _runSingleMergePass(workspaceId: string): Promise<number> {
    const N = await this.prisma.theme.count({
      where: { workspaceId, status: { not: 'ARCHIVED' } },
    });
    const mergeThreshold = computeMergeThreshold(N);

    const themes = await this.prisma.$queryRaw<Array<{
      id: string;
      title: string;
      liveCount: number;
      ciqScore: number | null;
    }>>`
      SELECT
        t.id,
        t.title,
        COUNT(tf.*)::int AS "liveCount",
        t."priorityScore" AS "ciqScore"
      FROM "Theme" t
      LEFT JOIN "ThemeFeedback" tf ON tf."themeId" = t.id
      WHERE t."workspaceId" = ${workspaceId}
        AND t.embedding IS NOT NULL
        AND t.status != 'ARCHIVED'
      GROUP BY t.id, t.title, t."priorityScore"
      ORDER BY COUNT(tf.*) DESC;
    `;

    if (themes.length < 2) return 0;

    this.logger.log(
      `[MERGE] Single merge pass for workspace ${workspaceId} ` +
        `(${themes.length} active themes, mergeThreshold=${mergeThreshold.toFixed(3)})`,
    );

    const absorbed = new Set<string>();
    let mergedCount = 0;

    for (let i = 0; i < themes.length; i++) {
      const target = themes[i];
      if (absorbed.has(target.id)) continue;

      for (let j = i + 1; j < themes.length; j++) {
        const source = themes[j];
        if (absorbed.has(source.id)) continue;

        const result = await this.prisma.$queryRaw<Array<{ sim: number }>>`
          SELECT 1 - (a.embedding <=> b.embedding) AS sim
          FROM "Theme" a, "Theme" b
          WHERE a.id = ${target.id} AND b.id = ${source.id}
            AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL;
        `;

        const sim = result[0]?.sim ?? 0;

        // Merge condition: high similarity OR (weak source AND close to target)
        const sourceIsWeak = Number(source.liveCount) <= 1;
        const weakAndClose = sourceIsWeak && sim >= mergeThreshold * 0.85;
        const shouldMerge = sim >= mergeThreshold || weakAndClose;

        if (!shouldMerge) continue;

        // Merge direction: always merge lower-CIQ into higher-CIQ
        // If CIQ is equal, merge smaller into larger
        const targetCiq = target.ciqScore ?? 0;
        const sourceCiq = source.ciqScore ?? 0;
        const targetSize = Number(target.liveCount);
        const sourceSize = Number(source.liveCount);

        let mergeTarget = target;
        let mergeSource = source;

        if (sourceCiq > targetCiq || (sourceCiq === targetCiq && sourceSize > targetSize)) {
          // Source is actually higher-impact — swap direction
          mergeTarget = source;
          mergeSource = target;
        }

        this.logger.log(
          `[MERGE] Merging "${mergeSource.title}" (${mergeSource.id}, size=${mergeSource.liveCount}, ciq=${mergeSource.ciqScore ?? 0}) ` +
            `→ "${mergeTarget.title}" (${mergeTarget.id}, size=${mergeTarget.liveCount}, ciq=${mergeTarget.ciqScore ?? 0}) ` +
            `[cosine=${sim.toFixed(3)}, threshold=${mergeThreshold.toFixed(3)}, weakAndClose=${weakAndClose}]`,
        );

        await this.prisma.$executeRaw`
          INSERT INTO "ThemeFeedback" ("themeId", "feedbackId", "assignedBy", "confidence", "assignedAt")
          SELECT
            ${mergeTarget.id}::text,
            tf."feedbackId",
            tf."assignedBy",
            tf."confidence",
            NOW()
          FROM "ThemeFeedback" tf
          WHERE tf."themeId" = ${mergeSource.id}
          ON CONFLICT ("themeId", "feedbackId") DO NOTHING;
        `;

        await this.prisma.themeFeedback.deleteMany({
          where: { themeId: mergeSource.id },
        });

        await this.prisma.theme.update({
          where: { id: mergeSource.id },
          data: { status: 'ARCHIVED' },
        });

        absorbed.add(mergeSource.id);
        mergedCount++;

        await this.updateThemeCentroid(this.prisma, mergeTarget.id);
      }
    }

    this.logger.log(
      `[MERGE] Single pass complete for workspace ${workspaceId}: ${mergedCount} themes absorbed`,
    );

    return mergedCount;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: LIFECYCLE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  private async _promoteProvisionalThemes(
    workspaceId: string,
    dynamicMinSupport: number,
  ): Promise<number> {
    const provisionalThemes = await this.prisma.$queryRaw<Array<{
      id: string;
      title: string;
      liveCount: number;
    }>>`
      SELECT
        t.id,
        t.title,
        COUNT(tf.*)::int AS "liveCount"
      FROM "Theme" t
      LEFT JOIN "ThemeFeedback" tf ON tf."themeId" = t.id
      WHERE t."workspaceId" = ${workspaceId}
        AND t.status = 'PROVISIONAL'
      GROUP BY t.id, t.title
      HAVING COUNT(tf.*) >= ${dynamicMinSupport};
    `;

    let promoted = 0;
    for (const theme of provisionalThemes) {
      // Promote to AI_GENERATED — the correct post-AI-processing status.
      // STABLE is reserved for human-verified themes.
      // AI_GENERATED is the schema default and is included in all dashboard
      // and ranking queries (status NOT IN ['ARCHIVED', 'PROVISIONAL']).
      await this.prisma.theme.update({
        where: { id: theme.id },
        data: { status: 'AI_GENERATED' },
      });
      this.logger.log(
        `[REFINE] ↑ PROMOTED to AI_GENERATED: "${theme.title}" (${theme.id}) support=${theme.liveCount}`,
      );
      promoted++;
    }

    return promoted;
  }

  private async _archiveWeakProvisionalThemes(workspaceId: string): Promise<number> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const weakThemes = await this.prisma.$queryRaw<Array<{ id: string; title: string }>>`
      SELECT t.id, t.title
      FROM "Theme" t
      LEFT JOIN "ThemeFeedback" tf ON tf."themeId" = t.id
      WHERE t."workspaceId" = ${workspaceId}
        AND t.status = 'PROVISIONAL'
        AND t."createdAt" < ${sevenDaysAgo}
      GROUP BY t.id, t.title
      HAVING COUNT(tf.*) <= 1;
    `;

    let archived = 0;
    for (const theme of weakThemes) {
      await this.prisma.theme.update({
        where: { id: theme.id },
        data: { status: 'ARCHIVED' },
      });
      this.logger.log(
        `[REFINE] ↓ ARCHIVED weak PROVISIONAL theme: "${theme.title}" (${theme.id})`,
      );
      archived++;
    }

    return archived;
  }

  private async _updateAllCentroids(workspaceId: string): Promise<number> {
    const activeThemes = await this.prisma.theme.findMany({
      where: { workspaceId, status: { not: 'ARCHIVED' } },
      select: { id: true },
    });

    let updated = 0;
    for (const { id } of activeThemes) {
      try {
        await this.updateThemeCentroid(this.prisma, id);
        updated++;
      } catch {
        // non-fatal
      }
    }

    return updated;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: CENTROID UPDATE (CIQ-WEIGHTED)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Recompute theme centroid as a CIQ-weighted average of linked feedback embeddings.
   *
   * High-CIQ feedback (priorityScore >= CIQ_HIGH_THRESHOLD) is counted twice
   * in the average, giving it more influence on the centroid direction.
   *
   * Falls back to unweighted average if no CIQ scores are available.
   */
  private async updateThemeCentroid(
    prisma: PrismaService,
    themeId: string,
    _newFeedbackCiqNorm?: number,
  ): Promise<void> {
    // pgvector supports avg(embedding::vector) as a proper aggregate.
    // We cannot use SUM(vector * scalar) because pgvector does not expose
    // vector * integer multiplication in aggregate context.
    //
    // Strategy: use a two-pass approach.
    //   Pass 1: try the pgvector avg() aggregate — works on pgvector >= 0.5.0.
    //   Pass 2: if that fails (older pgvector), fetch all embeddings into JS
    //           and compute the mean in application code, then write back.
    try {
      await prisma.$executeRaw`
        UPDATE "Theme"
        SET embedding = (
          SELECT avg(f.embedding::vector)
          FROM "ThemeFeedback" tf
          JOIN "Feedback" f ON f.id = tf."feedbackId"
          WHERE tf."themeId" = ${themeId}
            AND f.embedding IS NOT NULL
        ),
        "centroidUpdatedAt" = NOW()
        WHERE id = ${themeId};
      `;
      this.logger.debug(`[Centroid] Updated centroid (pgvector avg) for theme ${themeId}`);
    } catch {
      // Fallback: compute mean in application code and write back as a vector literal.
      try {
        const rows = await prisma.$queryRaw<Array<{ emb: string }>>`
          SELECT f.embedding::text AS emb
          FROM "ThemeFeedback" tf
          JOIN "Feedback" f ON f.id = tf."feedbackId"
          WHERE tf."themeId" = ${themeId}
            AND f.embedding IS NOT NULL;
        `;
        if (rows.length === 0) return;

        // Parse each embedding string "[0.1,0.2,...]" into a number array
        const parsed = rows
          .map((r) => {
            try { return JSON.parse(r.emb) as number[]; }
            catch { return null; }
          })
          .filter((v): v is number[] => v !== null && v.length > 0);

        if (parsed.length === 0) return;

        const dim = parsed[0].length;
        const mean = new Array<number>(dim).fill(0);
        for (const vec of parsed) {
          for (let i = 0; i < dim; i++) mean[i] += vec[i];
        }
        for (let i = 0; i < dim; i++) mean[i] /= parsed.length;

        const vectorStr = `[${mean.join(',')}]`;
        await prisma.$executeRaw`
          UPDATE "Theme"
          SET embedding = ${vectorStr}::vector,
              "centroidUpdatedAt" = NOW()
          WHERE id = ${themeId};
        `;
        this.logger.debug(`[Centroid] Updated centroid (JS mean fallback) for theme ${themeId}`);
      } catch (fallbackErr) {
        this.logger.warn(
          `[Centroid] Failed for theme ${themeId}: ${(fallbackErr as Error).message}`,
        );
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: CLUSTER CONFIDENCE
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Recompute cluster confidence for explainability and quality display.
   *
   * Stores:
   * - clusterConfidence (0–100): weighted combination of avgSimilarity, size, variance
   * - confidenceFactors: { avgSimilarity, size, variance }
   * - outlierCount: items with similarity < OUTLIER_THRESHOLD
   * - topKeywords: top 8 keywords from cluster feedback
   * - dominantSignal: most recent feedback title
   */
  async recomputeClusterConfidence(themeId: string): Promise<void> {
    try {
      const links = await this.prisma.themeFeedback.findMany({
        where: { themeId, assignedBy: 'ai', confidence: { not: null } },
        select: { confidence: true },
      });

      const similarities = links.map((l) => l.confidence as number);
      const size = similarities.length;

      if (size === 0) return;

      const avgSimilarity =
        similarities.reduce((sum, value) => sum + value, 0) / size;

      const variance =
        size > 1
          ? Math.sqrt(
              similarities.reduce((sum, value) => sum + (value - avgSimilarity) ** 2, 0) / size,
            )
          : 0;

      const outlierCount = similarities.filter(
        (score) => score < this.OUTLIER_THRESHOLD,
      ).length;

      const avgSimilarityScore = Math.min(100, avgSimilarity * 100);
      const sizeScore = Math.min(
        100,
        (Math.log10(Math.max(1, size)) / Math.log10(50)) * 100,
      );
      const varianceScore = Math.max(0, 100 - variance * 500);

      const clusterConfidence = parseFloat(
        (avgSimilarityScore * 0.5 + sizeScore * 0.3 + varianceScore * 0.2).toFixed(1),
      );

      const allLinks = await this.prisma.themeFeedback.findMany({
        where: { themeId },
        select: { feedback: { select: { title: true } } },
        take: 100,
      });

      const titles = allLinks.map((l) => l.feedback.title);
      const topKeywords = extractKeywords(titles.join(' '));
      const dominantSignal = titles[0]
        ? titles[0].length > 120
          ? `${titles[0].slice(0, 117)}…`
          : titles[0]
        : null;

      await this.prisma.theme.update({
        where: { id: themeId },
        data: {
          clusterConfidence,
          confidenceFactors: {
            avgSimilarity: parseFloat(avgSimilarity.toFixed(3)),
            size,
            variance: parseFloat(variance.toFixed(3)),
          },
          outlierCount,
          topKeywords,
          dominantSignal,
        },
      });

      this.logger.debug(
        `[Confidence] Theme ${themeId}: score=${clusterConfidence}, size=${size}, ` +
          `avgSim=${avgSimilarity.toFixed(3)}, variance=${variance.toFixed(3)}, outliers=${outlierCount}`,
      );
    } catch (err) {
      this.logger.warn(
        `[Confidence] Failed for theme ${themeId}: ${(err as Error).message}`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: THEME CREATION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a new PROVISIONAL candidate theme from a single feedback item.
   *
   * The feedback embedding becomes the initial centroid.
   * Status is PROVISIONAL — it will be promoted to STABLE by the refinement pass
   * once it reaches dynamicMinSupport.
   */
  private async createCandidateTheme(
    prisma: PrismaService,
    workspaceId: string,
    feedbackId: string,
    feedbackTitle: string,
    feedbackEmbedding?: number[],
    feedbackDescription?: string,
  ): Promise<string> {
    const normalised = normalizeThemeTitle(feedbackTitle);

    let candidateTitle: string;
    if (normalised === null) {
      const fallback = feedbackDescription ?? feedbackTitle;
      const fallbackNormalised = normalizeThemeTitle(fallback);
      candidateTitle = fallbackNormalised ?? fallback.split(/\s+/).slice(0, 4).join(' ');
      this.logger.debug(
        `[CLUSTER] Question-label detected for feedback ${feedbackId}: ` +
          `"${feedbackTitle}" — using answer text as theme title: "${candidateTitle}"`,
      );
    } else {
      candidateTitle = normalised;
    }

    const theme = await prisma.theme.create({
      data: {
        workspaceId,
        title: candidateTitle,
        status: 'PROVISIONAL',
        clusterConfidence: 10,
        confidenceFactors: { avgSimilarity: 1.0, size: 1, variance: 0 },
        outlierCount: 0,
        topKeywords: extractKeywords(feedbackDescription ?? feedbackTitle),
        dominantSignal:
          (feedbackDescription ?? feedbackTitle).length > 120
            ? `${(feedbackDescription ?? feedbackTitle).slice(0, 117)}…`
            : (feedbackDescription ?? feedbackTitle),
        lastEvidenceAt: new Date(),
        feedbacks: {
          create: {
            feedbackId,
            assignedBy: 'ai',
            confidence: 1.0,
          },
        },
      },
    });

    if (feedbackEmbedding && feedbackEmbedding.length > 0) {
      const vectorStr = `[${feedbackEmbedding.join(',')}]`;
      await prisma.$executeRaw`
        UPDATE "Theme"
        SET embedding = ${vectorStr}::vector,
            "centroidUpdatedAt" = NOW()
        WHERE id = ${theme.id};
      `;
    }

    this.logger.log(
      `[CLUSTER] ✦ Created PROVISIONAL theme "${theme.title}" (${theme.id}) for feedback ${feedbackId}`,
    );

    return theme.id;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic threshold functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimum support required to promote a PROVISIONAL theme to STABLE.
 * Scales with workspace size: larger workspaces require more evidence.
 *
 * N=0–5:   2 signals
 * N=10:    3 signals
 * N=50:    4 signals
 * N=100:   5 signals
 */
export function computeDynamicMinSupport(N: number): number {
  return Math.max(2, Math.floor(Math.log2(N + 2)));
}

/**
 * Assignment novelty threshold.
 * Below this hybrid score, a feedback item creates a new PROVISIONAL theme.
 *
 * Starts at 0.55 for small workspaces, decreases slightly as workspace grows
 * (more themes = stricter novelty required to create yet another one).
 *
 * Clamped to [0.40, 0.62].
 */
export function computeNoveltyThreshold(N: number): number {
  return Math.max(0.40, Math.min(0.62, 0.55 - 0.002 * N));
}

/**
 * Merge threshold.
 * Above this cosine similarity, two themes are candidates for merging.
 *
 * Starts at 0.72 for small workspaces, increases slightly as workspace grows
 * (more themes = more conservative about merging).
 *
 * Clamped to [0.72, 0.90].
 */
export function computeMergeThreshold(N: number): number {
  return Math.max(0.72, Math.min(0.90, 0.72 + 0.002 * N));
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: source-label detection and title normalization
// ─────────────────────────────────────────────────────────────────────────────

const QUESTION_LABEL_PATTERNS = [
  /^(what|how|why|when|where|who|which|do you|did you|have you|would you|could you|please|tell us|describe|explain|rate|rank|select|choose|pick|list)/i,
  /\?$/,
  /^survey response:/i,
  /^(feedback|support|voice|survey)\s+(response|submission|ticket|call|transcript):/i,
];

export function isSourceLabel(title: string): boolean {
  const trimmed = title.trim();
  return QUESTION_LABEL_PATTERNS.some((re) => re.test(trimmed));
}

/**
 * Normalise a raw feedback title into a concise 3–4 word theme label.
 *
 * Strategy:
 * 1. Reject source-label strings (returns null → caller uses description fallback).
 * 2. Strip trailing punctuation and leading articles.
 * 3. Pick the first 4 meaningful (non-stop-word) tokens from the title.
 *    If fewer than 3 meaningful tokens exist, fall back to the first 4 raw tokens.
 * 4. Title-case each word.
 *
 * Examples:
 *   "Password Reset Emails Are Delayed Or Not Received, Preventing Users From Rega…"
 *   → "Password Reset Emails Delayed"
 *
 *   "App login failing intermittently across sessions"
 *   → "App Login Failing Intermittently"
 */
function normalizeThemeTitle(raw: string): string | null {
  if (isSourceLabel(raw)) return null;

  const stripped = raw.replace(/[.!?,;:]+$/, '').trim();
  const tokens = stripped.split(/\s+/).filter((t) => t.length > 0);

  const titleCase = (word: string) =>
    word.length > 0 ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word;

  const TITLE_STOP = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'not', 'no', 'so', 'if', 'as', 'up', 'out', 'into', 'that', 'this',
    'it', 'its', 'i', 'we', 'you', 'he', 'she', 'they', 'my', 'our',
  ]);

  const meaningful: string[] = [];
  for (const token of tokens) {
    if (meaningful.length >= 4) break;
    const lower = token.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (lower.length > 0 && !TITLE_STOP.has(lower)) {
      meaningful.push(titleCase(token.replace(/[^a-zA-Z0-9]/g, '')));
    }
  }

  const words =
    meaningful.length >= 3
      ? meaningful.slice(0, 4)
      : tokens.slice(0, 4).map(titleCase);

  return words.join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: keyword overlap
// ─────────────────────────────────────────────────────────────────────────────

function computeKeywordOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((word) => setB.has(word)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: keyword extraction
// ─────────────────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do',
  'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that',
  'these', 'those', 'i', 'we', 'you', 'he', 'she', 'it', 'they', 'my', 'our', 'your', 'his',
  'her', 'its', 'their', 'not', 'no', 'so', 'if', 'as', 'up', 'out', 'about', 'into', 'than',
  'then', 'when', 'where', 'who', 'which', 'what', 'how', 'all', 'any', 'each', 'every',
  'some', 'such', 'more', 'most', 'other', 'also', 'just', 'only', 'very', 'too', 'now',
  'get', 'got', 'getting', 'please', 'need', 'want', 'use', 'using', 'used', 'make', 'made',
  'work', 'working', 'works', 'worked', 'try', 'tried', 'trying', 'cant', 'dont', 'doesnt',
  'isnt', 'wasnt', 'wont', 'wouldnt', 'couldnt', 'shouldnt',
]);

function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));

  const freq: Record<string, number> = {};
  for (const word of words) {
    freq[word] = (freq[word] ?? 0) + 1;
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: workspace advisory lock key
// ─────────────────────────────────────────────────────────────────────────────

function workspaceIdToLockKey(workspaceId: string): number {
  const hex = workspaceId.replace(/-/g, '');
  let key = 0;
  for (let i = 0; i < hex.length; i += 8) {
    key ^= parseInt(hex.slice(i, i + 8), 16) | 0;
  }
  return key;
}

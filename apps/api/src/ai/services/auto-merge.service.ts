import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { CIQ_SCORING_QUEUE } from '../processors/ciq-scoring.processor';
import { UnifiedAggregationService } from '../../theme/services/unified-aggregation.service';
import {
  IssueDimensionService,
  IssueDimensions,
} from './issue-dimension.service';
import {
  AUTO_MERGE_THRESHOLD,
  BOOTSTRAP_MERGE_THRESHOLD,
  BOOTSTRAP_THEME_COUNT,
  BOOTSTRAP_SIZE1_RATIO,
  MERGE_EMBEDDING_WEIGHT,
  MERGE_KEYWORD_WEIGHT,
  MERGE_VECTOR_CANDIDATES,
  MERGE_MIN_ACTIONABILITY,
} from '../config/clustering-thresholds.config';

/**
 * AutoMergeService
 *
 * Automatically detects and merges duplicate themes within a workspace.
 *
 * AUTO-MERGE LOGIC (PRD Part 2):
 *   1. For each workspace, retrieve all themes that have an embedding.
 *   2. Compare each theme pair using hybrid similarity:
 *        hybridSimilarity = (embeddingSimilarity × EMBEDDING_WEIGHT) + (keywordOverlap × KEYWORD_WEIGHT)
 *   3. If hybridSimilarity >= effectiveThreshold (adaptive — see bootstrap logic below):
 *        - In `autoExecute` mode: merge immediately (larger absorbs smaller)
 *        - In suggestion mode: flag with autoMergeCandidate=true for UI review
 *   4. Merge logic:
 *        - All feedback from the source theme is re-linked to the target theme
 *        - Source theme is archived (status=ARCHIVED, not deleted) to preserve audit trail
 *        - CIQ re-scoring is triggered for the merged theme
 *
 * BOOTSTRAP / SMALL-DATASET ADAPTIVE THRESHOLDS:
 *   - Bootstrap mode activates when:
 *       • total active themes <= BOOTSTRAP_THEME_COUNT (10), OR
 *       • >= BOOTSTRAP_SIZE1_RATIO (60%) of themes have feedbackCount <= 1
 *   - In bootstrap mode, the effective threshold is relaxed to BOOTSTRAP_MERGE_THRESHOLD (0.72)
 *     instead of the normal AUTO_MERGE_THRESHOLD (0.85).
 *   - Size-1 themes are always eligible merge candidates in bootstrap mode.
 *   - This prevents theme explosion when a workspace is just starting out.
 *
 * INVOCATION:
 *   - Called immediately after a new PROVISIONAL theme is created in ThemeClusteringService
 *     (hot path, autoExecute=true, scoped to the new theme via `anchorThemeId`).
 *   - Called by ClusterRefinementService.refineWorkspace() for the full workspace scan.
 *   - Can be triggered manually via POST /api/themes/:workspaceId/auto-merge.
 *
 * STRUCTURED LOGGING:
 *   Every merge attempt emits one of:
 *     AUTO_MERGE_INVOKE, AUTO_MERGE_START, AUTO_MERGE_CANDIDATES_FOUND,
 *     AUTO_MERGE_BEST_CANDIDATE, AUTO_MERGE_SKIP, AUTO_MERGE_SUCCESS, AUTO_MERGE_ERROR
 *
 * PERFORMANCE (PRD Part 8):
 *   - Embedding comparisons are done via pgvector in a single SQL query per theme
 *   - Keyword overlap is computed in-memory from pre-loaded topKeywords
 *   - Avoids O(n²) by using pgvector ANN search (top-N candidates per theme)
 *   - Batch processing: processes themes in batches of 20
 */
@Injectable()
export class AutoMergeService {
  private readonly logger = new Logger(AutoMergeService.name);

  // ─── Thresholds ───────────────────────────────────────────────────────────

  /** Normal hybrid similarity threshold (production datasets). */
  // Merge thresholds — sourced from clustering-thresholds.config.ts
  private readonly AUTO_MERGE_THRESHOLD = AUTO_MERGE_THRESHOLD;

  /**
   * Relaxed threshold for bootstrap / small datasets.
   * Activates when workspace has <= BOOTSTRAP_THEME_COUNT active themes
   * OR >= BOOTSTRAP_SIZE1_RATIO of themes are size-1.
   */
  private readonly BOOTSTRAP_MERGE_THRESHOLD = BOOTSTRAP_MERGE_THRESHOLD;

  /** Max active theme count below which bootstrap mode activates. */
  private readonly BOOTSTRAP_THEME_COUNT = BOOTSTRAP_THEME_COUNT;

  /** Min fraction of size-1 themes that triggers bootstrap mode. */
  private readonly BOOTSTRAP_SIZE1_RATIO = BOOTSTRAP_SIZE1_RATIO;

  /** Embedding weight in hybrid similarity. */
  private readonly EMBEDDING_WEIGHT = MERGE_EMBEDDING_WEIGHT;

  /** Keyword overlap weight in hybrid similarity. */
  private readonly KEYWORD_WEIGHT = MERGE_KEYWORD_WEIGHT;

  /** Number of top candidates to retrieve from pgvector per theme. */
  private readonly VECTOR_CANDIDATES = MERGE_VECTOR_CANDIDATES;

  /** Minimum actionability compatibility required to allow a merge. */
  private readonly MERGE_MIN_ACTIONABILITY = MERGE_MIN_ACTIONABILITY;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(CIQ_SCORING_QUEUE) private readonly ciqQueue: Queue,
    private readonly issueDimensionService: IssueDimensionService,
    private readonly unifiedAggregationService: UnifiedAggregationService,
  ) {}

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Scan themes in a workspace and detect / execute duplicate merges.
   *
   * Options:
   *   autoExecute  — if true, merges are executed immediately (default: false)
   *   userId       — actor for audit trail (default: 'system')
   *   anchorThemeId — if provided, only scans for merge partners of this one theme
   *                   (fast path used after provisional theme creation)
   *
   * Returns a structured MergeResult with full explainability.
   */
  async detectAndMerge(
    workspaceId: string,
    options: {
      autoExecute?: boolean;
      userId?: string;
      anchorThemeId?: string;
    } = {},
  ): Promise<MergeResult> {
    const { autoExecute = false, userId = 'system', anchorThemeId } = options;

    // ── AUTO_MERGE_START ────────────────────────────────────────────────────
    this.logger.log(
      `[AUTO_MERGE_START] workspace_id=${workspaceId} autoExecute=${autoExecute} anchorThemeId=${anchorThemeId ?? 'ALL'}`,
    );

    // ── Load themes with embeddings ─────────────────────────────────────────
    // NOTE: embedding is Unsupported("vector") in Prisma — must use raw SQL to
    // filter for non-null, then fetch metadata via findMany.
    const themesWithEmbedding = await this.prisma.$queryRaw<
      Array<{
        id: string;
        feedbackCount: number;
      }>
    >`
      SELECT t.id, COALESCE(t."feedbackCount", 0)::int AS "feedbackCount"
      FROM "Theme" t
      WHERE t."workspaceId" = ${workspaceId}
        AND t.embedding IS NOT NULL
        AND t.status != 'ARCHIVED'
    `;

    const totalActiveThemes = themesWithEmbedding.length;

    // ── Guard: need at least 2 themes ───────────────────────────────────────
    if (totalActiveThemes < 2) {
      const reason = `Only ${totalActiveThemes} theme(s) with embeddings — need at least 2 to compare`;
      this.logger.log(
        `[AUTO_MERGE_SKIP] workspace_id=${workspaceId} reason="${reason}"`,
      );
      return {
        invoked: true,
        merged: false,
        reason,
        mergedCount: 0,
        detectedCount: 0,
        suggestions: [],
        bootstrapMode: false,
      };
    }

    // ── Detect bootstrap mode ───────────────────────────────────────────────
    const size1Count = themesWithEmbedding.filter(
      (t) => t.feedbackCount <= 1,
    ).length;
    const size1Ratio = size1Count / totalActiveThemes;
    const bootstrapMode =
      totalActiveThemes <= this.BOOTSTRAP_THEME_COUNT ||
      size1Ratio >= this.BOOTSTRAP_SIZE1_RATIO;
    const effectiveThreshold = bootstrapMode
      ? this.BOOTSTRAP_MERGE_THRESHOLD
      : this.AUTO_MERGE_THRESHOLD;

    this.logger.log(
      `[AUTO_MERGE_START] workspace_id=${workspaceId} totalThemes=${totalActiveThemes} ` +
        `size1Themes=${size1Count} size1Ratio=${size1Ratio.toFixed(2)} ` +
        `bootstrapMode=${bootstrapMode} effectiveThreshold=${effectiveThreshold}`,
    );

    // ── Load theme metadata ─────────────────────────────────────────────────
    const themeIds = themesWithEmbedding.map((t) => t.id);
    const themes = await this.prisma.theme.findMany({
      where: { id: { in: themeIds } },
      select: {
        id: true,
        title: true,
        topKeywords: true,
        feedbackCount: true,
        autoMergeCandidate: true,
      },
    });

    // ── Reset auto-merge flags for this workspace ───────────────────────────
    await this.prisma.theme.updateMany({
      where: { workspaceId },
      data: {
        autoMergeCandidate: false,
        autoMergeTargetId: null,
        autoMergeSimilarity: null,
      },
    });

    // ── Determine which themes to scan ─────────────────────────────────────
    // If anchorThemeId is provided, only scan that one theme for merge partners.
    // This is the fast path used after provisional theme creation.
    const scanThemes = anchorThemeId
      ? themes.filter((t) => t.id === anchorThemeId)
      : themes;

    if (scanThemes.length === 0) {
      const reason = anchorThemeId
        ? `anchorThemeId=${anchorThemeId} not found in workspace or has no embedding`
        : 'No themes to scan';
      this.logger.log(
        `[AUTO_MERGE_SKIP] workspace_id=${workspaceId} reason="${reason}"`,
      );
      return {
        invoked: true,
        merged: false,
        reason,
        mergedCount: 0,
        detectedCount: 0,
        suggestions: [],
        bootstrapMode,
      };
    }

    const suggestions: MergeSuggestion[] = [];
    const mergedSourceIds = new Set<string>();

    // ── Main scan loop ──────────────────────────────────────────────────────
    const BATCH_SIZE = 20;
    for (let i = 0; i < scanThemes.length; i += BATCH_SIZE) {
      const batch = scanThemes.slice(i, i + BATCH_SIZE);

      for (const theme of batch) {
        if (mergedSourceIds.has(theme.id)) continue;

        const themeSize = theme.feedbackCount ?? 0;
        const themeKeywords = parseKeywords(theme.topKeywords);

        // ── AUTO_MERGE_CANDIDATES_FOUND ────────────────────────────────────
        const candidates = await this.prisma.$queryRaw<
          Array<{
            id: string;
            title: string;
            similarity: number;
            topKeywords: string | null;
            feedbackCount: number;
          }>
        >`
          SELECT
            t.id,
            t.title,
            1 - (t.embedding <=> (
              SELECT embedding FROM "Theme" WHERE id = ${theme.id}
            )) AS similarity,
            t."topKeywords",
            COALESCE(t."feedbackCount", 0)::int AS "feedbackCount"
          FROM "Theme" t
          WHERE t."workspaceId" = ${workspaceId}
            AND t.id != ${theme.id}
            AND t.embedding IS NOT NULL
            AND t.status != 'ARCHIVED'
          ORDER BY similarity DESC
          LIMIT ${this.VECTOR_CANDIDATES};
        `;

        this.logger.debug(
          `[AUTO_MERGE_CANDIDATES_FOUND] workspace_id=${workspaceId} ` +
            `source_theme_id=${theme.id} source_theme_name="${theme.title}" ` +
            `source_size=${themeSize} candidates=${candidates.length}`,
        );

        let foundMerge = false;

        for (const candidate of candidates) {
          if (mergedSourceIds.has(candidate.id)) continue;

          const candidateKeywords = parseKeywords(candidate.topKeywords);
          const keywordScore = computeJaccard(themeKeywords, candidateKeywords);
          const hybridScore =
            candidate.similarity * this.EMBEDDING_WEIGHT +
            keywordScore * this.KEYWORD_WEIGHT;

          // ── AUTO_MERGE_BEST_CANDIDATE ──────────────────────────────────
          this.logger.debug(
            `[AUTO_MERGE_BEST_CANDIDATE] workspace_id=${workspaceId} ` +
              `source_theme_id=${theme.id} source_theme_name="${theme.title}" ` +
              `target_theme_id=${candidate.id} target_theme_name="${candidate.title}" ` +
              `source_size=${themeSize} target_size=${candidate.feedbackCount} ` +
              `score=${hybridScore.toFixed(4)} embedding_sim=${candidate.similarity.toFixed(4)} ` +
              `keyword_jaccard=${keywordScore.toFixed(4)} threshold=${effectiveThreshold}`,
          );

          if (hybridScore < effectiveThreshold) {
            // ── AUTO_MERGE_SKIP ──────────────────────────────────────────────
            this.logger.debug(
              `[AUTO_MERGE_SKIP] workspace_id=${workspaceId} ` +
                `source_theme_id=${theme.id} source_theme_name="${theme.title}" ` +
                `target_theme_id=${candidate.id} target_theme_name="${candidate.title}" ` +
                `score=${hybridScore.toFixed(4)} threshold=${effectiveThreshold} ` +
                `reason="score below threshold"`,
            );
            // Continue to next candidate (best is first; if best fails, all fail)
            break;
          }

          // ── Actionability guard ──────────────────────────────────────────────
          // Even if embedding similarity is high, block the merge if the two
          // themes have incompatible actionability dimensions. This prevents
          // semantically related but actionably distinct themes from collapsing.
          // Guard only applies when BOTH themes have extracted dimensions.
          let actionabilityCompat = 1.0; // default: allow merge (no dimensions available)
          try {
            const [sourceBreakdown, targetBreakdown] = await Promise.all([
              this.prisma.theme.findUnique({
                where: { id: theme.id },
                select: { signalBreakdown: true },
              }),
              this.prisma.theme.findUnique({
                where: { id: candidate.id },
                select: { signalBreakdown: true },
              }),
            ]);
            const sourceDims = ((sourceBreakdown?.signalBreakdown ?? {}) as Record<string, unknown>).dominantDimensions as IssueDimensions | undefined;
            const targetDims = ((targetBreakdown?.signalBreakdown ?? {}) as Record<string, unknown>).dominantDimensions as IssueDimensions | undefined;
            if (sourceDims?.actionability_signature && targetDims?.actionability_signature) {
              actionabilityCompat = this.issueDimensionService.computeCompatibility(sourceDims, targetDims);
            }
          } catch {
            actionabilityCompat = 1.0; // fail-open: don't block merge on error
          }

          if (actionabilityCompat < this.MERGE_MIN_ACTIONABILITY) {
            this.logger.log(
              `[AUTO_MERGE_SKIP] workspace_id=${workspaceId} ` +
                `source_theme_id=${theme.id} source_theme_name="${theme.title}" ` +
                `target_theme_id=${candidate.id} target_theme_name="${candidate.title}" ` +
                `score=${hybridScore.toFixed(4)} actionabilityCompat=${actionabilityCompat.toFixed(3)} ` +
                `reason="actionability incompatible (${actionabilityCompat.toFixed(2)} < ${this.MERGE_MIN_ACTIONABILITY})"`,
            );
            continue; // Try next candidate
          }

          // ── Stage 6: problem_type soft guide ────────────────────────────────────────────────────────────────────────────────────
          // DESIGN: problem_type is a SOFT GUIDE for merges, not a hard wall.
          // Rationale: The classifier may assign slightly different labels to
          // related issues (e.g. "payment_failure" vs "duplicate_charge").
          // Hard blocking prevents business-meaningful consolidation.
          //
          // Soft-guide behavior:
          //   - Compatible types (same or 'other'): merge allowed
          //   - Incompatible types: merge blocked UNLESS embedding similarity
          //     is very high (>= 0.85), which overrides the type mismatch
          const MERGE_CROSS_BUCKET_FLOOR = 0.85;
          try {
            const [sourcePTRow, targetPTRow] = await Promise.all([
              this.prisma.theme.findUnique({ where: { id: theme.id }, select: { signalBreakdown: true } }),
              this.prisma.theme.findUnique({ where: { id: candidate.id }, select: { signalBreakdown: true } }),
            ]);
            const sourcePT = ((sourcePTRow?.signalBreakdown ?? {}) as Record<string, unknown>).problemType as string | undefined ?? 'other';
            const targetPT = ((targetPTRow?.signalBreakdown ?? {}) as Record<string, unknown>).problemType as string | undefined ?? 'other';
            const ptCompatible = sourcePT === 'other' || targetPT === 'other' || sourcePT === targetPT;
            if (!ptCompatible && candidate.similarity < MERGE_CROSS_BUCKET_FLOOR) {
              this.logger.log(
                `[AUTO_MERGE_SKIP] workspace_id=${workspaceId} ` +
                  `source_theme_id=${theme.id} source_theme_name="${theme.title}" ` +
                  `target_theme_id=${candidate.id} target_theme_name="${candidate.title}" ` +
                  `reason="problem_type mismatch (${sourcePT} vs ${targetPT}) similarity=${candidate.similarity.toFixed(3)} < MERGE_CROSS_BUCKET_FLOOR"`,
              );
              continue;
            }
          } catch {
            // fail-open: if we can't read problem_type, allow the merge
          }

          // Score meets threshold — determine merge direction
          // Larger cluster absorbs smaller; equal size → higher CIQ wins
          const targetId =
            (theme.feedbackCount ?? 0) >= (candidate.feedbackCount ?? 0)
              ? theme.id
              : candidate.id;
          const sourceId = targetId === theme.id ? candidate.id : theme.id;
          const targetTitle =
            targetId === theme.id ? theme.title : candidate.title;
          const sourceTitle =
            sourceId === theme.id ? theme.title : candidate.title;
          const sourceSize =
            sourceId === theme.id ? themeSize : candidate.feedbackCount;
          const targetSize =
            targetId === theme.id ? themeSize : candidate.feedbackCount;

          // Build human-readable merge reason for explainability UI
          const mergeReason = [
            `embedding similarity ${(candidate.similarity * 100).toFixed(0)}%`,
            keywordScore > 0
              ? `keyword overlap ${(keywordScore * 100).toFixed(0)}%`
              : null,
            bootstrapMode ? 'bootstrap mode (relaxed threshold)' : null,
          ]
            .filter(Boolean)
            .join(' + ');

          suggestions.push({
            sourceId,
            targetId,
            similarity: hybridScore,
            embeddingSimilarity: candidate.similarity,
            keywordSimilarity: keywordScore,
            mergeReason,
            sourceTitle,
            targetTitle,
            sourceSize,
            targetSize,
            bootstrapMode,
          });

          if (autoExecute) {
            try {
              await this.executeMerge(
                workspaceId,
                targetId,
                sourceId,
                userId,
                hybridScore,
              );
              mergedSourceIds.add(sourceId);
              // ── AUTO_MERGE_SUCCESS ───────────────────────────────────
              this.logger.log(
                `[AUTO_MERGE_SUCCESS] workspace_id=${workspaceId} ` +
                  `source_theme_id=${sourceId} source_theme_name="${sourceTitle}" ` +
                  `target_theme_id=${targetId} target_theme_name="${targetTitle}" ` +
                  `source_size=${sourceSize} target_size=${targetSize} ` +
                  `score=${hybridScore.toFixed(4)} threshold=${effectiveThreshold} ` +
                  `bootstrapMode=${bootstrapMode}`,
              );
            } catch (mergeErr) {
              // ── AUTO_MERGE_ERROR ─────────────────────────────────────
              this.logger.error(
                `[AUTO_MERGE_ERROR] workspace_id=${workspaceId} ` +
                  `source_theme_id=${sourceId} target_theme_id=${targetId} ` +
                  `error="${(mergeErr as Error).message}"`,
                (mergeErr as Error).stack,
              );
            }
          } else {
            // Suggestion mode — flag the source theme for UI review
            await this.prisma.theme.update({
              where: { id: sourceId },
              data: {
                autoMergeCandidate: true,
                autoMergeTargetId: targetId,
                autoMergeSimilarity: parseFloat(hybridScore.toFixed(3)),
              },
            });
          }

          foundMerge = true;
          // Only merge with the best candidate per theme
          break;
        }

        if (!foundMerge) {
          this.logger.debug(
            `[AUTO_MERGE_SKIP] workspace_id=${workspaceId} ` +
              `source_theme_id=${theme.id} source_theme_name="${theme.title}" ` +
              `source_size=${themeSize} ` +
              `reason="no candidate above threshold=${effectiveThreshold}"`,
          );
        }
      }
    }

    const mergedCount = mergedSourceIds.size;
    const detectedCount = suggestions.length;

    this.logger.log(
      `[AUTO_MERGE_START] workspace_id=${workspaceId} DONE ` +
        `detected=${detectedCount} merged=${mergedCount} bootstrapMode=${bootstrapMode}`,
    );

    return {
      invoked: true,
      merged: mergedCount > 0,
      mergedCount,
      detectedCount,
      suggestions,
      bootstrapMode,
      effectiveThreshold,
    };
  }

  /**
   * Execute a single theme merge: move all feedback from sourceId to targetId,
   * archive the source theme (preserving audit trail), and trigger CIQ re-scoring.
   *
   * Side effects handled:
   *   - All ThemeFeedback links re-pointed to target (upsert, no duplicates)
   *   - Source theme archived (status=ARCHIVED) — not deleted, for audit trail
   *   - Target theme auto-merge flags cleared
   *   - Target feedbackCount updated
   *   - CIQ re-scoring enqueued for target (non-fatal if Redis is down)
   */
  async executeMerge(
    workspaceId: string,
    targetThemeId: string,
    sourceThemeId: string,
    userId: string,
    similarity?: number,
  ): Promise<{ affectedFeedbackCount: number }> {
    this.logger.log(
      `[AUTO_MERGE_SUCCESS] workspace_id=${workspaceId} ` +
        `source_theme_id=${sourceThemeId} target_theme_id=${targetThemeId} ` +
        `similarity=${similarity?.toFixed(3) ?? 'n/a'} actor=${userId} — executing merge`,
    );

    let affectedFeedbackCount = 0;

    await this.prisma.$transaction(async (tx) => {
      // Re-link all feedback from source to target (upsert — no duplicates)
      const sourceLinks = await tx.themeFeedback.findMany({
        where: { themeId: sourceThemeId },
      });
      affectedFeedbackCount = sourceLinks.length;

      for (const link of sourceLinks) {
        await tx.themeFeedback.upsert({
          where: {
            themeId_feedbackId: {
              themeId: targetThemeId,
              feedbackId: link.feedbackId,
            },
          },
          create: {
            themeId: targetThemeId,
            feedbackId: link.feedbackId,
            assignedBy: link.assignedBy,
            confidence: link.confidence,
          },
          update: {},
        });
      }

      // Remove source theme's feedback links
      await tx.themeFeedback.deleteMany({ where: { themeId: sourceThemeId } });

      // Re-point RoadmapItems from source to target so the target's roadmap
      // linkage is preserved and signal counts remain accurate.
      await tx.roadmapItem.updateMany({
        where: { themeId: sourceThemeId },
        data: { themeId: targetThemeId },
      });

      // Re-point CustomerSignals from source to target.
      await tx.customerSignal.updateMany({
        where: { themeId: sourceThemeId },
        data: { themeId: targetThemeId },
      });

      // Re-point SupportIssueCluster correlations from source to target.
      await tx.supportIssueCluster.updateMany({
        where: { themeId: sourceThemeId },
        data: { themeId: targetThemeId },
      });

      // Archive source theme (preserve for audit trail — do NOT delete)
      await tx.theme.update({
        where: { id: sourceThemeId, workspaceId },
        data: {
          status: 'ARCHIVED',
          autoMergeCandidate: false,
          autoMergeTargetId: targetThemeId,
        },
      });

      // Clear auto-merge flags on target and refresh feedbackCount
      await tx.theme.update({
        where: { id: targetThemeId },
        data: {
          autoMergeCandidate: false,
          autoMergeTargetId: null,
          autoMergeSimilarity: null,
          feedbackCount: { increment: affectedFeedbackCount },
        },
      });
    });

    // M3 FIX: Recompute unified counters immediately after merge so the
    // CIQ scorer reads fresh voiceCount/supportCount/totalSignalCount.
    // This is the incremental-merge equivalent of the M2 fix in finalization.
    try {
      await this.unifiedAggregationService.aggregateTheme(targetThemeId);
    } catch (aggErr) {
      this.logger.warn(
        `[AUTO_MERGE_ERROR] workspace_id=${workspaceId} target_theme_id=${targetThemeId} ` +
          `reason="UnifiedAggregation failed after merge" error="${(aggErr as Error).message}"`,
      );
    }

    // Trigger CIQ re-scoring for the merged (target) theme — non-fatal
    try {
      await this.ciqQueue.add(
        { type: 'THEME_SCORED', workspaceId, themeId: targetThemeId },
        { jobId: `ciq:merge:${workspaceId}:${targetThemeId}`, delay: 2_000 },
      );
    } catch (queueErr) {
      this.logger.warn(
        `[AUTO_MERGE_ERROR] workspace_id=${workspaceId} target_theme_id=${targetThemeId} ` +
          `reason="Redis unavailable — CIQ re-score skipped" error="${(queueErr as Error).message}"`,
      );
    }

    this.logger.log(
      `[AUTO_MERGE_SUCCESS] workspace_id=${workspaceId} ` +
        `source_theme_id=${sourceThemeId} target_theme_id=${targetThemeId} ` +
        `affected_feedback_count=${affectedFeedbackCount} — merge complete`,
    );

    return { affectedFeedbackCount };
  }

  /**
   * Get all pending auto-merge suggestions for a workspace.
   * Returns themes flagged as autoMergeCandidate=true with their target theme details.
   */
  async getSuggestions(workspaceId: string): Promise<
    Array<{
      sourceId: string;
      sourceTitle: string;
      targetId: string;
      targetTitle: string;
      similarity: number;
    }>
  > {
    const candidates = await this.prisma.theme.findMany({
      where: {
        workspaceId,
        autoMergeCandidate: true,
        autoMergeTargetId: { not: null },
      },
      select: {
        id: true,
        title: true,
        autoMergeTargetId: true,
        autoMergeSimilarity: true,
      },
    });

    const results: Array<{
      sourceId: string;
      sourceTitle: string;
      targetId: string;
      targetTitle: string;
      similarity: number;
    }> = [];

    for (const c of candidates) {
      if (!c.autoMergeTargetId) continue;
      const target = await this.prisma.theme.findUnique({
        where: { id: c.autoMergeTargetId },
        select: { id: true, title: true },
      });
      if (target) {
        results.push({
          sourceId: c.id,
          sourceTitle: c.title,
          targetId: target.id,
          targetTitle: target.title,
          similarity: c.autoMergeSimilarity ?? 0,
        });
      }
    }

    return results;
  }

  /**
   * Dismiss an auto-merge suggestion for a theme — clears the candidate flag
   * without executing a merge.
   */
  async dismissAutoMerge(
    workspaceId: string,
    themeId: string,
  ): Promise<{ ok: boolean }> {
    await this.prisma.theme.update({
      where: { id: themeId, workspaceId },
      data: {
        autoMergeCandidate: false,
        autoMergeTargetId: null,
        autoMergeSimilarity: null,
      },
    });
    return { ok: true };
  }

  /**
   * Alias for dismissAutoMerge used by the theme controller dismiss endpoint.
   */
  async dismissMergeCandidate(
    workspaceId: string,
    themeId: string,
  ): Promise<{ ok: boolean }> {
    return this.dismissAutoMerge(workspaceId, themeId);
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  /**
   * Determine whether a workspace is in bootstrap mode.
   * Exported for use by ThemeClusteringService to log the mode at call site.
   */
  async isBootstrapMode(workspaceId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ feedbackCount: number }>>`
      SELECT COALESCE(t."feedbackCount", 0)::int AS "feedbackCount"
      FROM "Theme" t
      WHERE t."workspaceId" = ${workspaceId}
        AND t.embedding IS NOT NULL
        AND t.status != 'ARCHIVED'
    `;
    if (rows.length <= this.BOOTSTRAP_THEME_COUNT) return true;
    const size1 = rows.filter((r) => r.feedbackCount <= 1).length;
    return size1 / rows.length >= this.BOOTSTRAP_SIZE1_RATIO;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MergeSuggestion {
  sourceId: string;
  targetId: string;
  /** Hybrid score (embedding × 0.7 + keyword × 0.3) */
  similarity: number;
  /** Raw embedding cosine similarity */
  embeddingSimilarity?: number;
  /** Keyword Jaccard overlap */
  keywordSimilarity?: number;
  /** Human-readable explanation of why these themes are similar */
  mergeReason?: string;
  sourceTitle: string;
  targetTitle: string;
  sourceSize: number;
  targetSize: number;
  bootstrapMode: boolean;
}

export interface MergeResult {
  /** Whether detectAndMerge was actually invoked (always true when returned from this method). */
  invoked: boolean;
  /** Whether at least one merge was executed (only true in autoExecute mode). */
  merged: boolean;
  /** Human-readable reason when merged=false. */
  reason?: string;
  /** Number of merges executed (autoExecute mode) or suggested (suggestion mode). */
  mergedCount: number;
  /** Number of merge pairs detected above threshold. */
  detectedCount: number;
  /** Full list of detected merge pairs. */
  suggestions: MergeSuggestion[];
  /** Whether bootstrap (relaxed) thresholds were used. */
  bootstrapMode: boolean;
  /** The effective threshold used for this scan. */
  effectiveThreshold?: number;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function parseKeywords(raw: unknown): string[] {
  if (!raw) return [];
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : (raw as string[]);
  } catch {
    return [];
  }
}

function computeJaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

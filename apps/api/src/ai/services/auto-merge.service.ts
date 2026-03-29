import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { CIQ_SCORING_QUEUE } from '../processors/ciq-scoring.processor';

/**
 * AutoMergeService
 *
 * Automatically detects and merges duplicate themes within a workspace.
 *
 * AUTO-MERGE LOGIC (PRD Part 2):
 *   1. For each workspace, retrieve all themes that have an embedding.
 *   2. Compare each theme pair using hybrid similarity:
 *        hybridSimilarity = (embeddingSimilarity × 0.7) + (keywordOverlap × 0.3)
 *   3. If hybridSimilarity > AUTO_MERGE_THRESHOLD (0.85):
 *        - Flag both themes as autoMergeCandidate = true
 *        - Store autoMergeTargetId (smaller theme absorbs into larger)
 *        - Optionally execute the merge immediately (autoExecute mode)
 *   4. Merge logic:
 *        - All feedback from the source theme is re-linked to the target theme
 *        - Source theme is deleted
 *        - CIQ re-scoring is triggered for the merged theme
 *        - Audit log entry is created
 *
 * PERFORMANCE (PRD Part 8):
 *   - Embedding comparisons are done via pgvector in a single SQL query per theme
 *   - Keyword overlap is computed in-memory from pre-loaded topKeywords
 *   - Avoids O(n²) by using pgvector ANN search (top-5 candidates per theme)
 *   - Batch processing: processes workspaces in sequence, themes in batches of 20
 */
@Injectable()
export class AutoMergeService {
  private readonly logger = new Logger(AutoMergeService.name);

  /** Hybrid similarity threshold above which two themes are considered duplicates. */
  private readonly AUTO_MERGE_THRESHOLD = 0.85;

  /** Embedding weight in hybrid similarity. */
  private readonly EMBEDDING_WEIGHT = 0.7;

  /** Keyword overlap weight in hybrid similarity. */
  private readonly KEYWORD_WEIGHT = 0.3;

  /** Number of top candidates to retrieve from pgvector per theme. */
  private readonly VECTOR_CANDIDATES = 5;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(CIQ_SCORING_QUEUE) private readonly ciqQueue: Queue,
  ) {}

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Scan all themes in a workspace and flag duplicate pairs.
   *
   * In `autoExecute` mode, merges are performed immediately.
   * In suggestion mode (default), themes are flagged with autoMergeCandidate=true
   * and autoMergeTargetId for the UI to present as suggestions.
   *
   * Returns a summary of detected and merged pairs.
   */
  async detectAndMerge(
    workspaceId: string,
    options: { autoExecute?: boolean; userId?: string } = {},
  ): Promise<{
    detected: number;
    merged: number;
    suggestions: Array<{ sourceId: string; targetId: string; similarity: number; sourceTitle: string; targetTitle: string }>;
  }> {
    const { autoExecute = false, userId = 'system' } = options;

    this.logger.log(
      `[AutoMerge] Scanning workspace ${workspaceId} (autoExecute=${autoExecute})`,
    );

    // Load all themes with embeddings and keywords
    const themes = await this.prisma.theme.findMany({
      where: {
        workspaceId,
        embedding: { not: null },
        status: { not: 'ARCHIVED' },
      },
      select: {
        id: true,
        title: true,
        topKeywords: true,
        feedbackCount: true,
        autoMergeCandidate: true,
      },
    });

    if (themes.length < 2) {
      this.logger.log(`[AutoMerge] Not enough themes to compare in workspace ${workspaceId}`);
      return { detected: 0, merged: 0, suggestions: [] };
    }

    // Reset all auto-merge flags for this workspace before re-scanning
    await this.prisma.theme.updateMany({
      where: { workspaceId },
      data: { autoMergeCandidate: false, autoMergeTargetId: null, autoMergeSimilarity: null },
    });

    const suggestions: Array<{
      sourceId: string;
      targetId: string;
      similarity: number;
      sourceTitle: string;
      targetTitle: string;
    }> = [];

    const mergedSourceIds = new Set<string>();

    // Process themes in batches to avoid overwhelming the DB
    const BATCH_SIZE = 20;
    for (let i = 0; i < themes.length; i += BATCH_SIZE) {
      const batch = themes.slice(i, i + BATCH_SIZE);

      for (const theme of batch) {
        // Skip themes already consumed by a merge in this run
        if (mergedSourceIds.has(theme.id)) continue;

        const themeKeywords = parseKeywords(theme.topKeywords);

        // Find top-N similar themes using pgvector
        const candidates = await this.prisma.$queryRaw<Array<{
          id: string;
          title: string;
          similarity: number;
          topKeywords: string | null;
          feedbackCount: number;
        }>>`
          SELECT
            t.id,
            t.title,
            1 - (t.embedding <=> (
              SELECT embedding FROM "Theme" WHERE id = ${theme.id}
            )) AS similarity,
            t."topKeywords",
            COALESCE(t."feedbackCount", 0) AS "feedbackCount"
          FROM "Theme" t
          WHERE t."workspaceId" = ${workspaceId}
            AND t.id != ${theme.id}
            AND t.embedding IS NOT NULL
            AND t.status != 'ARCHIVED'
          ORDER BY similarity DESC
          LIMIT ${this.VECTOR_CANDIDATES};
        `;

        for (const candidate of candidates) {
          if (mergedSourceIds.has(candidate.id)) continue;

          const candidateKeywords = parseKeywords(candidate.topKeywords);
          const keywordScore = computeJaccard(themeKeywords, candidateKeywords);
          const hybridScore =
            candidate.similarity * this.EMBEDDING_WEIGHT + keywordScore * this.KEYWORD_WEIGHT;

          if (hybridScore >= this.AUTO_MERGE_THRESHOLD) {
            // Determine which theme is the "target" (larger cluster absorbs smaller)
            const targetId =
              (theme.feedbackCount ?? 0) >= (candidate.feedbackCount ?? 0)
                ? theme.id
                : candidate.id;
            const sourceId = targetId === theme.id ? candidate.id : theme.id;
            const targetTitle = targetId === theme.id ? theme.title : candidate.title;
            const sourceTitle = sourceId === theme.id ? theme.title : candidate.title;

            suggestions.push({ sourceId, targetId, similarity: hybridScore, sourceTitle, targetTitle });

            if (autoExecute) {
              await this.executeMerge(workspaceId, targetId, sourceId, userId, hybridScore);
              mergedSourceIds.add(sourceId);
            } else {
              // Flag both themes as merge candidates
              await this.prisma.theme.update({
                where: { id: sourceId },
                data: {
                  autoMergeCandidate: true,
                  autoMergeTargetId: targetId,
                  autoMergeSimilarity: parseFloat(hybridScore.toFixed(3)),
                },
              });
            }

            // Only merge with the best candidate per theme
            break;
          }
        }
      }
    }

    this.logger.log(
      `[AutoMerge] Workspace ${workspaceId}: detected=${suggestions.length}, merged=${mergedSourceIds.size}`,
    );

    return {
      detected: suggestions.length,
      merged: mergedSourceIds.size,
      suggestions,
    };
  }

  /**
   * Execute a single theme merge: move all feedback from sourceId to targetId,
   * delete the source theme, and trigger CIQ re-scoring.
   */
  async executeMerge(
    workspaceId: string,
    targetThemeId: string,
    sourceThemeId: string,
    userId: string,
    similarity?: number,
  ): Promise<void> {
    this.logger.log(
      `[AutoMerge] Merging theme ${sourceThemeId} → ${targetThemeId} (similarity=${similarity?.toFixed(3) ?? 'n/a'})`,
    );

    await this.prisma.$transaction(async (tx) => {
      // Re-link all feedback from source to target
      const sourceLinks = await tx.themeFeedback.findMany({
        where: { themeId: sourceThemeId },
      });

      for (const link of sourceLinks) {
        await tx.themeFeedback.upsert({
          where: { themeId_feedbackId: { themeId: targetThemeId, feedbackId: link.feedbackId } },
          create: {
            themeId: targetThemeId,
            feedbackId: link.feedbackId,
            assignedBy: link.assignedBy,
            confidence: link.confidence,
          },
          update: {},
        });
      }

      // Remove source theme's feedback links and the theme itself
      await tx.themeFeedback.deleteMany({ where: { themeId: sourceThemeId } });
      await tx.theme.delete({ where: { id: sourceThemeId, workspaceId } });

      // Clear auto-merge flag on target
      await tx.theme.update({
        where: { id: targetThemeId },
        data: { autoMergeCandidate: false, autoMergeTargetId: null, autoMergeSimilarity: null },
      });
    });

    // Trigger CIQ re-scoring for the merged theme
    try {
      await this.ciqQueue.add({ type: 'THEME_SCORED', workspaceId, themeId: targetThemeId });
    } catch (queueErr) {
      this.logger.warn(`[AutoMerge] Redis unavailable — re-score job skipped: ${(queueErr as Error).message}`);
    }

    this.logger.log(`[AutoMerge] Merge complete: ${sourceThemeId} → ${targetThemeId}`);
  }

  /**
   * Get all pending auto-merge suggestions for a workspace.
   * Returns themes flagged as autoMergeCandidate=true with their target theme details.
   */
  async getSuggestions(workspaceId: string): Promise<Array<{
    sourceId: string;
    sourceTitle: string;
    targetId: string;
    targetTitle: string;
    similarity: number;
  }>> {
    const candidates = await this.prisma.theme.findMany({
      where: { workspaceId, autoMergeCandidate: true, autoMergeTargetId: { not: null } },
      select: {
        id: true,
        title: true,
        autoMergeTargetId: true,
        autoMergeSimilarity: true,
      },
    });

    const results = [];
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

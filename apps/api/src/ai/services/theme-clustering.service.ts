import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';
import { CIQ_SCORING_QUEUE } from '../processors/ciq-scoring.processor';

/**
 * ThemeClusteringService
 *
 * Semantic clustering using pgvector cosine similarity with hybrid scoring.
 *
 * ROOT CAUSE FIXES (2026-03-29):
 *   1. feedbackCount was always 0 — cluster size now queried live from ThemeFeedback
 *      so getDynamicThreshold() gets the real count, not the stale denormalized column.
 *   2. createCandidateTheme embedding write was outside the advisory-locked transaction
 *      (used this.prisma instead of the tx client) — now passes the tx prisma client in.
 *   3. Thresholds were too strict: THRESHOLD_NEW=0.65 with EMBEDDING_WEIGHT=0.7 meant
 *      a cosine similarity of 0.93 was needed to pass (0.93×0.7=0.65). Lowered to 0.50.
 *   4. No post-clustering merge pass — added runPostMerge() to merge themes whose
 *      centroids are within 0.82 cosine similarity after a batch completes.
 *
 * HYBRID SIMILARITY:
 *   score = (embedding_cosine × 0.7) + (keyword_jaccard × 0.3)
 *
 * DYNAMIC THRESHOLDS (based on live cluster size):
 *   ≥ 10 items → 0.72   (well-defined cluster, moderate strictness)
 *    5–9 items → 0.65
 *    1–4 items → 0.55   (growing cluster, looser)
 *      0 items → 0.50   (brand-new theme, centroid = first feedback embedding)
 *
 * PERFORMANCE:
 *   - Candidate search: single pgvector O(log n) query
 *   - Cluster size: COUNT(*) on ThemeFeedback (indexed on themeId)
 *   - Centroid update: single SQL UPDATE using pgvector avg()
 *   - Post-merge: O(k²) on theme count k (typically < 50 per workspace)
 *   - Advisory lock: serialises per-workspace, no cross-workspace blocking
 */
@Injectable()
export class ThemeClusteringService {
  private readonly logger = new Logger(ThemeClusteringService.name);

  /** Embedding similarity weight in the hybrid score. */
  private readonly EMBEDDING_WEIGHT = 0.7;

  /** Keyword overlap weight in the hybrid score. */
  private readonly KEYWORD_WEIGHT = 0.3;

  /**
   * Dynamic thresholds based on LIVE cluster size (not stale feedbackCount column).
   * Lowered from previous values to fix the "1 feedback = 1 theme" problem.
   * The effective cosine similarity needed = threshold / EMBEDDING_WEIGHT when keyword=0.
   */
  // Hybrid score = embedding×0.7 + keyword×0.3
  // Minimum cosine similarity needed (with 0 keyword overlap) = threshold / 0.7
  //
  // THRESHOLD_NEW  = 0.60 → needs cosine ≥ 0.86  (brand-new theme)
  // THRESHOLD_SMALL = 0.62 → needs cosine ≥ 0.89  (1–4 items)
  // THRESHOLD_MEDIUM = 0.68 → needs cosine ≥ 0.97  (5–9 items, well-formed)
  // THRESHOLD_LARGE  = 0.72 → needs cosine ≥ 1.03  (≥10 items, keyword overlap required)
  //
  // These values prevent over-grouping of unrelated feedback while still
  // consolidating genuinely similar items (e.g. 15 "Login issue" variants).
  private readonly THRESHOLD_LARGE  = 0.72;  // ≥ 10 items
  private readonly THRESHOLD_MEDIUM = 0.68;  //  5–9 items
  private readonly THRESHOLD_SMALL  = 0.62;  //  1–4 items
  private readonly THRESHOLD_NEW    = 0.60;  //    0 items  (brand-new theme)

  /** Hybrid score below this value marks a feedback item as a potential outlier. */
  private readonly OUTLIER_THRESHOLD = 0.50;

  /** Number of top candidates to retrieve from pgvector before hybrid re-ranking. */
  private readonly VECTOR_CANDIDATES = 10;

  /** Cosine similarity above which two themes are merged in the post-merge pass. */
  private readonly MERGE_THRESHOLD = 0.82;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    @InjectQueue(CIQ_SCORING_QUEUE) private readonly ciqQueue: Queue,
  ) {}

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Assign a single feedback item to the best-matching theme in the workspace.
   *
   * Uses hybrid similarity: embedding cosine similarity + keyword overlap.
   * Dynamic threshold is applied based on the LIVE cluster size (COUNT from DB).
   *
   * Returns the themeId the feedback was assigned to, or null if skipped.
   */
  async assignFeedbackToTheme(
    workspaceId: string,
    feedbackId: string,
    embedding?: number[],
  ): Promise<string | null> {
    // Skip if already linked to any theme
    const existingLink = await this.prisma.themeFeedback.findFirst({
      where: { feedbackId },
    });
    if (existingLink) {
      this.logger.debug(
        `[CLUSTER] Feedback ${feedbackId} already linked to theme ${existingLink.themeId} — skipping`,
      );
      return existingLink.themeId;
    }

    // ── Workspace-level advisory lock ────────────────────────────────────────
    // Serialises clustering per workspace so concurrent jobs don't race.
    // pg_advisory_xact_lock is released automatically at transaction end.
    return this.prisma.$transaction(async (tx) => {
      const lockKey = workspaceIdToLockKey(workspaceId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
      // FIX: pass the tx client so createCandidateTheme writes inside the transaction
      return this._assignFeedbackToThemeInTx(tx as unknown as PrismaService, workspaceId, feedbackId, embedding);
    }, { timeout: 60_000 });
  }

  /** Inner implementation — runs inside the advisory-locked transaction. */
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

    // Generate or reuse the feedback embedding
    let feedbackEmbedding: number[];
    try {
      feedbackEmbedding = embedding ?? await this.embeddingService.generateEmbedding(
        `${feedback.title} ${feedback.description ?? ''}`.trim(),
      );
    } catch (err) {
      this.logger.warn(
        `[CLUSTER] Embedding failed for feedback ${feedbackId}: ${(err as Error).message}. Creating new theme.`,
      );
      // FIX: pass prisma (tx client) so the embedding write is inside the transaction
      return this.createCandidateTheme(prisma, workspaceId, feedbackId, feedback.title);
    }

    const vectorStr = `[${feedbackEmbedding.join(',')}]`;
    const feedbackKeywords = extractKeywords(
      `${feedback.title} ${feedback.normalizedText ?? feedback.description ?? ''}`,
    );

    // ── Step 1: Retrieve top-N candidates by embedding similarity ─────────
    // Scoped to workspace, excludes ARCHIVED themes.
    // FIX: use live COUNT from ThemeFeedback, not stale feedbackCount column.
    const candidates = await prisma.$queryRaw<Array<{
      id: string;
      title: string;
      similarity: number;
      topKeywords: string | null;
      liveCount: number;
    }>>`
      SELECT
        t.id,
        t.title,
        1 - (t.embedding <=> ${vectorStr}::vector) AS similarity,
        t."topKeywords",
        COUNT(*)::int AS "liveCount"
      FROM "Theme" t
      LEFT JOIN "ThemeFeedback" tf ON tf."themeId" = t.id
      WHERE t."workspaceId" = ${workspaceId}
        AND t.embedding IS NOT NULL
        AND t.status != 'ARCHIVED'
      GROUP BY t.id, t.title, t.embedding, t."topKeywords"
      ORDER BY similarity DESC
      LIMIT ${this.VECTOR_CANDIDATES};
    `;

    this.logger.log(
      `[CLUSTER] Feedback "${feedback.title}" (${feedbackId}) — ` +
      `found ${candidates.length} candidates in workspace ${workspaceId}`,
    );

    // ── Step 2: Hybrid re-ranking ─────────────────────────────────────────
    let bestThemeId: string | null = null;
    let bestThemeTitle = '';
    let bestHybridScore = 0;
    let bestClusterSize = 0;
    let bestEmbeddingScore = 0;
    let bestKeywordScore = 0;

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
      const hybridScore = embeddingScore * this.EMBEDDING_WEIGHT + keywordScore * this.KEYWORD_WEIGHT;
      const liveCount = Number(candidate.liveCount);

      this.logger.debug(
        `[CLUSTER]   Candidate "${candidate.title}" (${candidate.id}): ` +
        `embedding=${embeddingScore.toFixed(3)}, keyword=${keywordScore.toFixed(3)}, ` +
        `hybrid=${hybridScore.toFixed(3)}, size=${liveCount}`,
      );

      if (hybridScore > bestHybridScore) {
        bestHybridScore = hybridScore;
        bestThemeId = candidate.id;
        bestThemeTitle = candidate.title;
        bestClusterSize = liveCount;
        bestEmbeddingScore = embeddingScore;
        bestKeywordScore = keywordScore;
      }
    }

    // ── Step 3: Apply dynamic threshold based on LIVE cluster size ────────
    const threshold = this.getDynamicThreshold(bestClusterSize);

    if (bestThemeId && bestHybridScore >= threshold) {
      await prisma.themeFeedback.upsert({
        where: { themeId_feedbackId: { themeId: bestThemeId, feedbackId } },
        create: {
          themeId: bestThemeId,
          feedbackId,
          assignedBy: 'ai',
          confidence: bestHybridScore,
        },
        update: {
          assignedBy: 'ai',
          confidence: bestHybridScore,
        },
      });

      this.logger.log(
        `[CLUSTER] ✓ ASSIGNED feedback "${feedback.title}" → theme "${bestThemeTitle}" ` +
        `(hybrid=${bestHybridScore.toFixed(3)} ≥ threshold=${threshold}, ` +
        `embedding=${bestEmbeddingScore.toFixed(3)}, keyword=${bestKeywordScore.toFixed(3)}, ` +
        `clusterSize=${bestClusterSize})`,
      );

      // Recompute cluster confidence and update centroid
      await this.recomputeClusterConfidence(bestThemeId, feedback.title);
      await this.updateThemeCentroid(prisma, bestThemeId);

      try {
        await this.ciqQueue.add({ type: 'THEME_SCORED', workspaceId, themeId: bestThemeId });
      } catch (queueErr) {
        this.logger.warn(`[CIQ] Redis unavailable — re-score skipped: ${(queueErr as Error).message}`);
      }
      return bestThemeId;
    }

    // No good match — create a new candidate theme
    this.logger.log(
      `[CLUSTER] ✗ NO MATCH for feedback "${feedback.title}" ` +
      `(bestHybrid=${bestHybridScore.toFixed(3)} < threshold=${threshold}, ` +
      `bestCandidate="${bestThemeTitle}") — creating new theme`,
    );
    // FIX: pass prisma (tx client) so the embedding write is inside the transaction
    return this.createCandidateTheme(prisma, workspaceId, feedbackId, feedback.title, feedbackEmbedding);
  }

  /**
   * Run a full workspace reclustering pass.
   *
   * Processes unlinked feedback items sequentially (advisory lock serialises per workspace).
   * After all items are processed, runs a post-merge pass to merge near-duplicate themes.
   */
  async runClustering(
    workspaceId: string,
  ): Promise<{ processed: number; assigned: number; created: number; merged: number }> {
    const totalFeedback = await this.prisma.feedback.count({ where: { workspaceId, status: { not: 'MERGED' } } });
    const themesBefore = await this.prisma.theme.count({ where: { workspaceId, status: { not: 'ARCHIVED' } } });

    this.logger.log(
      `[CLUSTER] ══ Starting reclustering for workspace ${workspaceId} ` +
      `(totalFeedback=${totalFeedback}, themesBefore=${themesBefore}) ══`,
    );

    const BATCH_SIZE = 50;
    let skip = 0;
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
        skip,
      });

      if (unlinked.length === 0) break;

      for (const { id: feedbackId } of unlinked) {
        const themeCountBefore = await this.prisma.theme.count({ where: { workspaceId } });
        const themeId = await this.assignFeedbackToTheme(workspaceId, feedbackId);
        if (themeId) {
          const themeCountAfter = await this.prisma.theme.count({ where: { workspaceId } });
          if (themeCountAfter > themeCountBefore) {
            created++;
          } else {
            assigned++;
          }
        }
        processed++;
      }

      skip += BATCH_SIZE;
    }

    // ── Post-clustering merge pass ─────────────────────────────────────────
    const merged = await this.runPostMerge(workspaceId);

    const themesAfter = await this.prisma.theme.count({ where: { workspaceId, status: { not: 'ARCHIVED' } } });

    this.logger.log(
      `[CLUSTER] ══ Reclustering complete for workspace ${workspaceId}: ` +
      `processed=${processed}, assigned=${assigned}, created=${created}, ` +
      `merged=${merged}, themesAfter=${themesAfter} (was ${themesBefore}) ══`,
    );

    return { processed, assigned, created, merged };
  }

  /**
   * Post-clustering merge pass.
   *
   * Finds pairs of themes whose centroids are within MERGE_THRESHOLD cosine similarity
   * and merges the smaller cluster into the larger one.
   *
   * This cleans up near-duplicate themes that were created before their centroids
   * were fully formed (e.g. during parallel ingestion).
   *
   * Returns the number of themes merged (absorbed).
   */
  async runPostMerge(workspaceId: string): Promise<number> {
    const themes = await this.prisma.$queryRaw<Array<{
      id: string;
      title: string;
      liveCount: number;
    }>>`
      SELECT
        t.id,
        t.title,
        COUNT(*)::int AS "liveCount"
      FROM "Theme" t
      LEFT JOIN "ThemeFeedback" tf ON tf."themeId" = t.id
      WHERE t."workspaceId" = ${workspaceId}
        AND t.embedding IS NOT NULL
        AND t.status != 'ARCHIVED'
      GROUP BY t.id, t.title
      ORDER BY COUNT(*) DESC;
    `;

    if (themes.length < 2) return 0;

    this.logger.log(
      `[MERGE] Starting post-merge pass for workspace ${workspaceId} ` +
      `(${themes.length} active themes)`,
    );

    const absorbed = new Set<string>();
    let mergedCount = 0;

    for (let i = 0; i < themes.length; i++) {
      const target = themes[i];
      if (absorbed.has(target.id)) continue;

      for (let j = i + 1; j < themes.length; j++) {
        const source = themes[j];
        if (absorbed.has(source.id)) continue;

        // Compute cosine similarity between the two theme centroids
        const result = await this.prisma.$queryRaw<Array<{ sim: number }>>`
          SELECT 1 - (a.embedding <=> b.embedding) AS sim
          FROM "Theme" a, "Theme" b
          WHERE a.id = ${target.id} AND b.id = ${source.id}
            AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL;
        `;

        const sim = result[0]?.sim ?? 0;

        if (sim >= this.MERGE_THRESHOLD) {
          this.logger.log(
            `[MERGE] Merging theme "${source.title}" (${source.id}, size=${source.liveCount}) ` +
            `→ "${target.title}" (${target.id}, size=${target.liveCount}) ` +
            `[cosine=${sim.toFixed(3)}]`,
          );

          // Re-assign all ThemeFeedback from source → target
          await this.prisma.themeFeedback.updateMany({
            where: { themeId: source.id },
            data: { themeId: target.id },
          });

          // Archive the source theme (preserve history)
          await this.prisma.theme.update({
            where: { id: source.id },
            data: { status: 'ARCHIVED' },
          });

          absorbed.add(source.id);
          mergedCount++;

          // Update target centroid after absorbing source
          await this.updateThemeCentroid(this.prisma, target.id);
        }
      }
    }

    this.logger.log(
      `[MERGE] Post-merge complete for workspace ${workspaceId}: ` +
      `${mergedCount} themes absorbed`,
    );

    return mergedCount;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Returns the similarity threshold based on LIVE cluster size.
   * Uses real COUNT from ThemeFeedback, not the stale feedbackCount column.
   */
  private getDynamicThreshold(clusterSize: number): number {
    if (clusterSize >= 10) return this.THRESHOLD_LARGE;
    if (clusterSize >= 5)  return this.THRESHOLD_MEDIUM;
    if (clusterSize >= 1)  return this.THRESHOLD_SMALL;
    return this.THRESHOLD_NEW; // brand-new theme: centroid = first feedback embedding
  }

  /**
   * Create a new AI_GENERATED candidate theme seeded from a single feedback item.
   * Stores the feedback's embedding as the theme's initial centroid.
   *
   * FIX: accepts prisma (the tx client) so the embedding $executeRaw runs inside
   * the advisory-locked transaction, making it visible to the next job immediately.
   */
  private async createCandidateTheme(
    prisma: PrismaService,
    workspaceId: string,
    feedbackId: string,
    feedbackTitle: string,
    feedbackEmbedding?: number[],
  ): Promise<string> {
    const candidateTitle = normalizeThemeTitle(feedbackTitle);

    const theme = await prisma.theme.create({
      data: {
        workspaceId,
        title: candidateTitle,
        status: 'AI_GENERATED',
        clusterConfidence: 10,
        confidenceFactors: { avgSimilarity: 1.0, size: 1, variance: 0 },
        outlierCount: 0,
        topKeywords: extractKeywords(feedbackTitle),
        dominantSignal: feedbackTitle.length > 120 ? `${feedbackTitle.slice(0, 117)}…` : feedbackTitle,
        feedbacks: {
          create: { feedbackId, assignedBy: 'ai', confidence: 1.0 },
        },
      },
    });

    // FIX: use the tx prisma client so this write is inside the transaction
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
      `[CLUSTER] ✦ Created new theme "${theme.title}" (${theme.id}) for feedback ${feedbackId}`,
    );

    try {
      await this.ciqQueue.add({ type: 'THEME_SCORED', workspaceId, themeId: theme.id });
    } catch (queueErr) {
      this.logger.warn(`[CIQ] Redis unavailable — initial score skipped: ${(queueErr as Error).message}`);
    }

    return theme.id;
  }

  /**
   * Update the theme's centroid embedding as the mean of all linked feedback embeddings.
   * FIX: accepts prisma client (may be a tx client) so it runs in the right context.
   */
  private async updateThemeCentroid(prisma: PrismaService, themeId: string): Promise<void> {
    try {
      await prisma.$executeRaw`
        UPDATE "Theme" t
        SET embedding = (
          SELECT avg(f.embedding)
          FROM "ThemeFeedback" tf
          JOIN "Feedback" f ON f.id = tf."feedbackId"
          WHERE tf."themeId" = ${themeId}
            AND f.embedding IS NOT NULL
        ),
        "centroidUpdatedAt" = NOW()
        WHERE t.id = ${themeId};
      `;
      this.logger.debug(`[Centroid] Updated centroid for theme ${themeId}`);
    } catch (err) {
      this.logger.warn(`[Centroid] Failed for theme ${themeId}: ${(err as Error).message}`);
    }
  }

  /**
   * Recompute and persist the cluster confidence for a theme.
   */
  private async recomputeClusterConfidence(themeId: string, _newFeedbackTitle?: string): Promise<void> {
    try {
      const links = await this.prisma.themeFeedback.findMany({
        where: { themeId, assignedBy: 'ai', confidence: { not: null } },
        select: { confidence: true },
      });
      const similarities = links.map((l) => l.confidence as number);
      const size = similarities.length;
      if (size === 0) return;

      const avgSimilarity = similarities.reduce((s, v) => s + v, 0) / size;
      const variance =
        size > 1
          ? Math.sqrt(
              similarities.reduce((s, v) => s + (v - avgSimilarity) ** 2, 0) / size,
            )
          : 0;
      const outlierCount = similarities.filter((s) => s < this.OUTLIER_THRESHOLD).length;

      const avgSimilarityScore = Math.min(100, avgSimilarity * 100);
      const sizeScore = Math.min(100, (Math.log10(Math.max(1, size)) / Math.log10(50)) * 100);
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
        ? titles[0].length > 120 ? `${titles[0].slice(0, 117)}…` : titles[0]
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
      this.logger.warn(`[Confidence] Failed for theme ${themeId}: ${(err as Error).message}`);
    }
  }
}

// ─── Utility: normalize theme title ──────────────────────────────────────────

/**
 * Normalize a theme title to avoid sentence-like or duplicate names.
 * - Truncates to 80 chars
 * - Strips trailing punctuation (. ! ?)
 * - Title-cases the result
 */
function normalizeThemeTitle(raw: string): string {
  const truncated = raw.length > 80 ? `${raw.slice(0, 77)}…` : raw;
  const stripped = truncated.replace(/[.!?]+$/, '').trim();
  // Title-case: capitalise first letter of each word, lowercase the rest
  return stripped
    .split(' ')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

// ─── Utility: keyword overlap (Jaccard coefficient) ──────────────────────────

function computeKeywordOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ─── Utility: extract top keywords from text ─────────────────────────────────

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'from','is','are','was','were','be','been','being','have','has','had','do',
  'does','did','will','would','could','should','may','might','can','this','that',
  'these','those','i','we','you','he','she','it','they','my','our','your','his',
  'her','its','their','not','no','so','if','as','up','out','about','into','than',
  'then','when','where','who','which','what','how','all','any','each','every',
  'some','such','more','most','other','also','just','only','very','too','now',
  'get','got','getting','please','need','want','use','using','used','make','made',
  'work','working','works','worked','try','tried','trying','cant','dont','doesnt',
  'isnt','wasnt','wont','wouldnt','couldnt','shouldnt',
]);

function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

  const freq: Record<string, number> = {};
  for (const w of words) {
    freq[w] = (freq[w] ?? 0) + 1;
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w);
}

// ─── Utility: workspace advisory lock key ────────────────────────────────────

function workspaceIdToLockKey(workspaceId: string): number {
  const hex = workspaceId.replace(/-/g, '');
  let key = 0;
  for (let i = 0; i < hex.length; i += 8) {
    key ^= parseInt(hex.slice(i, i + 8), 16) | 0;
  }
  return key;
}

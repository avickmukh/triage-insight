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
 * SMARTER CLUSTERING (PRD Part 1 & 3):
 *   Hybrid similarity = (embedding_similarity × 0.7) + (keyword_overlap × 0.3)
 *   This improves grouping accuracy by combining:
 *     - Dense vector similarity (semantic meaning)
 *     - Keyword overlap (surface-level term matching)
 *
 *   Dynamic threshold based on cluster size:
 *     - Large clusters (≥ 10 items): threshold = 0.80 (stricter — cluster is well-defined)
 *     - Medium clusters (5–9 items):  threshold = 0.78
 *     - Small clusters (< 5 items):   threshold = 0.75 (looser — cluster needs more signals)
 *
 * THEME CENTROID (PRD Part 3):
 *   After each assignment, the theme's embedding (centroid) is updated as the
 *   mean of all linked feedback embeddings. This keeps the centroid representative
 *   as the cluster grows.
 *
 * CONFIDENCE SCORING (PRD Part 1):
 *   After each assignment, clusterConfidence (0–100) is recomputed from:
 *     - avgSimilarity (weight 0.5): mean hybrid score of AI-assigned feedback
 *     - sizeScore (weight 0.3): log-normalised cluster size (capped at 50 items)
 *     - varianceScore (weight 0.2): inverted std-dev (low variance = high confidence)
 *
 *   outlierCount: feedback with hybrid score < OUTLIER_THRESHOLD is counted.
 *
 * PERFORMANCE (PRD Part 8):
 *   - Candidate search is a single pgvector query (O(log n) with ivfflat index)
 *   - Keyword overlap is computed in-memory from pre-loaded theme keywords
 *   - Centroid update is a single UPDATE per assignment, not a full recompute
 *   - Batch reclustering processes items sequentially (no O(n²) comparisons)
 */
@Injectable()
export class ThemeClusteringService {
  private readonly logger = new Logger(ThemeClusteringService.name);

  /** Embedding similarity weight in the hybrid score. */
  private readonly EMBEDDING_WEIGHT = 0.7;

  /** Keyword overlap weight in the hybrid score. */
  private readonly KEYWORD_WEIGHT = 0.3;

  /** Dynamic thresholds based on cluster size. */
  private readonly THRESHOLD_LARGE = 0.80;   // ≥ 10 items
  private readonly THRESHOLD_MEDIUM = 0.78;  // 5–9 items
  private readonly THRESHOLD_SMALL = 0.72;   // 1–4 items
  private readonly THRESHOLD_NEW    = 0.65;  // 0 items (brand-new theme, centroid = first feedback)

  /** Hybrid score below this value marks a feedback item as a potential outlier. */
  private readonly OUTLIER_THRESHOLD = 0.72;

  /** Number of top candidates to retrieve from pgvector before hybrid re-ranking. */
  private readonly VECTOR_CANDIDATES = 5;

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
   * Dynamic threshold is applied based on the target cluster's current size.
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
        `Feedback ${feedbackId} already linked to theme ${existingLink.themeId} — skipping`,
      );
      return existingLink.themeId;
    }

    // ── Workspace-level advisory lock ────────────────────────────────────────
    // Prevents concurrent clustering jobs for the same workspace from racing
    // against each other and creating duplicate themes.
    // pg_advisory_xact_lock is automatically released at transaction end.
    // We derive a stable integer key from the workspace UUID.
    return this.prisma.$transaction(async (tx) => {
      // Hash the workspaceId to a 32-bit int for the advisory lock key
      const lockKey = workspaceIdToLockKey(workspaceId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
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
      this.logger.warn(`Feedback ${feedbackId} not found or workspace mismatch`);
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
        `Embedding generation failed for feedback ${feedbackId}: ${(err as Error).message}. Falling back to candidate theme creation.`,
      );
      return this.createCandidateTheme(workspaceId, feedbackId, feedback.title);
    }

    const vectorStr = `[${feedbackEmbedding.join(',')}]`;
    const feedbackKeywords = extractKeywords(`${feedback.title} ${feedback.normalizedText ?? feedback.description ?? ''}`);

    // ── Step 1: Retrieve top-N candidates by embedding similarity ─────────
    // Scoped to workspace, excludes ARCHIVED themes.
    // We fetch top-5 and re-rank with keyword overlap.
    const candidates = await prisma.$queryRaw<Array<{
      id: string;
      similarity: number;
      topKeywords: string | null;
      feedbackCount: number;
    }>>`
      SELECT
        t.id,
        1 - (t.embedding <=> ${vectorStr}::vector) AS similarity,
        t."topKeywords",
        COALESCE(t."feedbackCount", 0) AS "feedbackCount"
      FROM "Theme" t
      WHERE t."workspaceId" = ${workspaceId}
        AND t.embedding IS NOT NULL
        AND t.status != 'ARCHIVED'
      ORDER BY similarity DESC
      LIMIT ${this.VECTOR_CANDIDATES};
    `;

    // ── Step 2: Hybrid re-ranking ─────────────────────────────────────────
    let bestThemeId: string | null = null;
    let bestHybridScore = 0;
    let bestClusterSize = 0;

    for (const candidate of candidates) {
      const embeddingScore = candidate.similarity;

      // Parse stored keywords for the candidate theme
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

      if (hybridScore > bestHybridScore) {
        bestHybridScore = hybridScore;
        bestThemeId = candidate.id;
        bestClusterSize = Number(candidate.feedbackCount);
      }
    }

    // ── Step 3: Apply dynamic threshold based on cluster size ─────────────
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
        `Assigned feedback ${feedbackId} to theme ${bestThemeId} ` +
        `(hybrid=${bestHybridScore.toFixed(3)}, threshold=${threshold}, clusterSize=${bestClusterSize})`,
      );

      // Recompute cluster confidence and update centroid
      await this.recomputeClusterConfidence(bestThemeId, feedback.title);
      await this.updateThemeCentroid(bestThemeId, feedbackEmbedding);

      // Re-score the existing theme
      try {
        await this.ciqQueue.add({ type: 'THEME_SCORED', workspaceId, themeId: bestThemeId });
      } catch (queueErr) {
        this.logger.warn(`[CIQ] Redis unavailable — re-score job skipped: ${(queueErr as Error).message}`);
      }
      return bestThemeId;
    }

    // No good match — create a new candidate theme
    return this.createCandidateTheme(workspaceId, feedbackId, feedback.title, feedbackEmbedding);
  }

  /**
   * Run a full workspace reclustering pass.
   *
   * Processes unlinked feedback items in batches of 50 to avoid O(n²) operations.
   * Triggered by `POST /workspaces/:id/themes/recluster`.
   */
  async runClustering(
    workspaceId: string,
  ): Promise<{ processed: number; assigned: number; created: number }> {
    this.logger.log(`Starting hybrid theme reclustering for workspace ${workspaceId}`);

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

    this.logger.log(
      `Hybrid reclustering complete for workspace ${workspaceId}: ` +
        `processed=${processed}, assigned=${assigned}, created=${created}`,
    );

    return { processed, assigned, created };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Returns the similarity threshold based on cluster size.
   * Larger, well-defined clusters use a stricter threshold to avoid dilution.
   * Small clusters use a looser threshold to grow faster.
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
   */
  private async createCandidateTheme(
    workspaceId: string,
    feedbackId: string,
    feedbackTitle: string,
    feedbackEmbedding?: number[],
  ): Promise<string> {
    const candidateTitle =
      feedbackTitle.length > 80 ? `${feedbackTitle.slice(0, 77)}…` : feedbackTitle;

    const theme = await this.prisma.theme.create({
      data: {
        workspaceId,
        title: candidateTitle,
        status: 'AI_GENERATED',
        // Seed confidence: single-item cluster has low confidence by definition
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

    // Store the feedback's embedding as the theme's initial centroid
    if (feedbackEmbedding && feedbackEmbedding.length > 0) {
      const vectorStr = `[${feedbackEmbedding.join(',')}]`;
      await this.prisma.$executeRaw`
        UPDATE "Theme"
        SET embedding = ${vectorStr}::vector,
            "centroidUpdatedAt" = NOW()
        WHERE id = ${theme.id};
      `;
    }

    this.logger.log(
      `Created AI_GENERATED theme "${theme.title}" (${theme.id}) for feedback ${feedbackId}`,
    );

    try {
      await this.ciqQueue.add({ type: 'THEME_SCORED', workspaceId, themeId: theme.id });
    } catch (queueErr) {
      this.logger.warn(`[CIQ] Redis unavailable — initial score job skipped: ${(queueErr as Error).message}`);
    }

    return theme.id;
  }

  /**
   * Update the theme's centroid embedding as the mean of all linked feedback embeddings.
   *
   * Uses pgvector's native arithmetic to compute the mean vector in SQL.
   * This is O(n) in cluster size but runs as a single SQL query.
   * Safe to call fire-and-forget — errors are caught and logged.
   */
  private async updateThemeCentroid(themeId: string, _newEmbedding?: number[]): Promise<void> {
    try {
      // Use pgvector avg() to compute the centroid of all linked feedback embeddings
      await this.prisma.$executeRaw`
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
      this.logger.warn(`[Centroid] Failed to update centroid for theme ${themeId}: ${(err as Error).message}`);
    }
  }

  /**
   * Recompute and persist the cluster confidence for a theme.
   *
   * Confidence formula (0–100):
   *   - avgSimilarityScore: mean hybrid score of AI-assigned feedback (weight 0.5)
   *   - sizeScore:          log-normalised cluster size, capped at 50 items (weight 0.3)
   *   - varianceScore:      inverted std-dev of similarities (weight 0.2)
   *
   * Also updates outlierCount, topKeywords, and dominantSignal.
   * Safe to call fire-and-forget — errors are caught and logged.
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
      this.logger.warn(`[Confidence] Failed to recompute for theme ${themeId}: ${(err as Error).message}`);
    }
  }
}

// ─── Utility: keyword overlap (Jaccard coefficient) ──────────────────────────

/**
 * Compute Jaccard similarity between two keyword sets.
 * Returns a value in [0, 1].
 */
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
]);

/**
 * Extract the top 8 keywords from a text string.
 * Returns a JSON-serialisable string array.
 */
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

/**
 * Derive a stable 32-bit integer from a workspace UUID for use as a
 * PostgreSQL advisory lock key (pg_advisory_xact_lock takes a bigint).
 *
 * We XOR the four 32-bit words of the UUID together to get a single int.
 * Collisions are theoretically possible but astronomically unlikely for a
 * small number of workspaces, and a collision would only cause unnecessary
 * serialisation (not incorrect behaviour).
 */
function workspaceIdToLockKey(workspaceId: string): number {
  const hex = workspaceId.replace(/-/g, '');
  let key = 0;
  for (let i = 0; i < hex.length; i += 8) {
    key ^= parseInt(hex.slice(i, i + 8), 16) | 0;
  }
  return key;
}

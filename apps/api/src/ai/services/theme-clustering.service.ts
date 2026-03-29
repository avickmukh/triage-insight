import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';
import { CIQ_SCORING_QUEUE } from '../processors/ciq-scoring.processor';

/**
 * ThemeClusteringService
 *
 * Semantic clustering using pgvector cosine similarity.
 * Assigns a single feedback item to the best-matching existing theme in the
 * same workspace. If no theme scores above the similarity threshold, a new
 * AI_GENERATED candidate theme is created and its embedding is stored for
 * future incremental clustering.
 *
 * After a new theme is created, a CIQ scoring job is immediately enqueued so
 * that the theme appears in dashboards and rankings without any manual step.
 *
 * Tenant isolation is enforced by scoping all queries to `workspaceId`.
 * Clustering is async via BullMQ (see ThemeClusteringProcessor).
 *
 * Confidence scoring (PRD Part 1):
 *   After each assignment, the theme's clusterConfidence (0–100) is recomputed
 *   from three factors:
 *     - avgSimilarity: mean cosine similarity of all AI-assigned feedback
 *     - size:          number of feedback items (more data → higher confidence)
 *     - variance:      std-dev of similarity scores (low variance → higher confidence)
 *
 *   outlierCount is also updated: feedback with similarity < OUTLIER_THRESHOLD
 *   is counted but kept in the cluster (removal is a manual editorial decision).
 */
@Injectable()
export class ThemeClusteringService {
  private readonly logger = new Logger(ThemeClusteringService.name);

  /** Cosine similarity threshold (0–1) required to link to an existing theme. */
  private readonly SIMILARITY_THRESHOLD = 0.8;

  /** Similarity below this value marks a feedback item as a potential outlier. */
  private readonly OUTLIER_THRESHOLD = 0.75;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    @InjectQueue(CIQ_SCORING_QUEUE) private readonly ciqQueue: Queue,
  ) {}

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Assign a single feedback item to the best-matching theme in the workspace.
   *
   * Uses pgvector cosine similarity on stored theme embeddings.
   * If the feedback already has an embedding, it is used directly.
   * Otherwise, a new embedding is generated from the feedback's title and description.
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

    const feedback = await this.prisma.feedback.findUnique({
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
        `${feedback.title} ${feedback.description}`,
      );
    } catch (err) {
      this.logger.warn(
        `Embedding generation failed for feedback ${feedbackId}: ${(err as Error).message}. Falling back to candidate theme creation.`,
      );
      return this.createCandidateTheme(workspaceId, feedbackId, feedback.title);
    }

    const vectorStr = `[${feedbackEmbedding.join(',')}]`;

    // Find the most similar theme using pgvector cosine similarity.
    // Scoped to the workspace for tenant isolation.
    // Excludes ARCHIVED themes only — AI_GENERATED and VERIFIED both participate.
    const similarThemes = await this.prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
      SELECT
        id,
        1 - (embedding <=> ${vectorStr}::vector) AS similarity
      FROM "Theme"
      WHERE "workspaceId" = ${workspaceId}
        AND "embedding" IS NOT NULL
        AND "status" != 'ARCHIVED'
      ORDER BY similarity DESC
      LIMIT 1;
    `;

    if (similarThemes.length > 0 && similarThemes[0].similarity > this.SIMILARITY_THRESHOLD) {
      const themeId = similarThemes[0].id;
      await this.prisma.themeFeedback.upsert({
        where: { themeId_feedbackId: { themeId, feedbackId } },
        create: {
          themeId,
          feedbackId,
          assignedBy: 'ai',
          confidence: similarThemes[0].similarity,
        },
        update: {
          assignedBy: 'ai',
          confidence: similarThemes[0].similarity,
        },
      });
      this.logger.log(
        `Assigned feedback ${feedbackId} to theme ${themeId} (similarity=${similarThemes[0].similarity.toFixed(3)})`,
      );

      // Recompute cluster confidence after adding new feedback
      await this.recomputeClusterConfidence(themeId, feedback.title);

      // Re-score the existing theme so the new feedback signal is reflected immediately
      try {
        await this.ciqQueue.add({ type: 'THEME_SCORED', workspaceId, themeId });
      } catch (queueErr) {
        this.logger.warn(`[CIQ] Redis unavailable — re-score job skipped: ${(queueErr as Error).message}`);
      }
      return themeId;
    }

    // No good match — create a new candidate theme and store its embedding
    return this.createCandidateTheme(workspaceId, feedbackId, feedback.title, feedbackEmbedding);
  }

  /**
   * Run a full workspace reclustering pass.
   *
   * For each feedback item not yet linked to any theme, attempt to assign it.
   * This is the batch path triggered by `POST /workspaces/:id/themes/recluster`.
   */
  async runClustering(
    workspaceId: string,
  ): Promise<{ processed: number; assigned: number; created: number }> {
    this.logger.log(`Starting theme reclustering for workspace ${workspaceId}`);

    const unlinked = await this.prisma.feedback.findMany({
      where: {
        workspaceId,
        status: { not: 'MERGED' },
        themes: { none: {} },
      },
      select: { id: true },
    });

    let assigned = 0;
    let created = 0;

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
    }

    this.logger.log(
      `Reclustering complete for workspace ${workspaceId}: ` +
        `processed=${unlinked.length}, assigned=${assigned}, created=${created}`,
    );

    return { processed: unlinked.length, assigned, created };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Create a new AI_GENERATED candidate theme seeded from a single feedback item.
   * The theme title is derived from the feedback title (truncated to 80 chars).
   * If a feedbackEmbedding is provided, it is stored as the theme's embedding
   * for future incremental clustering.
   *
   * A CIQ scoring job is immediately enqueued so the new theme appears in
   * dashboards and rankings without any manual activation step.
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
        // AI_GENERATED is the default — no manual activation required.
        // The theme participates in CIQ, dashboard, and rankings immediately.
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

    // Store the feedback's embedding as the theme's initial embedding
    if (feedbackEmbedding && feedbackEmbedding.length > 0) {
      const vectorStr = `[${feedbackEmbedding.join(',')}]`;
      await this.prisma.$executeRaw`
        UPDATE "Theme"
        SET embedding = ${vectorStr}::vector
        WHERE id = ${theme.id};
      `;
    }

    this.logger.log(
      `Created AI_GENERATED theme "${theme.title}" (${theme.id}) for feedback ${feedbackId}`,
    );

    // Immediately trigger CIQ scoring for the new theme so it appears in
    // dashboards and rankings without any manual activation step.
    try {
      await this.ciqQueue.add({ type: 'THEME_SCORED', workspaceId, themeId: theme.id });
    } catch (queueErr) {
      this.logger.warn(`[CIQ] Redis unavailable — initial score job skipped: ${(queueErr as Error).message}`);
    }

    return theme.id;
  }

  /**
   * Recompute and persist the cluster confidence for a theme.
   *
   * Confidence formula (0–100):
   *   - avgSimilarityScore: mean cosine similarity of AI-assigned feedback (weight 0.5)
   *   - sizeScore:          log-normalised cluster size, capped at 50 items (weight 0.3)
   *   - varianceScore:      inverted std-dev of similarities (weight 0.2)
   *
   * Also updates outlierCount (feedback with similarity < OUTLIER_THRESHOLD).
   * Also extracts topKeywords and dominantSignal from feedback titles.
   *
   * Safe to call fire-and-forget — errors are caught and logged.
   */
  private async recomputeClusterConfidence(themeId: string, newFeedbackTitle?: string): Promise<void> {
    try {
      // Load all AI-assigned feedback with their similarity scores
      const links = await this.prisma.themeFeedback.findMany({
        where: { themeId, assignedBy: 'ai', confidence: { not: null } },
        select: { confidence: true },
      });

      const similarities = links.map((l) => l.confidence as number);
      const size = similarities.length;

      if (size === 0) return;

      const avgSimilarity = similarities.reduce((s, v) => s + v, 0) / size;

      // Variance (std-dev)
      const variance =
        size > 1
          ? Math.sqrt(
              similarities.reduce((s, v) => s + (v - avgSimilarity) ** 2, 0) / size,
            )
          : 0;

      // Outlier count
      const outlierCount = similarities.filter((s) => s < this.OUTLIER_THRESHOLD).length;

      // Compute confidence score (0–100)
      const avgSimilarityScore = Math.min(100, avgSimilarity * 100);
      const sizeScore = Math.min(100, (Math.log10(Math.max(1, size)) / Math.log10(50)) * 100);
      const varianceScore = Math.max(0, 100 - variance * 500); // variance 0 → 100, variance 0.2 → 0

      const clusterConfidence = parseFloat(
        (avgSimilarityScore * 0.5 + sizeScore * 0.3 + varianceScore * 0.2).toFixed(1),
      );

      // Extract keywords and dominant signal from all feedback titles in the cluster
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
          confidenceFactors: { avgSimilarity: parseFloat(avgSimilarity.toFixed(3)), size, variance: parseFloat(variance.toFixed(3)) },
          outlierCount,
          topKeywords,
          dominantSignal,
        },
      });

      this.logger.debug(
        `[Confidence] Theme ${themeId}: score=${clusterConfidence}, size=${size}, avgSim=${avgSimilarity.toFixed(3)}, variance=${variance.toFixed(3)}, outliers=${outlierCount}`,
      );
    } catch (err) {
      this.logger.warn(`[Confidence] Failed to recompute for theme ${themeId}: ${(err as Error).message}`);
    }
  }
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

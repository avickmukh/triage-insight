import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';
import { CIQ_SCORING_QUEUE } from '../processors/ciq-scoring.processor';

/**
 * ThemeClusteringService
 *
 * PURPOSE
 * -------
 * This service is responsible for semantic theme clustering.
 *
 * It uses:
 * - embeddings (AI semantic vectors)
 * - pgvector cosine similarity
 * - lightweight keyword overlap
 *
 * It decides:
 * - whether a feedback item should be attached to an existing theme
 * - or whether a new theme should be created
 *
 * IMPORTANT
 * ---------
 * This is AI-powered clustering, but NOT LLM narration.
 * The "AI" here is semantic similarity via embeddings.
 *
 * MAIN CHANGES IN THIS VERSION
 * ----------------------------
 * 1. Thresholds are lowered so similar feedback is more likely to join an existing theme
 * 2. Embedding weight is increased because semantic similarity is more reliable than keyword overlap
 * 3. A soft-match fallback is added to reduce theme explosion
 * 4. A theme-cap guardrail is added so the system does not keep creating tiny micro-themes
 * 5. Post-merge threshold is slightly relaxed to merge near-duplicate themes more aggressively
 */
@Injectable()
export class ThemeClusteringService {
  private readonly logger = new Logger(ThemeClusteringService.name);

  /**
   * Embedding similarity is the strongest signal.
   * We give it most of the weight because embeddings capture semantic meaning
   * better than exact keyword overlap.
   */
  private readonly EMBEDDING_WEIGHT = 0.85;

  /**
   * Keyword overlap is still useful as a secondary signal, but should not dominate.
   */
  private readonly KEYWORD_WEIGHT = 0.15;

  /**
   * Dynamic thresholds by live cluster size.
   *
   * These are intentionally lower than before.
   * The previous values were still too strict, causing near-duplicate feedback
   * to fail assignment and create too many themes.
   *
   * Rough intuition:
   * - new / tiny themes should be easier to grow
   * - mature themes can be a bit stricter
   *
   * With EMBEDDING_WEIGHT = 0.85:
   * threshold 0.50 ~= requires embedding similarity ~0.59 if keywords = 0
   * threshold 0.62 ~= requires embedding similarity ~0.73 if keywords = 0
   *
   * In real life keyword overlap is often low even when semantics match,
   * so thresholds must remain practical.
   */
  private readonly THRESHOLD_NEW = 0.50;     // 0 items
  private readonly THRESHOLD_SMALL = 0.52;   // 1–4 items
  private readonly THRESHOLD_MEDIUM = 0.58;  // 5–9 items
  private readonly THRESHOLD_LARGE = 0.62;   // >=10 items

  /**
   * Below this hybrid score, a feedback item is considered a possible outlier.
   */
  private readonly OUTLIER_THRESHOLD = 0.45;

  /**
   * How many nearest vector candidates to fetch before hybrid re-ranking.
   */
  private readonly VECTOR_CANDIDATES = 12;

  /**
   * Soft match multiplier.
   *
   * If best score is close to the threshold, prefer assignment over creating
   * a brand-new theme. This dramatically reduces theme explosion.
   *
   * Example:
   * threshold = 0.58
   * soft threshold = 0.58 * 0.92 = 0.5336
   */
  private readonly SOFT_MATCH_MULTIPLIER = 0.92;

  /**
   * If workspace already has many themes, be conservative about creating more.
   * This is a simple guardrail, not a hard business rule.
   */
  private readonly THEME_CAP_GUARDRAIL = 20;

  /**
   * Merge themes whose centroids are very close.
   * Slightly more aggressive than before to clean up micro-theme duplication.
   */
  private readonly MERGE_THRESHOLD = 0.78;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    @InjectQueue(CIQ_SCORING_QUEUE) private readonly ciqQueue: Queue,
  ) {}

  /**
   * Assign a feedback item to the best theme in the workspace.
   *
   * Flow:
   * 1. Skip if already linked
   * 2. Ensure embedding exists
   * 3. Take workspace-level advisory lock
   * 4. Search nearest themes
   * 5. Score candidates using hybrid score
   * 6. Assign if strong enough
   * 7. Else create new theme
   * 8. After commit: recompute confidence + enqueue CIQ scoring
   */
  async assignFeedbackToTheme(
    workspaceId: string,
    feedbackId: string,
    embedding?: number[],
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

    /**
     * Generate embedding outside transaction.
     * External API calls inside DB transaction cause timeout and lock inflation.
     */
    let resolvedEmbedding: number[] | undefined = embedding;

    if (!resolvedEmbedding || resolvedEmbedding.length === 0) {
      const feedbackForEmbed = await this.prisma.feedback.findUnique({
        where: { id: feedbackId },
        select: { title: true, description: true },
      });

      if (feedbackForEmbed) {
        try {
          resolvedEmbedding = await this.embeddingService.generateEmbedding(
            `${feedbackForEmbed.title} ${feedbackForEmbed.description ?? ''}`.trim(),
          );
        } catch (err) {
          this.logger.warn(
            `[CLUSTER] Pre-tx embedding failed for feedback ${feedbackId}: ${(err as Error).message}. Will fall back to new theme if needed.`,
          );
          resolvedEmbedding = undefined;
        }
      }
    }

    /**
     * Advisory lock serializes clustering per workspace.
     * This prevents concurrent jobs from creating competing themes at the same time.
     */
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

    /**
     * Post-transaction work.
     * Do not keep lock open for derived read/write work or Redis calls.
     */
    if (assignedThemeId) {
      await this.recomputeClusterConfidence(assignedThemeId, feedbackId);

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

    return assignedThemeId;
  }

  /**
   * Core theme assignment logic executed inside advisory-locked transaction.
   */
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

    /**
     * If embedding is unavailable, we cannot perform semantic clustering.
     * In that case create a candidate theme rather than dropping the signal.
     */
    let feedbackEmbedding: number[];
    if (embedding && embedding.length > 0) {
      feedbackEmbedding = embedding;
    } else {
      this.logger.warn(
        `[CLUSTER] No embedding available for feedback ${feedbackId} inside tx — creating new theme.`,
      );
      return this.createCandidateTheme(
        prisma,
        workspaceId,
        feedbackId,
        feedback.title,
        undefined,
        feedback.description ?? undefined,
      );
    }

    const vectorStr = `[${feedbackEmbedding.join(',')}]`;
    const feedbackKeywords = extractKeywords(
      `${feedback.title} ${feedback.normalizedText ?? feedback.description ?? ''}`,
    );

    /**
     * Step 1: get top vector candidates in the workspace.
     * Use live ThemeFeedback counts, not stale denormalized counts.
     */
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
      `[CLUSTER] Feedback "${feedback.title}" (${feedbackId}) — found ${candidates.length} candidates in workspace ${workspaceId}`,
    );

    /**
     * Step 2: hybrid re-ranking.
     *
     * embeddingScore:
     *   semantic similarity from pgvector cosine distance
     *
     * keywordScore:
     *   simple lexical overlap, mainly to slightly reward aligned vocabulary
     *
     * hybridScore:
     *   final decision score
     */
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
          themeKeywords =
            typeof candidate.topKeywords === 'string'
              ? JSON.parse(candidate.topKeywords)
              : (candidate.topKeywords as string[]);
        }
      } catch {
        themeKeywords = [];
      }

      const keywordScore = computeKeywordOverlap(feedbackKeywords, themeKeywords);
      const hybridScore =
        embeddingScore * this.EMBEDDING_WEIGHT +
        keywordScore * this.KEYWORD_WEIGHT;

      const liveCount = Number(candidate.liveCount);

      this.logger.debug(
        `[CLUSTER] Candidate "${candidate.title}" (${candidate.id}): ` +
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

    /**
     * Step 3: decide assignment threshold based on current live cluster size.
     */
    const threshold = this.getDynamicThreshold(bestClusterSize);
    const softThreshold = threshold * this.SOFT_MATCH_MULTIPLIER;

    /**
     * Theme-cap guardrail:
     * if workspace already has many themes and we found a moderately good match,
     * prefer assignment over creating yet another micro-theme.
     */
    const activeThemeCount = await prisma.theme.count({
      where: {
        workspaceId,
        status: { not: 'ARCHIVED' },
      },
    });

    const shouldAssignStrong =
      !!bestThemeId && bestHybridScore >= threshold;

    const shouldAssignSoft =
      !!bestThemeId &&
      bestHybridScore >= softThreshold &&
      activeThemeCount >= this.THEME_CAP_GUARDRAIL;

    if (shouldAssignStrong || shouldAssignSoft) {
      let themeKeywordsForReason: string[] = [];

      const bestCandidate = candidates.find((c) => c.id === bestThemeId);
      if (bestCandidate?.topKeywords) {
        try {
          themeKeywordsForReason =
            typeof bestCandidate.topKeywords === 'string'
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
        keywordScore: parseFloat(bestKeywordScore.toFixed(4)),
        hybridScore: parseFloat(bestHybridScore.toFixed(4)),
        threshold: parseFloat(threshold.toFixed(4)),
        softThreshold: parseFloat(softThreshold.toFixed(4)),
        clusterSize: bestClusterSize,
        matchedKeywords,
        assignmentMode: shouldAssignStrong ? 'strong' : 'soft_guardrail',
      };

      await prisma.themeFeedback.upsert({
        where: { themeId_feedbackId: { themeId: bestThemeId!, feedbackId } },
        create: {
          themeId: bestThemeId!,
          feedbackId,
          assignedBy: 'ai',
          confidence: bestHybridScore,
          matchReason,
        },
        update: {
          assignedBy: 'ai',
          confidence: bestHybridScore,
          matchReason,
        },
      });

      const now = new Date();
      const themeUpdate: Record<string, unknown> = { lastEvidenceAt: now };

      /**
       * Keep recent signal count fresh.
       */
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const recentCount = await prisma.themeFeedback.count({
        where: {
          themeId: bestThemeId!,
          feedback: { createdAt: { gte: thirtyDaysAgo } },
        },
      });

      themeUpdate.recentSignalCount = recentCount + 1;

      /**
       * Resurfacing logic:
       * if a shipped roadmap item gets new evidence, mark resurfacing signals.
       */
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
            `[CLUSTER] ⚠ AUTO-PROMOTED to RESURFACED: theme "${bestThemeTitle}" (${bestThemeId}) crossed ${RESURFACING_THRESHOLD} recent signals`,
          );
        } else {
          this.logger.warn(
            `[CLUSTER] ⚠ RESURFACED: theme "${bestThemeTitle}" (${bestThemeId}) received fresh evidence`,
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
          `hybrid=${bestHybridScore.toFixed(3)}, threshold=${threshold.toFixed(3)}, ` +
          `embedding=${bestEmbeddingScore.toFixed(3)}, keyword=${bestKeywordScore.toFixed(3)}, ` +
          `clusterSize=${bestClusterSize}, matchedKeywords=[${matchedKeywords.join(',')}])`,
      );

      await this.updateThemeCentroid(prisma, bestThemeId!);
      return bestThemeId!;
    }

    /**
     * No good match found, so create a new theme.
     */
    this.logger.log(
      `[CLUSTER] ✗ NO MATCH for feedback "${feedback.title}" ` +
        `(bestHybrid=${bestHybridScore.toFixed(3)} < threshold=${threshold.toFixed(3)}, ` +
        `bestCandidate="${bestThemeTitle}", activeThemes=${activeThemeCount}) — creating new theme`,
    );

    return this.createCandidateTheme(
      prisma,
      workspaceId,
      feedbackId,
      feedback.title,
      feedbackEmbedding,
      feedback.description ?? undefined,
    );
  }

  /**
   * Full workspace reclustering pass.
   *
   * Processes currently unlinked feedback, then runs a cleanup merge pass.
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
      /**
       * Always fetch the current first page of unlinked items.
       * Do NOT use skip here because the result set shrinks as items get linked.
       * Using skip on a shrinking set can accidentally skip remaining rows.
       */
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

        const themeId = await this.assignFeedbackToTheme(workspaceId, feedbackId);

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

    const merged = await this.runPostMerge(workspaceId);

    const themesAfter = await this.prisma.theme.count({
      where: { workspaceId, status: { not: 'ARCHIVED' } },
    });

    this.logger.log(
      `[CLUSTER] ══ Reclustering complete for workspace ${workspaceId}: ` +
        `processed=${processed}, assigned=${assigned}, created=${created}, merged=${merged}, themesAfter=${themesAfter} (was ${themesBefore}) ══`,
    );

    return { processed, assigned, created, merged };
  }

  /**
   * Merge near-duplicate themes after clustering completes.
   *
   * This is a cleanup step, not the primary clustering mechanism.
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
      `[MERGE] Starting post-merge pass for workspace ${workspaceId} (${themes.length} active themes)`,
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

        if (sim >= this.MERGE_THRESHOLD) {
          this.logger.log(
            `[MERGE] Merging "${source.title}" (${source.id}, size=${source.liveCount}) ` +
              `→ "${target.title}" (${target.id}, size=${target.liveCount}) [cosine=${sim.toFixed(3)}]`,
          );

          await this.prisma.$executeRaw`
            INSERT INTO "ThemeFeedback" ("themeId", "feedbackId", "assignedBy", "confidence", "assignedAt")
            SELECT
              ${target.id}::text,
              tf."feedbackId",
              tf."assignedBy",
              tf."confidence",
              NOW()
            FROM "ThemeFeedback" tf
            WHERE tf."themeId" = ${source.id}
            ON CONFLICT ("themeId", "feedbackId") DO NOTHING;
          `;

          await this.prisma.themeFeedback.deleteMany({
            where: { themeId: source.id },
          });

          await this.prisma.theme.update({
            where: { id: source.id },
            data: { status: 'ARCHIVED' },
          });

          absorbed.add(source.id);
          mergedCount++;

          await this.updateThemeCentroid(this.prisma, target.id);
        }
      }
    }

    this.logger.log(
      `[MERGE] Post-merge complete for workspace ${workspaceId}: ${mergedCount} themes absorbed`,
    );

    return mergedCount;
  }

  /**
   * Dynamic assignment threshold based on current cluster size.
   */
  private getDynamicThreshold(clusterSize: number): number {
    if (clusterSize >= 10) return this.THRESHOLD_LARGE;
    if (clusterSize >= 5) return this.THRESHOLD_MEDIUM;
    if (clusterSize >= 1) return this.THRESHOLD_SMALL;
    return this.THRESHOLD_NEW;
  }

  /**
   * Create a new candidate theme from a single feedback item.
   *
   * The feedback embedding becomes the initial centroid for the new theme.
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
      // Source-label detected (e.g. a question string): use description text
      // but still enforce the 3–4 word limit via normalizeThemeTitle.
      const fallback = feedbackDescription ?? feedbackTitle;
      const fallbackNormalised = normalizeThemeTitle(fallback);
      candidateTitle = fallbackNormalised ?? fallback.split(/\s+/).slice(0, 4).join(' ');

      this.logger.debug(
        `[CLUSTER] Question-label detected for feedback ${feedbackId}: "${feedbackTitle}" — using answer text as theme title: "${candidateTitle}"`,
      );
    } else {
      candidateTitle = normalised;
    }

    const theme = await prisma.theme.create({
      data: {
        workspaceId,
        title: candidateTitle,
        status: 'AI_GENERATED',
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
      `[CLUSTER] ✦ Created new theme "${theme.title}" (${theme.id}) for feedback ${feedbackId}`,
    );

    return theme.id;
  }

  /**
   * Recompute theme centroid as average of linked feedback embeddings.
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
      this.logger.warn(
        `[Centroid] Failed for theme ${themeId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Recompute cluster confidence for explainability and quality display.
   */
  private async recomputeClusterConfidence(
    themeId: string,
    _newFeedbackTitle?: string,
  ): Promise<void> {
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
        `[Confidence] Theme ${themeId}: score=${clusterConfidence}, size=${size}, avgSim=${avgSimilarity.toFixed(3)}, variance=${variance.toFixed(3)}, outliers=${outlierCount}`,
      );
    } catch (err) {
      this.logger.warn(
        `[Confidence] Failed for theme ${themeId}: ${(err as Error).message}`,
      );
    }
  }
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
 *    If fewer than 3 meaningful tokens exist, fall back to the first 4 raw tokens
 *    so we always return something readable.
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

  // Split into tokens, drop empty strings
  const tokens = stripped.split(/\s+/).filter((t) => t.length > 0);

  // Title-case helper
  const titleCase = (word: string) =>
    word.length > 0 ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word;

  // Collect up to 4 meaningful (non-stop-word) tokens
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

  // Fallback: if fewer than 3 meaningful tokens, use first 4 raw tokens
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
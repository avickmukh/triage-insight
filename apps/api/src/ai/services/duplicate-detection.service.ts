import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Match classes ─────────────────────────────────────────────────────────────
/**
 * Strict match classification for duplicate suggestions.
 *
 * Precision > recall: it is better to miss a duplicate than show unrelated items.
 *
 * EXACT_DUPLICATE    — near-identical issue (hybridScore ≥ 0.92 + title overlap ≥ 0.70)
 * NEAR_DUPLICATE     — highly similar issue (hybridScore ≥ 0.82 + title overlap ≥ 0.40)
 * RELATED_SAME_THEME — belongs to same problem area but NOT a duplicate (never surfaced as duplicate)
 * NOT_DUPLICATE      — no meaningful match (never persisted)
 */
export type DuplicateMatchType =
  | 'EXACT_DUPLICATE'
  | 'NEAR_DUPLICATE'
  | 'RELATED_SAME_THEME'
  | 'NOT_DUPLICATE';

// ─── Thresholds ────────────────────────────────────────────────────────────────
/**
 * Thresholds are deliberately conservative (precision > recall).
 *
 * Embedding similarity alone is NOT sufficient for a duplicate decision.
 * A hybrid score combining embedding + title + keyword signals is required.
 * BOTH the hybrid score AND the title overlap must meet their thresholds.
 */
const THRESHOLDS = {
  /** Minimum embedding similarity to even consider a candidate */
  EMBEDDING_CANDIDATE:  0.80,
  /** Hybrid score required for EXACT_DUPLICATE classification */
  EXACT_HYBRID:         0.92,
  /** Title overlap (Jaccard) required for EXACT_DUPLICATE */
  EXACT_TITLE_OVERLAP:  0.70,
  /** Hybrid score required for NEAR_DUPLICATE classification */
  NEAR_HYBRID:          0.82,
  /** Title overlap (Jaccard) required for NEAR_DUPLICATE */
  NEAR_TITLE_OVERLAP:   0.40,
  /** Minimum keyword overlap for heuristic fallback (raised from 0.35 to reduce false positives) */
  HEURISTIC_KEYWORD:    0.55,
  /** Minimum title overlap required for heuristic path */
  HEURISTIC_TITLE:      0.30,
} as const;

/**
 * Generic "noise" words that must NOT drive duplicate decisions.
 * These are common complaint words that appear in virtually all feedback,
 * making them useless as discriminators between unrelated issues.
 */
const STOPWORDS = new Set([
  'issue', 'issues', 'problem', 'problems', 'error', 'errors',
  'bug', 'bugs', 'working', 'work', 'works', 'slow', 'fast',
  'please', 'need', 'needs', 'want', 'wants', 'would', 'could',
  'should', 'like', 'also', 'when', 'with', 'that', 'this',
  'have', 'from', 'they', 'been', 'more', 'than', 'just',
  'able', 'user', 'users', 'page', 'time', 'times',
  'still', 'does', 'doesnt', 'cant', 'wont', 'make', 'made',
  'getting', 'keep', 'keeps', 'always', 'never',
  'every', 'after', 'before', 'feature', 'features', 'button',
  'click', 'screen', 'app', 'application', 'system', 'service',
  'support', 'team', 'help', 'using', 'used', 'seem', 'seems',
]);

interface SimilarFeedbackRow {
  id: string;
  title: string;
  similarity: number;
}

interface HybridScoreResult {
  hybridScore: number;
  matchType: DuplicateMatchType;
  matchReason: string;
  titleOverlap: number;
  keywordOverlap: number;
}

/**
 * DuplicateDetectionService
 *
 * Generates FeedbackDuplicateSuggestion rows for a given feedback item.
 *
 * Strategy (precision > recall):
 *   1. Embedding-based cosine similarity via pgvector on COMPOSITE text
 *      (Title: <title>\nDescription: <description>) — NOT description alone.
 *   2. Hybrid score = embedding×0.55 + titleOverlap×0.30 + keywordOverlap×0.15
 *   3. Strict match classification:
 *      - EXACT_DUPLICATE   → hybridScore ≥ 0.92 AND titleOverlap ≥ 0.70
 *      - NEAR_DUPLICATE    → hybridScore ≥ 0.82 AND titleOverlap ≥ 0.40
 *      - RELATED_SAME_THEME → below duplicate thresholds (NOT persisted as suggestion)
 *      - NOT_DUPLICATE     → below all thresholds (never persisted)
 *   4. Heuristic fallback (no embedding): stopword-filtered keyword overlap,
 *      threshold raised from 0.35 → 0.55, title overlap required ≥ 0.30
 *
 * All matching is strictly scoped to the same workspaceId.
 * Suggestions are upserted so re-runs are idempotent.
 */
@Injectable()
export class DuplicateDetectionService {
  private readonly logger = new Logger(DuplicateDetectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Public entry point ────────────────────────────────────────────────────

  /**
   * Generate duplicate suggestions for `feedbackId` inside `workspaceId`.
   * Pass `embedding` when it is already available (post-AI processing).
   * When `embedding` is null/undefined the heuristic fallback is used instead.
   *
   * IMPORTANT: For best accuracy, the embedding should be generated from the
   * composite text "Title: <title>\nDescription: <description>", not just
   * the description alone. The analysis processor controls this.
   */
  async generateSuggestions(
    workspaceId: string,
    feedbackId: string,
    embedding?: number[] | null,
    _threshold = 0.88, // kept for backward-compat signature; internal thresholds are used
  ): Promise<void> {
    if (embedding && embedding.length > 0) {
      await this._embeddingBasedSuggestions(workspaceId, feedbackId, embedding);
    } else {
      await this._heuristicSuggestions(workspaceId, feedbackId);
    }
  }

  /**
   * Legacy entry point kept for backward-compat with the existing processor.
   * Delegates to generateSuggestions and returns the raw rows.
   */
  async findDuplicates(
    workspaceId: string,
    feedbackId: string,
    embedding: number[],
    threshold = 0.88,
  ): Promise<SimilarFeedbackRow[]> {
    await this.generateSuggestions(workspaceId, feedbackId, embedding, threshold);
    const suggestions = await this.prisma.feedbackDuplicateSuggestion.findMany({
      where: { sourceId: feedbackId },
      select: {
        targetId: true,
        similarity: true,
        targetFeedback: { select: { title: true } },
      },
    });
    return suggestions.map((s) => ({
      id: s.targetId,
      title: s.targetFeedback.title,
      similarity: s.similarity,
    }));
  }

  // ─── Private: embedding-based path ────────────────────────────────────────

  private async _embeddingBasedSuggestions(
    workspaceId: string,
    feedbackId: string,
    embedding: number[],
  ): Promise<void> {
    // Load the source feedback for hybrid scoring
    const source = await this.prisma.feedback.findFirst({
      where: { id: feedbackId, workspaceId },
      select: { title: true, description: true },
    });
    if (!source) {
      this.logger.warn(`Embedding: source feedback ${feedbackId} not found`);
      return;
    }

    const vectorStr = `[${embedding.join(',')}]`;

    // Step 1: Retrieve candidates by embedding similarity.
    // Use a lower floor (EMBEDDING_CANDIDATE = 0.80) here and apply stricter
    // hybrid scoring below. This avoids discarding candidates that have strong
    // title overlap but slightly lower embedding similarity.
    const candidates = await this.prisma.$queryRaw<Array<{
      id: string;
      title: string;
      description: string;
      similarity: number;
    }>>`
      SELECT
        id,
        title,
        description,
        1 - (embedding <=> ${vectorStr}::vector) AS similarity
      FROM "Feedback"
      WHERE "workspaceId" = ${workspaceId}
        AND id != ${feedbackId}
        AND status != 'MERGED'
        AND embedding IS NOT NULL
        AND 1 - (embedding <=> ${vectorStr}::vector) > ${THRESHOLDS.EMBEDDING_CANDIDATE}
      ORDER BY similarity DESC
      LIMIT 20;
    `;

    let persisted = 0;
    for (const candidate of candidates) {
      const result = this._computeHybridScore(
        source.title,
        source.description,
        candidate.title,
        candidate.description,
        candidate.similarity,
      );

      // Only persist EXACT_DUPLICATE and NEAR_DUPLICATE.
      // RELATED_SAME_THEME must NOT be shown as a duplicate suggestion.
      // This is the critical guardrail: theme similarity ≠ duplicate similarity.
      if (result.matchType === 'NOT_DUPLICATE' || result.matchType === 'RELATED_SAME_THEME') {
        continue;
      }

      await this._upsertSuggestion(
        feedbackId,
        candidate.id,
        candidate.similarity,
        result.hybridScore,
        result.matchType,
        result.matchReason,
      );
      persisted++;
    }

    this.logger.debug(
      `Embedding-based: ${candidates.length} candidates → ${persisted} suggestions for feedback ${feedbackId}`,
    );
  }

  // ─── Private: heuristic fallback ──────────────────────────────────────────

  private async _heuristicSuggestions(
    workspaceId: string,
    feedbackId: string,
  ): Promise<void> {
    const source = await this.prisma.feedback.findFirst({
      where: { id: feedbackId, workspaceId },
      select: { title: true, description: true, normalizedText: true },
    });
    if (!source) {
      this.logger.warn(`Heuristic: source feedback ${feedbackId} not found`);
      return;
    }

    const sourceKeywords = this._extractKeywords(
      source.normalizedText ?? source.description,
    );
    const sourceTitleTokens = this._tokenize(source.title);

    if (sourceKeywords.size === 0) {
      return;
    }

    const candidates = await this.prisma.feedback.findMany({
      where: {
        workspaceId,
        id: { not: feedbackId },
        status: { not: 'MERGED' },
      },
      select: { id: true, title: true, description: true, normalizedText: true },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });

    let persisted = 0;
    for (const candidate of candidates) {
      const candidateKeywords = this._extractKeywords(
        candidate.normalizedText ?? candidate.description,
      );
      const keywordOverlap = this._jaccardOverlap(sourceKeywords, candidateKeywords);

      // Raised from 0.35 → 0.55 to reduce false positives from generic complaint language
      if (keywordOverlap < THRESHOLDS.HEURISTIC_KEYWORD) {
        continue;
      }

      const candidateTitleTokens = this._tokenize(candidate.title);
      const titleOverlap = this._jaccardOverlap(sourceTitleTokens, candidateTitleTokens);

      // Require title overlap — prevents completely unrelated items from matching
      if (titleOverlap < THRESHOLDS.HEURISTIC_TITLE) {
        continue;
      }

      // Heuristic hybrid score (no embedding available)
      const hybridScore = keywordOverlap * 0.60 + titleOverlap * 0.40;

      let matchType: DuplicateMatchType;
      let matchReason: string;

      if (hybridScore >= 0.85 && titleOverlap >= 0.70) {
        matchType = 'EXACT_DUPLICATE';
        matchReason = 'Same issue wording';
      } else if (hybridScore >= 0.70 && titleOverlap >= 0.40) {
        matchType = 'NEAR_DUPLICATE';
        matchReason = 'Similar title and description';
      } else {
        // Below threshold — do not persist
        continue;
      }

      await this._upsertSuggestion(
        feedbackId,
        candidate.id,
        hybridScore,
        hybridScore,
        matchType,
        matchReason,
      );
      persisted++;
    }

    this.logger.debug(
      `Heuristic: ${persisted} suggestions for feedback ${feedbackId}`,
    );
  }

  // ─── Private: hybrid score computation ────────────────────────────────────

  /**
   * Compute a hybrid duplicate score from three independent signals:
   *   - embeddingSimilarity (0–1): pgvector cosine similarity
   *   - titleOverlap (0–1): Jaccard similarity on word tokens
   *   - keywordOverlap (0–1): Jaccard similarity on stopword-filtered content keywords
   *
   * Weights: embedding×0.55 + title×0.30 + keywords×0.15
   *
   * Classification requires BOTH the hybrid score AND the title overlap to
   * exceed their respective thresholds. This prevents generic complaint language
   * from driving false positives when titles are completely different
   * (e.g., "Payment failed" vs "Add dark mode support").
   */
  private _computeHybridScore(
    sourceTitle: string,
    sourceDescription: string,
    targetTitle: string,
    targetDescription: string,
    embeddingSimilarity: number,
  ): HybridScoreResult {
    const sourceTitleTokens = this._tokenize(sourceTitle);
    const targetTitleTokens = this._tokenize(targetTitle);
    const titleOverlap = this._jaccardOverlap(sourceTitleTokens, targetTitleTokens);

    const sourceKeywords = this._extractKeywords(sourceDescription);
    const targetKeywords = this._extractKeywords(targetDescription);
    const keywordOverlap = this._jaccardOverlap(sourceKeywords, targetKeywords);

    const hybridScore =
      embeddingSimilarity * 0.55 +
      titleOverlap * 0.30 +
      keywordOverlap * 0.15;

    // Classification: BOTH hybrid score AND title overlap must meet thresholds.
    // This is the key guardrail: two items about "payment" and "dark mode" will
    // have low title overlap (≈0) and will never reach NEAR_DUPLICATE regardless
    // of their embedding similarity.
    if (
      hybridScore >= THRESHOLDS.EXACT_HYBRID &&
      titleOverlap >= THRESHOLDS.EXACT_TITLE_OVERLAP
    ) {
      return {
        hybridScore,
        matchType: 'EXACT_DUPLICATE',
        matchReason: this._buildReason(titleOverlap, keywordOverlap, embeddingSimilarity, 'exact'),
        titleOverlap,
        keywordOverlap,
      };
    }

    if (
      hybridScore >= THRESHOLDS.NEAR_HYBRID &&
      titleOverlap >= THRESHOLDS.NEAR_TITLE_OVERLAP
    ) {
      return {
        hybridScore,
        matchType: 'NEAR_DUPLICATE',
        matchReason: this._buildReason(titleOverlap, keywordOverlap, embeddingSimilarity, 'near'),
        titleOverlap,
        keywordOverlap,
      };
    }

    // Below duplicate threshold — related theme only, not a duplicate
    return {
      hybridScore,
      matchType: 'RELATED_SAME_THEME',
      matchReason: 'Related theme only',
      titleOverlap,
      keywordOverlap,
    };
  }

  private _buildReason(
    titleOverlap: number,
    keywordOverlap: number,
    embeddingSimilarity: number,
    level: 'exact' | 'near',
  ): string {
    const parts: string[] = [];
    if (titleOverlap >= 0.80) {
      parts.push('Nearly identical title');
    } else if (titleOverlap >= 0.50) {
      parts.push('Similar title');
    }
    if (keywordOverlap >= 0.70) {
      parts.push('same issue wording');
    } else if (keywordOverlap >= 0.40) {
      parts.push('similar description');
    }
    if (embeddingSimilarity >= 0.95) {
      parts.push('very high semantic similarity');
    } else if (embeddingSimilarity >= 0.88) {
      parts.push('high semantic similarity');
    }
    if (parts.length === 0) {
      return level === 'exact' ? 'Same issue wording' : 'Similar title and description';
    }
    return parts.join(' · ');
  }

  // ─── Private: text utilities ───────────────────────────────────────────────

  /**
   * Tokenize a string into lowercase word tokens (≥3 chars).
   * Used for title overlap computation.
   */
  private _tokenize(text: string): Set<string> {
    return new Set(
      (text.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? []),
    );
  }

  /**
   * Extract meaningful keywords from a text string.
   * Filters out stopwords and short tokens to prevent generic complaint
   * language from driving false positive matches.
   */
  private _extractKeywords(text: string): Set<string> {
    const tokens = text.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [];
    return new Set(tokens.filter((t) => !STOPWORDS.has(t)));
  }

  /**
   * Jaccard similarity between two sets: |A ∩ B| / |A ∪ B|
   * Returns 0 if both sets are empty.
   */
  private _jaccardOverlap(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 0;
    const intersection = new Set([...a].filter((x) => b.has(x)));
    const union = new Set([...a, ...b]);
    return intersection.size / union.size;
  }

  // ─── Private: persistence ─────────────────────────────────────────────────

  private async _upsertSuggestion(
    sourceId: string,
    targetId: string,
    similarity: number,
    hybridScore: number,
    matchType: DuplicateMatchType,
    matchReason: string,
  ): Promise<void> {
    await this.prisma.feedbackDuplicateSuggestion.upsert({
      where: { sourceId_targetId: { sourceId, targetId } },
      update: { similarity, hybridScore, matchType, matchReason },
      create: { sourceId, targetId, similarity, hybridScore, matchType, matchReason },
    });
  }
}

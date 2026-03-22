import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface SimilarFeedbackRow {
  id: string;
  title: string;
  similarity: number;
}

/**
 * DuplicateDetectionService
 *
 * Generates FeedbackDuplicateSuggestion rows for a given feedback item.
 *
 * Strategy (in priority order):
 *   1. Embedding-based cosine similarity via pgvector (when embedding exists).
 *   2. Keyword-overlap heuristic on normalizedText/description (fallback).
 *
 * All matching is strictly scoped to the same workspaceId to guarantee
 * cross-tenant safety.  Suggestions are upserted so re-runs are idempotent.
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
   */
  async generateSuggestions(
    workspaceId: string,
    feedbackId: string,
    embedding?: number[] | null,
    threshold = 0.88,
  ): Promise<void> {
    if (embedding && embedding.length > 0) {
      await this._embeddingBasedSuggestions(workspaceId, feedbackId, embedding, threshold);
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
    // Return the persisted suggestions so the processor can log them
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

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async _embeddingBasedSuggestions(
    workspaceId: string,
    feedbackId: string,
    embedding: number[],
    threshold: number,
  ): Promise<void> {
    const vectorStr = `[${embedding.join(',')}]`;

    // pgvector cosine similarity — strictly scoped to the same workspace,
    // excludes already-merged feedback, and excludes the source item itself.
    const similarFeedback = await this.prisma.$queryRaw<SimilarFeedbackRow[]>`
      SELECT
        id,
        title,
        1 - (embedding <=> ${vectorStr}::vector) AS similarity
      FROM "Feedback"
      WHERE "workspaceId" = ${workspaceId}
        AND id != ${feedbackId}
        AND status != 'MERGED'
        AND embedding IS NOT NULL
        AND 1 - (embedding <=> ${vectorStr}::vector) > ${threshold}
      ORDER BY similarity DESC
      LIMIT 10;
    `;

    for (const item of similarFeedback) {
      await this._upsertSuggestion(feedbackId, item.id, item.similarity);
    }

    this.logger.debug(
      `Embedding-based: ${similarFeedback.length} suggestions for feedback ${feedbackId}`,
    );
  }

  private async _heuristicSuggestions(
    workspaceId: string,
    feedbackId: string,
  ): Promise<void> {
    const source = await this.prisma.feedback.findFirst({
      where: { id: feedbackId, workspaceId },
      select: { normalizedText: true, description: true },
    });

    if (!source) {
      this.logger.warn(`Heuristic: source feedback ${feedbackId} not found in workspace ${workspaceId}`);
      return;
    }

    const sourceText = (source.normalizedText ?? source.description).toLowerCase();
    const keywords = [...new Set(sourceText.match(/\b\w{4,}\b/g) ?? [])];

    if (keywords.length === 0) {
      return;
    }

    // Scan the most recent 300 non-merged items in the same workspace
    const candidates = await this.prisma.feedback.findMany({
      where: {
        workspaceId,
        id: { not: feedbackId },
        status: { not: 'MERGED' },
      },
      select: { id: true, title: true, normalizedText: true, description: true },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });

    const MIN_SCORE = 0.35; // at least 35% keyword overlap to be a candidate
    const TOP_N = 10;

    const scored = candidates
      .map((c) => {
        const candidateText = (c.normalizedText ?? c.description).toLowerCase();
        const matches = keywords.filter((kw) => candidateText.includes(kw)).length;
        return { id: c.id, score: matches / keywords.length };
      })
      .filter((c) => c.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_N);

    for (const item of scored) {
      await this._upsertSuggestion(feedbackId, item.id, item.score);
    }

    this.logger.debug(
      `Heuristic: ${scored.length} suggestions for feedback ${feedbackId}`,
    );
  }

  /**
   * Upsert a suggestion row.  The @@unique([sourceId, targetId]) constraint
   * on the model prevents duplicate rows; we update the similarity score on
   * conflict so re-runs with improved embeddings always reflect the latest value.
   */
  private async _upsertSuggestion(
    sourceId: string,
    targetId: string,
    similarity: number,
  ): Promise<void> {
    await this.prisma.feedbackDuplicateSuggestion.upsert({
      where: { sourceId_targetId: { sourceId, targetId } },
      update: { similarity },
      create: { sourceId, targetId, similarity },
    });
  }
}

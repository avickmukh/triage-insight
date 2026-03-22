import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * ThemeClusteringService
 *
 * MVP implementation: assigns a single feedback item to the best-matching
 * existing theme in the same workspace using normalized-text Jaccard similarity.
 * If no theme scores above the confidence threshold, a new DRAFT candidate theme
 * is created automatically.
 *
 * Architecture note:
 * The public interface `assignFeedbackToTheme(workspaceId, feedbackId, embedding?)` is
 * designed so that the heuristic path can be replaced with a pgvector cosine-similarity
 * query once embeddings are available — no callers need to change.
 */
@Injectable()
export class ThemeClusteringService {
  private readonly logger = new Logger(ThemeClusteringService.name);

  /** Minimum Jaccard score (0–1) required to link to an existing theme. */
  private readonly CONFIDENCE_THRESHOLD = 0.35;

  constructor(private readonly prisma: PrismaService) {}

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Assign a single feedback item to the best-matching theme in the workspace.
   *
   * Priority:
   *   1. Embedding cosine similarity (future — when `embedding` arg is provided)
   *   2. Normalized-text Jaccard similarity (current MVP)
   *
   * Returns the themeId the feedback was assigned to, or null if skipped.
   */
  async assignFeedbackToTheme(
    workspaceId: string,
    feedbackId: string,
    _embedding?: number[],
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

    const feedbackText = this.buildSearchText(
      feedback.title,
      feedback.normalizedText ?? feedback.description,
    );

    // Fetch all non-archived themes in the workspace with their recent feedback
    const themes = await this.prisma.theme.findMany({
      where: { workspaceId, status: { not: 'ARCHIVED' } },
      select: {
        id: true,
        title: true,
        description: true,
        feedbacks: {
          take: 20,
          orderBy: { assignedAt: 'desc' },
          include: {
            feedback: {
              select: { title: true, normalizedText: true, description: true },
            },
          },
        },
      },
    });

    if (themes.length === 0) {
      return this.createCandidateTheme(workspaceId, feedbackId, feedback.title);
    }

    // Score each theme and pick the best
    let bestThemeId: string | null = null;
    let bestScore = 0;

    for (const theme of themes) {
      const score = this.scoreTheme(feedbackText, theme);
      if (score > bestScore) {
        bestScore = score;
        bestThemeId = theme.id;
      }
    }

    if (bestScore >= this.CONFIDENCE_THRESHOLD && bestThemeId) {
      await this.prisma.themeFeedback.upsert({
        where: { themeId_feedbackId: { themeId: bestThemeId, feedbackId } },
        create: { themeId: bestThemeId, feedbackId, assignedBy: 'ai', confidence: bestScore },
        update: { assignedBy: 'ai', confidence: bestScore },
      });
      this.logger.log(
        `Assigned feedback ${feedbackId} to theme ${bestThemeId} (score=${bestScore.toFixed(3)})`,
      );
      return bestThemeId;
    }

    // No good match — create a new candidate theme
    return this.createCandidateTheme(workspaceId, feedbackId, feedback.title);
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
   * Score a theme against a feedback's search text using Jaccard similarity.
   *
   * The theme's representative text is built from its title, description, and
   * the titles/normalized text of its most recently linked feedback items.
   *
   * Replacement point: swap this method body with a pgvector cosine query
   * once theme-level embeddings are available.
   */
  private scoreTheme(
    feedbackText: string,
    theme: {
      title: string;
      description: string | null;
      feedbacks: Array<{
        feedback: { title: string; normalizedText: string | null; description: string };
      }>;
    },
  ): number {
    const themeText = [
      theme.title,
      theme.description ?? '',
      ...theme.feedbacks.map(
        (tf) => tf.feedback.normalizedText ?? tf.feedback.title,
      ),
    ].join(' ');

    return this.jaccardSimilarity(feedbackText, themeText);
  }

  /** Jaccard similarity on word-level token sets. Returns a score in [0, 1]. */
  private jaccardSimilarity(a: string, b: string): number {
    const setA = new Set(this.tokenize(a));
    const setB = new Set(this.tokenize(b));

    if (setA.size === 0 && setB.size === 0) return 0;

    const intersection = new Set([...setA].filter((t) => setB.has(t)));
    const union = new Set([...setA, ...setB]);

    return intersection.size / union.size;
  }

  /** Lowercase, strip punctuation, split on whitespace, remove stop words. */
  private tokenize(text: string): string[] {
    const STOP_WORDS = new Set([
      'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'can', 'not', 'no', 'this', 'that', 'it',
      'its', 'i', 'we', 'you', 'they', 'he', 'she', 'my', 'our', 'your',
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
  }

  private buildSearchText(title: string, body: string): string {
    return `${title} ${body}`;
  }

  /**
   * Create a new DRAFT candidate theme seeded from a single feedback item.
   * The theme title is derived from the feedback title (truncated to 80 chars).
   */
  private async createCandidateTheme(
    workspaceId: string,
    feedbackId: string,
    feedbackTitle: string,
  ): Promise<string> {
    const candidateTitle =
      feedbackTitle.length > 80 ? `${feedbackTitle.slice(0, 77)}…` : feedbackTitle;

    const theme = await this.prisma.theme.create({
      data: {
        workspaceId,
        title: candidateTitle,
        status: 'DRAFT',
        feedbacks: {
          create: { feedbackId, assignedBy: 'ai', confidence: 1.0 },
        },
      },
    });

    this.logger.log(
      `Created candidate theme "${theme.title}" (${theme.id}) for feedback ${feedbackId}`,
    );
    return theme.id;
  }
}

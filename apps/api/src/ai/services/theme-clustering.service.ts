import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';

/**
 * ThemeClusteringService
 *
 * Semantic clustering using pgvector cosine similarity.
 * Assigns a single feedback item to the best-matching existing theme in the
 * same workspace. If no theme scores above the similarity threshold, a new
 * DRAFT candidate theme is created and its embedding is stored for future
 * incremental clustering.
 *
 * Tenant isolation is enforced by scoping all queries to `workspaceId`.
 * Clustering is async via BullMQ (see ThemeClusteringProcessor).
 */
@Injectable()
export class ThemeClusteringService {
  private readonly logger = new Logger(ThemeClusteringService.name);

  /** Cosine similarity threshold (0–1) required to link to an existing theme. */
  private readonly SIMILARITY_THRESHOLD = 0.8;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
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

    // Find the most similar theme using pgvector cosine similarity
    // Scoped to the workspace for tenant isolation
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
   * Create a new DRAFT candidate theme seeded from a single feedback item.
   * The theme title is derived from the feedback title (truncated to 80 chars).
   * If a feedbackEmbedding is provided, it is stored as the theme's embedding
   * for future incremental clustering.
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
        status: 'DRAFT',
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
      `Created candidate theme "${theme.title}" (${theme.id}) for feedback ${feedbackId}`,
    );
    return theme.id;
  }
}

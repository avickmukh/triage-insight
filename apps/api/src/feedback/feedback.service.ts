import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { WorkspaceStatus, FeedbackPrimarySource, FeedbackSecondarySource, FeedbackSourceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitService } from '../billing/plan-limit.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { UpdateFeedbackDto } from './dto/update-feedback.dto';
import { QueryFeedbackDto } from './dto/query-feedback.dto';
import { SemanticSearchDto } from './dto/semantic-search.dto';
import { S3Service } from '../uploads/services/s3.service';
import { EmbeddingService } from '../ai/services/embedding.service';
import { Prisma } from '@prisma/client';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { AI_ANALYSIS_QUEUE } from '../ai/processors/analysis.processor';
import { CIQ_SCORING_QUEUE } from '../ai/processors/ciq-scoring.processor';

// Shape returned by the pgvector raw query
export interface SemanticRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  sourceType: string;
  sentiment: number | null;
  createdAt: Date;
  similarity: number;
}

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    @InjectQueue(AI_ANALYSIS_QUEUE) private readonly analysisQueue: Queue,
    @InjectQueue(CIQ_SCORING_QUEUE) private readonly ciqQueue: Queue,
    private readonly planLimit: PlanLimitService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async create(workspaceId: string, createFeedbackDto: CreateFeedbackDto) {
    // Guard: reject if workspace is not active
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { status: true },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    if (workspace.status === WorkspaceStatus.FROZEN) {
      throw new UnprocessableEntityException(
        'This workspace is frozen pending a scheduled data purge. All mutations are blocked.',
      );
    }
    if (workspace.status !== WorkspaceStatus.ACTIVE) {
      throw new UnprocessableEntityException(
        'Feedback cannot be submitted to an inactive workspace.',
      );
    }

    // Guard: enforce monthly feedback limit for the workspace's plan
    await this.planLimit.assertCanAddFeedback(workspaceId);

    // Synchronous normalization: trim and store raw text before any mutation
    // Use nullish coalescing to guard against undefined values from CSV import
    // or any caller that omits optional fields.
    const rawTitle = (createFeedbackDto.title ?? '').trim() || 'Untitled';
    const rawDescription = (createFeedbackDto.description ?? '').trim();

    // ── Derive safe defaults for unified source fields if caller did not set them ──
    // This ensures all Feedback rows written through this service have both fields set,
    // even when called from legacy paths that pre-date the unified source model.
    const primarySource: FeedbackPrimarySource =
      createFeedbackDto.primarySource ??
      (createFeedbackDto.sourceType === FeedbackSourceType.VOICE
        ? FeedbackPrimarySource.VOICE
        : createFeedbackDto.sourceType === FeedbackSourceType.SURVEY
        ? FeedbackPrimarySource.SURVEY
        : FeedbackPrimarySource.FEEDBACK);

    const secondarySource: FeedbackSecondarySource =
      createFeedbackDto.secondarySource ??
      (createFeedbackDto.sourceType === FeedbackSourceType.VOICE
        ? FeedbackSecondarySource.TRANSCRIPT
        : createFeedbackDto.sourceType === FeedbackSourceType.SURVEY
        ? FeedbackSecondarySource.PORTAL
        : createFeedbackDto.sourceType === FeedbackSourceType.EMAIL
        ? FeedbackSecondarySource.EMAIL
        : createFeedbackDto.sourceType === FeedbackSourceType.SLACK
        ? FeedbackSecondarySource.SLACK
        : createFeedbackDto.sourceType === FeedbackSourceType.PUBLIC_PORTAL
        ? FeedbackSecondarySource.PORTAL
        : createFeedbackDto.sourceType === FeedbackSourceType.API
        ? FeedbackSecondarySource.API
        : createFeedbackDto.sourceType === FeedbackSourceType.CSV_IMPORT
        ? FeedbackSecondarySource.CSV_UPLOAD
        : FeedbackSecondarySource.MANUAL);

    const newFeedback = await this.prisma.feedback.create({
      data: {
        ...createFeedbackDto,
        title: rawTitle,
        description: rawDescription,
        // Preserve original text before any future normalization pipeline
        rawText: rawDescription,
        normalizedText: rawDescription.toLowerCase(),
        status: createFeedbackDto.status ?? 'NEW',
        workspaceId,
        // Always set unified source fields — override DTO values with resolved defaults
        primarySource,
        secondarySource,
      },
    });

    // Dispatch async AI analysis job — wrapped so Redis unavailability doesn't 500
    try {
      await this.analysisQueue.add({ feedbackId: newFeedback.id, workspaceId });
    } catch (e) {
      console.warn('[FeedbackService] analysisQueue unavailable — skipping', (e as Error).message);
    }

    // Dispatch CIQ scoring job — wrapped so Redis unavailability doesn't 500
    try {
      await this.ciqQueue.add({
        type: 'FEEDBACK_SCORED',
        workspaceId,
        feedbackId: newFeedback.id,
      });
    } catch (e) {
      console.warn('[FeedbackService] ciqQueue unavailable — skipping', (e as Error).message);
    }

    return newFeedback;
  }

  async findAll(workspaceId: string, query: QueryFeedbackDto) {
    const { page = 1, limit = 10, search, status, sourceType, primarySource, secondarySource, customerId } = query;
    const where: Prisma.FeedbackWhereInput = {
      workspaceId,
      status,
      // Legacy sourceType filter — kept for backward compat; prefer primarySource going forward
      ...(sourceType && { sourceType }),
      // Unified source filters — take precedence over legacy sourceType when both are set
      ...(primarySource && { primarySource }),
      ...(secondarySource && { secondarySource }),
      customerId,
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.feedback.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          attachments: true,
          customer: {
            select: {
              id: true,
              name: true,
              companyName: true,
              segment: true,
              arrValue: true,
              accountPriority: true,
              lifecycleStage: true,
            },
          },
          // Include linked themes so the Inbox list can show theme identifier pills.
          // Exclude ARCHIVED themes (absorbed by post-merge pass) so pills show
          // canonical theme names only.
          themes: {
            where: { theme: { status: { not: 'ARCHIVED' } } },
            include: {
              theme: {
                // ciqScore + priorityScore surfaced for Inbox decision context
                select: { id: true, title: true, shortLabel: true, ciqScore: true, priorityScore: true },
              },
            },
            orderBy: { confidence: 'desc' },
            take: 3,
          },
        },
      }),
      this.prisma.feedback.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(workspaceId: string, id: string) {
    const feedback = await this.prisma.feedback.findFirst({
      where: { id, workspaceId },
      include: {
        attachments: true,
        customer: {
          select: {
            id: true,
            name: true,
            companyName: true,
            segment: true,
            arrValue: true,
            mrrValue: true,
            accountPriority: true,
            lifecycleStage: true,
            churnRisk: true,
          },
        },
        // Include AI-assigned themes so the detail page can render theme pills.
        // Exclude ARCHIVED themes — these are themes absorbed by the post-clustering
        // merge pass. Showing them would display old sentence-style titles instead
        // of the canonical merged theme name. Sort by confidence desc so the best
        // match appears first. Include shortLabel for a cleaner display label.
        themes: {
          where: {
            theme: { status: { not: 'ARCHIVED' } },
          },
          include: {
            theme: {
              select: { id: true, title: true, status: true, shortLabel: true },
            },
          },
          orderBy: { confidence: 'desc' },
          take: 5,
        },
        // Include AI-generated duplicate suggestions (PENDING) for the detail page
        duplicateSuggestionsAsSource: {
          where: { status: 'PENDING' },
          include: {
            targetFeedback: {
              select: { id: true, title: true, status: true, createdAt: true },
            },
          },
          orderBy: { similarity: 'desc' },
          take: 10,
        },
      },
    });
    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }
    return feedback;
  }

  async update(workspaceId: string, id: string, updateFeedbackDto: UpdateFeedbackDto) {
    await this.findOne(workspaceId, id); // Check existence and ownership
    return this.prisma.feedback.update({
      where: { id },
      data: updateFeedbackDto,
    });
  }

  async remove(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id); // Check existence and ownership
    return this.prisma.feedback.delete({ where: { id } });
  }

  async createAttachmentPresignedUrl(workspaceId: string, feedbackId: string, fileName: string, contentType: string) {
    await this.findOne(workspaceId, feedbackId);
    const { signedUrl, key } = await this.s3.createPresignedUrl(workspaceId, fileName, contentType);

    return { signedUrl, key };
  }

  async confirmAttachment(workspaceId: string, feedbackId: string, key: string, fileName: string, mimeType: string, sizeBytes: number) {
    await this.findOne(workspaceId, feedbackId);
    
    return this.prisma.feedbackAttachment.create({
      data: {
        feedbackId,
        workspaceId,
        s3Key: key,
        s3Bucket: this.s3.getBucketName(),
        fileName,
        mimeType,
        sizeBytes,
      },
    });
  }

  /**
   * Re-enqueue the AI analysis pipeline for all unprocessed feedback in a workspace.
   *
   * Targets feedback where:
   *   - embedding IS NULL (never processed), OR
   *   - no ThemeFeedback link exists (processed but not yet clustered)
   *
   * IMPORTANT: Before re-queuing, we delete COMPLETED and FAILED AiJobLog records
   * for these feedback IDs. Without this, the JobIdempotencyService would see the
   * previous COMPLETED record (from a run where clustering failed silently) and
   * skip the job entirely — meaning themes would never be created on re-run.
   *
   * Jobs are added in batches of 50 to avoid overwhelming the queue.
   * Returns { enqueued, total }.
   */
  async reprocessPipeline(workspaceId: string): Promise<{ enqueued: number; total: number }> {
    // Find all feedback that needs processing: no embedding OR no theme link
    const unprocessed = await this.prisma.feedback.findMany({
      where: {
        workspaceId,
        status: { not: 'MERGED' },
        OR: [
          // Never went through the AI pipeline
          { normalizedText: null },
          // Went through pipeline but was never assigned to a theme
          { themes: { none: {} } },
        ],
      },
      select: { id: true },
    });

    const total = unprocessed.length;
    if (total === 0) {
      console.log(`[FeedbackService] reprocessPipeline: nothing to process for workspace ${workspaceId}`);
      return { enqueued: 0, total: 0 };
    }

    const feedbackIds = unprocessed.map((f) => f.id);

    // Clear stale idempotency records so the processor does not skip these jobs.
    // We only delete COMPLETED and FAILED records — RUNNING records are left
    // so we do not duplicate a job that is currently in-flight.
    const deleted = await this.prisma.aiJobLog.deleteMany({
      where: {
        workspaceId,
        entityId: { in: feedbackIds },
        status: { in: ['COMPLETED', 'FAILED', 'DEAD_LETTERED'] },
      },
    });
    console.log(
      `[FeedbackService] reprocessPipeline: cleared ${deleted.count} stale idempotency records`,
    );

    let enqueued = 0;
    const opts = { attempts: 3, backoff: { type: 'exponential', delay: 5000 } };

    // Batch into groups of 50 to avoid overwhelming the queue
    const BATCH = 50;
    for (let i = 0; i < feedbackIds.length; i += BATCH) {
      const batch = feedbackIds.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (feedbackId) => {
          try {
            await this.analysisQueue.add({ feedbackId, workspaceId }, opts);
            enqueued++;
          } catch (e) {
            console.warn(
              `[FeedbackService] reprocessPipeline: queue unavailable for ${feedbackId}`,
              (e as Error).message,
            );
          }
        }),
      );
    }

    console.log(
      `[FeedbackService] reprocessPipeline: enqueued ${enqueued}/${total} jobs for workspace ${workspaceId}`,
    );
    return { enqueued, total };
  }

  /**
   * Trigger CIQ re-scoring for all themes linked to a feedback item.
   * Called after feedback is merged or its customer ARR changes.
   */
  async triggerThemeCiqRescore(workspaceId: string, feedbackId: string): Promise<void> {
    const themeLinks = await this.prisma.themeFeedback.findMany({
      where: { feedbackId },
      select: { themeId: true },
    });
    for (const link of themeLinks) {
      try {
        await this.ciqQueue.add({
          type: 'THEME_SCORED',
          workspaceId,
          themeId: link.themeId,
        });
      } catch (e) {
        console.warn('[FeedbackService] ciqQueue unavailable — skipping rescore', (e as Error).message);
      }
    }
  }

  /**
   * Find potential duplicate feedback items for a given feedbackId.
   *
   * Primary path: return AI-generated suggestions from FeedbackDuplicateSuggestion
   * (populated asynchronously by DuplicateDetectionService after embedding generation).
   *
   * Fallback path: if no AI suggestions exist yet (e.g. embedding not yet generated),
   * use a keyword-overlap heuristic on normalizedText so the UI always has something
   * to show immediately after feedback creation.
   *
   * Both paths are scoped to the workspace for tenant isolation.
   */
  async findPotentialDuplicates(
    workspaceId: string,
    feedbackId: string,
    limit = 5,
  ): Promise<Array<{ id: string; title: string; score: number }>> {
    // Verify ownership before any data access
    await this.findOne(workspaceId, feedbackId);

    // ── Primary: AI-persisted embedding-based suggestions ─────────────────
    const aiSuggestions = await this.prisma.feedbackDuplicateSuggestion.findMany({
      where: {
        sourceId: feedbackId,
        status: 'PENDING',
        // Tenant isolation: both source and target must belong to this workspace
        targetFeedback: { workspaceId },
      },
      include: {
        targetFeedback: { select: { id: true, title: true } },
      },
      orderBy: { similarity: 'desc' },
      take: limit,
    });

    if (aiSuggestions.length > 0) {
      return aiSuggestions.map((s) => ({
        id: s.targetFeedback.id,
        title: s.targetFeedback.title,
        score: s.similarity,
      }));
    }

    // ── Fallback: keyword-overlap heuristic (pre-embedding) ───────────────
    const source = await this.prisma.feedback.findFirst({
      where: { id: feedbackId, workspaceId },
      select: { normalizedText: true, description: true },
    });
    if (!source) return [];

    const sourceText = (source.normalizedText ?? source.description).toLowerCase();
    const keywords = [...new Set(sourceText.match(/\b\w{4,}\b/g) ?? [])];
    if (keywords.length === 0) return [];

    const candidates = await this.prisma.feedback.findMany({
      where: {
        workspaceId,
        id: { not: feedbackId },
        status: { notIn: ['MERGED', 'ARCHIVED'] },
      },
      select: { id: true, title: true, normalizedText: true, description: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return candidates
      .map((c) => {
        const candidateText = (c.normalizedText ?? c.description).toLowerCase();
        const matches = keywords.filter((kw) => candidateText.includes(kw)).length;
        return { id: c.id, title: c.title, score: matches / keywords.length };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // ── Related Feedback ──────────────────────────────────────────────────────

  /**
   * GET /workspaces/:workspaceId/feedback/:id/related
   *
   * Returns up to 10 semantically related feedback items for a given feedback
   * item, using pgvector cosine similarity on the stored embedding.
   * Excludes the source item itself and any MERGED items.
   * Returns an empty array if the source has no embedding yet.
   *
   * Tenant isolation: all queries are scoped to workspaceId.
   */
  async findRelated(
    workspaceId: string,
    feedbackId: string,
  ): Promise<{ data: SemanticRow[]; sourceId: string }> {
    // Verify ownership
    const source = await this.prisma.feedback.findFirst({
      where: { id: feedbackId, workspaceId },
      select: { id: true },
    });
    if (!source) {
      throw new NotFoundException('Feedback not found');
    }

    // Check whether the source item has an embedding
    const embeddingCheck = await this.prisma.$queryRaw<{ has_embedding: boolean }[]>`
      SELECT (embedding IS NOT NULL) AS has_embedding
      FROM "Feedback"
      WHERE id = ${feedbackId}
        AND "workspaceId" = ${workspaceId}
      LIMIT 1;
    `;
    const hasEmbedding = embeddingCheck[0]?.has_embedding ?? false;
    if (!hasEmbedding) {
      return { data: [], sourceId: feedbackId };
    }

    // Use the stored embedding to find similar items in the same workspace
    const rows = await this.prisma.$queryRaw<SemanticRow[]>`
      SELECT
        f.id,
        f.title,
        f.description,
        f.status,
        f."sourceType",
        f.sentiment,
        f."createdAt",
        ROUND((1 - (f.embedding <=> src.embedding))::numeric, 4) AS similarity
      FROM "Feedback" f
      CROSS JOIN (
        SELECT embedding FROM "Feedback"
        WHERE id = ${feedbackId} AND "workspaceId" = ${workspaceId}
      ) src
      WHERE f."workspaceId" = ${workspaceId}
        AND f.id != ${feedbackId}
        AND f.embedding IS NOT NULL
        AND f.status != 'MERGED'
        AND 1 - (f.embedding <=> src.embedding) >= 0.5
      ORDER BY similarity DESC
      LIMIT 10;
    `;

    return { data: rows, sourceId: feedbackId };
  }

  // ── Semantic search ────────────────────────────────────────────────────────

  /**
   * GET /workspaces/:workspaceId/feedback/semantic-search?q=&limit=&threshold=
   *
   * Generates an embedding for the query string, then runs a pgvector cosine
   * similarity search against Feedback.embedding.  Only feedback that has
   * already been embedded (embedding IS NOT NULL) and belongs to the workspace
   * is considered.  Results are ordered by similarity descending.
   */
  async semanticSearch(
    workspaceId: string,
    dto: SemanticSearchDto,
  ): Promise<{ data: SemanticRow[]; query: string; model: string }> {
    const { q, limit = 10, threshold = 0.5 } = dto;

    // Generate embedding for the query string
    const queryEmbedding = await this.embeddingService.generateEmbedding(q);
    const vectorStr = `[${queryEmbedding.join(',')}]`;

    // pgvector cosine similarity — scoped to workspace, only embedded items
    const rows = await this.prisma.$queryRaw<SemanticRow[]>`
      SELECT
        id,
        title,
        description,
        status,
        "sourceType",
        sentiment,
        "createdAt",
        ROUND((1 - (embedding <=> ${vectorStr}::vector))::numeric, 4) AS similarity
      FROM "Feedback"
      WHERE "workspaceId" = ${workspaceId}
        AND embedding IS NOT NULL
        AND status != 'MERGED'
        AND 1 - (embedding <=> ${vectorStr}::vector) >= ${threshold}
      ORDER BY similarity DESC
      LIMIT ${limit};
    `;

    return {
      data: rows,
      query: q,
      model: 'text-embedding-3-small',
    };
  }

  // ── Comments ───────────────────────────────────────────────────────────────────

  /**
   * GET /workspaces/:workspaceId/feedback/:id/comments
   * Returns all FeedbackComment rows for the given feedback item,
   * ordered by createdAt ascending, with the author user record included.
   */
  async getComments(workspaceId: string, feedbackId: string) {
    const feedback = await this.prisma.feedback.findFirst({
      where: { id: feedbackId, workspaceId },
      select: { id: true },
    });
    if (!feedback) throw new NotFoundException('Feedback not found');

    return this.prisma.feedbackComment.findMany({
      where: { feedbackId, workspaceId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  /**
   * POST /workspaces/:workspaceId/feedback/:id/comments
   * Creates a new FeedbackComment authored by the authenticated workspace user.
   * Returns the created comment with the author user record.
   */
  async addComment(
    workspaceId: string,
    feedbackId: string,
    content: string,
    userId: string,
  ) {
    const feedback = await this.prisma.feedback.findFirst({
      where: { id: feedbackId, workspaceId },
      select: { id: true },
    });
    if (!feedback) throw new NotFoundException('Feedback not found');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true },
    });

    return this.prisma.feedbackComment.create({
      data: {
        workspaceId,
        feedbackId,
        userId,
        body: content,
        authorName: user
          ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email
          : undefined,
        authorEmail: user?.email,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  /**
   * Returns a snapshot of the current AI pipeline state for the workspace.
   * The frontend polls this every 3 seconds to show a blocking progress bar.
   * Stage is derived from running AiJobLog job types and persisted to Workspace.pipelineStatus
   * so it survives tab close / re-login.
   *
   * Stages: IDLE → QUEUED → ANALYZING → CLUSTERING → COMPLETED | FAILED
   */
  async getPipelineStatus(workspaceId: string): Promise<{
    isRunning: boolean;
    stage: string;
    total: number;
    completed: number;
    failed: number;
    pending: number;
    pct: number;
    estimatedSecondsLeft: number | null;
  }> {
    // Scope to jobs created in the last 24 hours to capture the current batch
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // A RUNNING record is considered stale (orphaned) if it has been in that
    // state for more than 10 minutes — the idempotency TTL window. Stale
    // records are excluded from the pending count so they don't block
    // completion detection forever.
    const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);

    const [total, completed, failed, pending, runningJobs, workspace] = await Promise.all([
      this.prisma.aiJobLog.count({
        where: { workspaceId, createdAt: { gte: since } },
      }),
      this.prisma.aiJobLog.count({
        where: { workspaceId, status: 'COMPLETED', createdAt: { gte: since } },
      }),
      this.prisma.aiJobLog.count({
        where: { workspaceId, status: { in: ['FAILED', 'DEAD_LETTERED'] }, createdAt: { gte: since } },
      }),
      // Only count RUNNING records (markStarted never creates QUEUED records).
      // Exclude stale RUNNING records older than 10 min (orphaned / crashed jobs).
      this.prisma.aiJobLog.count({
        where: {
          workspaceId,
          status: 'RUNNING',
          createdAt: { gte: since },
          startedAt: { gte: staleThreshold },
        },
      }),
      this.prisma.aiJobLog.findMany({
        where: { workspaceId, status: 'RUNNING', createdAt: { gte: since } },
        select: { jobType: true },
        take: 5,
      }),
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { pipelineStatus: true },
      }),
    ]);

    const isRunning = pending > 0;
    const pct = total === 0 ? 100 : Math.round(((completed + failed) / total) * 100);

    // Derive human-readable stage from running job types
    let stage = workspace?.pipelineStatus ?? 'IDLE';
    if (isRunning) {
      const runningTypes = runningJobs.map((j) => String(j.jobType));
      if (runningTypes.includes('THEME_CLUSTERING')) {
        stage = 'CLUSTERING';
      } else if (runningTypes.includes('FEEDBACK_SUMMARY')) {
        stage = 'ANALYZING';
      } else {
        stage = 'QUEUED';
      }
    } else if (total > 0 && pending === 0) {
      stage = failed > 0 && completed === 0 ? 'FAILED' : 'COMPLETED';
    }

    // Persist stage back to workspace so it survives tab close / re-login
    if (stage !== (workspace?.pipelineStatus ?? 'IDLE')) {
      this.prisma.workspace.update({
        where: { id: workspaceId },
        data: { pipelineStatus: stage, pipelineUpdatedAt: new Date() },
      }).catch(() => { /* non-critical */ });
    }

    // Estimate seconds remaining based on average completed job duration
    let estimatedSecondsLeft: number | null = null;
    if (isRunning && completed > 0) {
      const avgDuration = await this.prisma.aiJobLog.aggregate({
        where: {
          workspaceId,
          status: 'COMPLETED',
          createdAt: { gte: since },
          durationMs: { not: null },
        },
        _avg: { durationMs: true },
      });
      const avgMs = avgDuration._avg.durationMs ?? 2000;
      estimatedSecondsLeft = Math.ceil((pending * avgMs) / 1000);
    }

    return { isRunning, stage, total, completed, failed, pending, pct, estimatedSecondsLeft };
  }

  /**
   * Mark the workspace pipeline as QUEUED immediately after a CSV import or reprocess trigger.
   * This ensures the frontend shows the loader without waiting for the first poll cycle.
   */
  async markPipelineStarted(workspaceId: string): Promise<void> {
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { pipelineStatus: 'QUEUED', pipelineUpdatedAt: new Date() },
    }).catch(() => { /* non-critical */ });
  }

  // ── Bulk Actions (Step 3 Gap Fix) ──────────────────────────────────────────

  /**
   * Bulk dismiss: sets status to ARCHIVED for all given feedbackIds
   * that belong to the workspace.
   */
  async bulkDismiss(workspaceId: string, feedbackIds: string[]): Promise<{ updated: number }> {
    const result = await this.prisma.feedback.updateMany({
      where: { id: { in: feedbackIds }, workspaceId },
      data: { status: 'ARCHIVED' as any },
    });
    return { updated: result.count };
  }

  /**
   * Bulk assign: links all feedbackIds to a theme via ThemeFeedback upsert.
   * Skips items that do not belong to the workspace.
   */
  async bulkAssignToTheme(
    workspaceId: string,
    feedbackIds: string[],
    themeId: string,
  ): Promise<{ assigned: number }> {
    // Verify theme belongs to workspace
    const theme = await this.prisma.theme.findFirst({ where: { id: themeId, workspaceId } });
    if (!theme) throw new NotFoundException('Theme not found');

    // Verify all feedback items belong to workspace
    const valid = await this.prisma.feedback.findMany({
      where: { id: { in: feedbackIds }, workspaceId },
      select: { id: true },
    });
    const validIds = valid.map((f) => f.id);
    if (validIds.length === 0) return { assigned: 0 };

    // Upsert ThemeFeedback links
    await this.prisma.$transaction(
      validIds.map((feedbackId) =>
        this.prisma.themeFeedback.upsert({
          where: { themeId_feedbackId: { themeId, feedbackId } },
          create: { themeId, feedbackId, assignedBy: 'manual' },
          update: { assignedBy: 'manual', confidence: null },
        }),
      ),
    );

    // Enqueue CIQ re-score for the theme
    try {
      await this.ciqQueue.add({ type: 'THEME_SCORED', workspaceId, themeId });
    } catch (queueErr) {
      console.warn('[Queue] Redis unavailable — CIQ re-score skipped:', (queueErr as Error).message);
    }

    return { assigned: validIds.length };
  }
}

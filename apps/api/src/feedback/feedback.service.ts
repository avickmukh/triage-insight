import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { WorkspaceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitService } from '../billing/plan-limit.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { UpdateFeedbackDto } from './dto/update-feedback.dto';
import { QueryFeedbackDto } from './dto/query-feedback.dto';
import { S3Service } from '../uploads/services/s3.service';
import { Prisma } from '@prisma/client';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { AI_ANALYSIS_QUEUE } from '../ai/processors/analysis.processor';
import { CIQ_SCORING_QUEUE } from '../ai/processors/ciq-scoring.processor';

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    @InjectQueue(AI_ANALYSIS_QUEUE) private readonly analysisQueue: Queue,
    @InjectQueue(CIQ_SCORING_QUEUE) private readonly ciqQueue: Queue,
    private readonly planLimit: PlanLimitService,
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
    const rawTitle = createFeedbackDto.title.trim();
    const rawDescription = createFeedbackDto.description.trim();

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
    const { page = 1, limit = 10, search, status, sourceType, customerId } = query;
    const where: Prisma.FeedbackWhereInput = {
      workspaceId,
      status,
      sourceType,
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
          // Include linked themes so the Inbox list can show theme identifier pills
          themes: {
            include: {
              theme: {
                select: { id: true, title: true },
              },
            },
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
        // Include AI-assigned themes so the detail page can render theme pills
        themes: {
          include: {
            theme: {
              select: { id: true, title: true, status: true },
            },
          },
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
}

import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { FeedbackStatus, FeedbackSourceType, WorkspaceStatus } from '@prisma/client';
import { AI_ANALYSIS_QUEUE } from '../ai/processors/analysis.processor';
import { PortalCreateFeedbackDto } from './dto/portal-create-feedback.dto';
import { PublicFeedbackQueryDto } from '../public/dto/public-feedback-query.dto';
import { PublicVoteDto } from '../public/dto/public-vote.dto';
import { PublicCommentDto } from '../public/dto/public-comment.dto';
import {
  PORTAL_SIGNAL_QUEUE,
  PORTAL_SIGNAL_JOB,
} from '../public/portal-signal.constants';

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(AI_ANALYSIS_QUEUE) private readonly analysisQueue: Queue,
    @InjectQueue(PORTAL_SIGNAL_QUEUE) private readonly signalQueue: Queue,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Resolve workspace by orgSlug, enforce it is ACTIVE, or throw.
   * Cross-tenant safety: all downstream queries are scoped to workspace.id.
   */
  private async resolveWorkspace(orgSlug: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug: orgSlug },
      select: { id: true, name: true, slug: true, status: true },
    });
    if (!workspace) {
      throw new NotFoundException(`Workspace '${orgSlug}' not found`);
    }
    if (workspace.status !== WorkspaceStatus.ACTIVE) {
      throw new UnprocessableEntityException(
        'This workspace is not currently accepting feedback.',
      );
    }
    return workspace;
  }

  /**
   * Look up an existing PortalUser by (workspaceId, email), or create a new
   * one. Returns null when no email is provided (fully anonymous).
   */
  private async resolvePortalUser(
    workspaceId: string,
    email?: string,
    name?: string,
  ): Promise<string | null> {
    if (!email) return null;

    const existing = await this.prisma.portalUser.findUnique({
      where: { workspaceId_email: { workspaceId, email } },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await this.prisma.portalUser.create({
      data: { workspaceId, email, name: name ?? null },
      select: { id: true },
    });
    return created.id;
  }

  /** Resolve a feedback item scoped to the workspace or throw 404. */
  private async resolveFeedback(workspaceId: string, feedbackId: string) {
    const feedback = await this.prisma.feedback.findFirst({
      where: { id: feedbackId, workspaceId },
      select: { id: true, workspaceId: true },
    });
    if (!feedback) {
      throw new NotFoundException('Feedback item not found');
    }
    return feedback;
  }

  // ─── 1. List Feedback ─────────────────────────────────────────────────────

  async listFeedback(orgSlug: string, query: PublicFeedbackQueryDto) {
    const workspace = await this.resolveWorkspace(orgSlug);
    const { page = 1, limit = 20, search } = query;

    const excludedStatuses: FeedbackStatus[] = [
      FeedbackStatus.ARCHIVED,
      FeedbackStatus.MERGED,
    ];

    const where = {
      workspaceId: workspace.id,
      status: { notIn: excludedStatuses },
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.feedback.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          createdAt: true,
          _count: { select: { votes: true, comments: true } },
        },
      }),
      this.prisma.feedback.count({ where }),
    ]);

    return {
      data: items.map((item) => ({
        ...item,
        voteCount: item._count.votes,
        commentCount: item._count.comments,
        _count: undefined,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── 2. Feedback Detail ───────────────────────────────────────────────────

  async getFeedbackDetail(orgSlug: string, feedbackId: string) {
    const workspace = await this.resolveWorkspace(orgSlug);

    const feedback = await this.prisma.feedback.findFirst({
      where: {
        id: feedbackId,
        workspaceId: workspace.id,
        status: {
          notIn: [FeedbackStatus.ARCHIVED, FeedbackStatus.MERGED],
        },
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        createdAt: true,
        _count: { select: { votes: true } },
        comments: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            body: true,
            authorName: true,
            createdAt: true,
          },
        },
      },
    });

    if (!feedback) {
      throw new NotFoundException('Feedback item not found');
    }

    return {
      ...feedback,
      voteCount: feedback._count.votes,
      _count: undefined,
    };
  }

  // ─── 3. Create Feedback ───────────────────────────────────────────────────

  async createFeedback(orgSlug: string, dto: PortalCreateFeedbackDto) {
    const workspace = await this.resolveWorkspace(orgSlug);
    const portalUserId = await this.resolvePortalUser(
      workspace.id,
      dto.email,
      dto.name,
    );

    // Synchronous normalization: trim before persisting
    const rawTitle = dto.title.trim();
    const rawDescription = dto.description.trim();

    const feedback = await this.prisma.feedback.create({
      data: {
        workspaceId: workspace.id,
        title: rawTitle,
        description: rawDescription,
        rawText: rawDescription,
        normalizedText: rawDescription.toLowerCase(),
        sourceType: FeedbackSourceType.PUBLIC_PORTAL,
        status: FeedbackStatus.NEW,
        // Link to resolved PortalUser (null for anonymous submissions)
        portalUserId: portalUserId ?? undefined,
        // customerId is a CRM Customer FK — never set it to an email string
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        sourceType: true,
        createdAt: true,
      },
    });

    // Dispatch async AI analysis job (embedding + duplicate detection)
    try {
    await this.analysisQueue.add({ feedbackId: feedback.id });
    } catch (queueErr) {
      console.warn('[Queue] Redis unavailable — job skipped:', (queueErr as Error).message);
    }

    // Publish portal signal (non-critical)
    this.signalQueue
      .add(
        PORTAL_SIGNAL_JOB.FEEDBACK_CREATED,
        {
          workspaceId: workspace.id,
          workspaceSlug: workspace.slug,
          feedbackId: feedback.id,
          actorType: portalUserId ? 'PortalUser' : 'Anonymous',
          timestamp: new Date().toISOString(),
        },
        { attempts: 2, removeOnComplete: true },
      )
      .catch(() => {/* non-critical */});

    return {
      ...feedback,
      portalUserId,
    };
  }

  // ─── 4. Roadmap ───────────────────────────────────────────────────────────

  async listRoadmap(orgSlug: string) {
    const workspace = await this.resolveWorkspace(orgSlug);

    const items = await this.prisma.roadmapItem.findMany({
      where: { workspaceId: workspace.id, isPublic: true },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        targetQuarter: true,
        targetYear: true,
        customerCount: true,
        priorityScore: true,
        createdAt: true,
        theme: { select: { id: true, title: true } },
      },
    });

    return { data: items };
  }

  // ─── 5. Vote ──────────────────────────────────────────────────────────────

  async vote(orgSlug: string, feedbackId: string, dto: PublicVoteDto) {
    const workspace = await this.resolveWorkspace(orgSlug);
    await this.resolveFeedback(workspace.id, feedbackId);

    const portalUserId = await this.resolvePortalUser(
      workspace.id,
      dto.email,
      dto.name,
    );

    // Duplicate-vote guard
    if (portalUserId) {
      const existing = await this.prisma.feedbackVote.findFirst({
        where: { feedbackId, portalUserId },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('You have already voted for this item');
      }
    } else if (dto.anonymousId) {
      const existing = await this.prisma.feedbackVote.findFirst({
        where: { feedbackId, anonymousId: dto.anonymousId },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('You have already voted for this item');
      }
    }

    const vote = await this.prisma.feedbackVote.create({
      data: {
        workspaceId: workspace.id,
        feedbackId,
        portalUserId: portalUserId ?? undefined,
        anonymousId: !portalUserId ? (dto.anonymousId ?? null) : null,
      },
      select: { id: true, feedbackId: true, createdAt: true },
    });

    const voteCount = await this.prisma.feedbackVote.count({
      where: { feedbackId },
    });

    // Publish portal signal (non-critical)
    this.signalQueue
      .add(
        PORTAL_SIGNAL_JOB.FEEDBACK_VOTED,
        {
          workspaceId: workspace.id,
          workspaceSlug: workspace.slug,
          feedbackId,
          actorType: portalUserId ? 'PortalUser' : 'Anonymous',
          timestamp: new Date().toISOString(),
        },
        { attempts: 2, removeOnComplete: true },
      )
      .catch(() => {/* non-critical */});

    return { ...vote, voteCount };
  }

  // ─── 6. Comment ───────────────────────────────────────────────────────────

  async addComment(
    orgSlug: string,
    feedbackId: string,
    dto: PublicCommentDto,
  ) {
    const workspace = await this.resolveWorkspace(orgSlug);
    await this.resolveFeedback(workspace.id, feedbackId);

    const portalUserId = await this.resolvePortalUser(
      workspace.id,
      dto.email,
      dto.name,
    );

    const comment = await this.prisma.feedbackComment.create({
      data: {
        workspaceId: workspace.id,
        feedbackId,
        body: dto.body,
        authorName: dto.name ?? (dto.email ? dto.email.split('@')[0] : null),
        authorEmail: dto.email ?? null,
        portalUserId: portalUserId ?? undefined,
        anonymousId: !portalUserId ? (dto.anonymousId ?? null) : null,
      },
      select: {
        id: true,
        feedbackId: true,
        body: true,
        authorName: true,
        createdAt: true,
      },
    });

    // Publish portal signal (non-critical)
    this.signalQueue
      .add(
        PORTAL_SIGNAL_JOB.FEEDBACK_COMMENTED,
        {
          workspaceId: workspace.id,
          workspaceSlug: workspace.slug,
          feedbackId,
          actorType: portalUserId ? 'PortalUser' : 'Anonymous',
          timestamp: new Date().toISOString(),
          data: {
            authorName: comment.authorName,
            body: comment.body.substring(0, 100),
          },
        },
        { attempts: 2, removeOnComplete: true },
      )
      .catch(() => {/* non-critical */});

    return comment;
  }
}

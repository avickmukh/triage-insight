import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { PublicVoteDto } from './dto/public-vote.dto';
import { PublicCommentDto } from './dto/public-comment.dto';
import { PublicFeedbackQueryDto } from './dto/public-feedback-query.dto';
import { FeedbackStatus, FeedbackSourceType } from '@prisma/client';
import {
  PORTAL_SIGNAL_QUEUE,
  PORTAL_SIGNAL_JOB,
} from './portal-signal.constants';

@Injectable()
export class PublicPortalService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(PORTAL_SIGNAL_QUEUE) private readonly signalQueue: Queue,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Resolve workspace by slug or throw 404. */
  private async resolveWorkspace(workspaceSlug: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug: workspaceSlug },
      select: { id: true, name: true, slug: true },
    });
    if (!workspace) {
      throw new NotFoundException(`Workspace '${workspaceSlug}' not found`);
    }
    return workspace;
  }

  /**
   * Look up an existing PortalUser by email within the workspace, or create
   * a new one. Returns null when neither email nor name is provided (fully
   * anonymous interaction).
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

  /** Resolve a feedback item that belongs to the workspace or throw 404. */
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

  // ─── Public Feedback List ─────────────────────────────────────────────────

  async listFeedback(workspaceSlug: string, query: PublicFeedbackQueryDto) {
    const workspace = await this.resolveWorkspace(workspaceSlug);
    const { page = 1, limit = 20, search } = query;

    // Only expose non-archived, non-merged feedback on the public portal
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

  // ─── Public Feedback Detail ───────────────────────────────────────────────

  async getFeedbackDetail(workspaceSlug: string, feedbackId: string) {
    const workspace = await this.resolveWorkspace(workspaceSlug);

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

  // ─── Public Roadmap ───────────────────────────────────────────────────────

  async listRoadmap(workspaceSlug: string) {
    const workspace = await this.resolveWorkspace(workspaceSlug);

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
        createdAt: true,
      },
    });

    return { data: items };
  }

  // ─── Create Feedback ──────────────────────────────────────────────────────

  async createFeedback(
    workspaceSlug: string,
    dto: { title: string; description: string; email?: string; name?: string },
  ) {
    const workspace = await this.resolveWorkspace(workspaceSlug);
    const portalUserId = await this.resolvePortalUser(
      workspace.id,
      dto.email,
      dto.name,
    );

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
        portalUserId: portalUserId ?? undefined,
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

    return { ...feedback, portalUserId };
  }

  // ─── Vote ─────────────────────────────────────────────────────────────────

  async vote(
    workspaceSlug: string,
    feedbackId: string,
    dto: PublicVoteDto,
  ) {
    const workspace = await this.resolveWorkspace(workspaceSlug);
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

    // Return updated vote count alongside the new vote record
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

  // ─── Comment ──────────────────────────────────────────────────────────────

  async addComment(
    workspaceSlug: string,
    feedbackId: string,
    dto: PublicCommentDto,
  ) {
    const workspace = await this.resolveWorkspace(workspaceSlug);
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

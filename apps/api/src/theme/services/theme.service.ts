import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { ThemeRepository } from '../repositories/theme.repository';
import { AuditService } from '../../ai/services/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateThemeDto } from '../dto/create-theme.dto';
import { UpdateThemeDto } from '../dto/update-theme.dto';
import { QueryThemeDto } from '../dto/query-theme.dto';
import { SplitThemeDto } from '../dto/split-theme.dto';
import { MoveFeedbackDto } from '../dto/move-feedback.dto';
import { AuditLogAction } from '@prisma/client';

export const AI_CLUSTERING_QUEUE = 'ai-clustering';

@Injectable()
export class ThemeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly themeRepository: ThemeRepository,
    private readonly auditService: AuditService,
    @InjectQueue(AI_CLUSTERING_QUEUE) private readonly clusteringQueue: Queue,
  ) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async create(workspaceId: string, userId: string, createThemeDto: CreateThemeDto) {
    const { title, description, feedbackIds } = createThemeDto;

    const theme = await this.themeRepository.create(workspaceId, {
      title,
      description,
      ...(feedbackIds && feedbackIds.length > 0 && {
        feedbacks: {
          create: feedbackIds.map((id) => ({ feedbackId: id, assignedBy: 'manual' })),
        },
      }),
    });

    await this.auditService.logAction(workspaceId, userId, AuditLogAction.THEME_CREATE, { themeId: theme.id, title });
    return theme;
  }

  async findAll(workspaceId: string, query: QueryThemeDto) {
    return this.themeRepository.findMany(workspaceId, query);
  }

  /**
   * Return theme detail with:
   * - linked feedback items (paginated, default 50)
   * - real feedbackCount from _count
   * - aggregated priorityScore from linked feedback impactScores
   */
  async findOne(workspaceId: string, id: string) {
    const theme = await this.prisma.theme.findFirst({
      where: { id, workspaceId },
      include: {
        _count: { select: { feedbacks: true } },
        feedbacks: {
          take: 50,
          orderBy: { assignedAt: 'desc' },
          include: {
            feedback: {
              select: {
                id: true,
                title: true,
                description: true,
                status: true,
                sourceType: true,
                sentiment: true,
                impactScore: true,
                createdAt: true,
                submittedAt: true,
                customerId: true,
                portalUserId: true,
              },
            },
          },
        },
      },
    });

    if (!theme) {
      throw new NotFoundException('Theme not found');
    }

    // Aggregate priority score: mean of non-null impactScores across linked feedback
    const impactScores = theme.feedbacks
      .map((tf) => tf.feedback.impactScore)
      .filter((v): v is number => v !== null && v !== undefined);

    const aggregatedPriorityScore =
      impactScores.length > 0
        ? impactScores.reduce((a, b) => a + b, 0) / impactScores.length
        : null;

    // Flatten linked feedback for the response
    const linkedFeedback = theme.feedbacks.map((tf) => ({
      ...tf.feedback,
      assignedAt: tf.assignedAt,
      assignedBy: tf.assignedBy,
      confidence: tf.confidence,
    }));

    return {
      id: theme.id,
      workspaceId: theme.workspaceId,
      title: theme.title,
      description: theme.description,
      status: theme.status,
      pinned: theme.pinned,
      createdAt: theme.createdAt,
      updatedAt: theme.updatedAt,
      feedbackCount: theme._count.feedbacks,
      aggregatedPriorityScore,
      linkedFeedback,
    };
  }

  async update(workspaceId: string, userId: string, id: string, updateThemeDto: UpdateThemeDto) {
    await this.findOne(workspaceId, id);
    const updatedTheme = await this.themeRepository.update(id, updateThemeDto);
    await this.auditService.logAction(workspaceId, userId, AuditLogAction.THEME_UPDATE, { themeId: id, changes: updateThemeDto });
    return updatedTheme;
  }

  // ─── Feedback linking ─────────────────────────────────────────────────────

  /**
   * List all feedback linked to a theme (paginated).
   */
  async listLinkedFeedback(
    workspaceId: string,
    themeId: string,
    page = 1,
    limit = 50,
  ) {
    // Verify theme belongs to workspace
    const theme = await this.prisma.theme.findFirst({ where: { id: themeId, workspaceId } });
    if (!theme) throw new NotFoundException('Theme not found');

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.themeFeedback.findMany({
        where: { themeId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { assignedAt: 'desc' },
        include: {
          feedback: {
            select: {
              id: true,
              title: true,
              description: true,
              status: true,
              sourceType: true,
              sentiment: true,
              impactScore: true,
              createdAt: true,
              submittedAt: true,
              customerId: true,
              portalUserId: true,
            },
          },
        },
      }),
      this.prisma.themeFeedback.count({ where: { themeId } }),
    ]);

    const data = rows.map((tf) => ({
      ...tf.feedback,
      assignedAt: tf.assignedAt,
      assignedBy: tf.assignedBy,
      confidence: tf.confidence,
    }));

    return { data, total, page, limit };
  }

  /**
   * Add a single feedback item to a theme (manual assignment).
   */
  async addFeedback(workspaceId: string, userId: string, themeId: string, feedbackId: string) {
    // Verify theme belongs to workspace
    const theme = await this.prisma.theme.findFirst({ where: { id: themeId, workspaceId } });
    if (!theme) throw new NotFoundException('Theme not found');

    // Verify feedback belongs to workspace
    const feedback = await this.prisma.feedback.findFirst({ where: { id: feedbackId, workspaceId } });
    if (!feedback) throw new NotFoundException('Feedback not found');

    await this.prisma.themeFeedback.upsert({
      where: { themeId_feedbackId: { themeId, feedbackId } },
      create: { themeId, feedbackId, assignedBy: 'manual' },
      update: { assignedBy: 'manual', confidence: null },
    });

    await this.auditService.logAction(workspaceId, userId, AuditLogAction.THEME_FEEDBACK_ADD, {
      themeId,
      feedbackIds: [feedbackId],
    });

    return { success: true };
  }

  /**
   * Remove a single feedback item from a theme.
   */
  async removeFeedback(workspaceId: string, userId: string, themeId: string, feedbackId: string) {
    // Verify theme belongs to workspace
    const theme = await this.prisma.theme.findFirst({ where: { id: themeId, workspaceId } });
    if (!theme) throw new NotFoundException('Theme not found');

    const existing = await this.prisma.themeFeedback.findUnique({
      where: { themeId_feedbackId: { themeId, feedbackId } },
    });
    if (!existing) {
      throw new BadRequestException('Feedback is not linked to this theme');
    }

    await this.prisma.themeFeedback.delete({
      where: { themeId_feedbackId: { themeId, feedbackId } },
    });

    await this.auditService.logAction(workspaceId, userId, AuditLogAction.THEME_FEEDBACK_REMOVE, {
      themeId,
      feedbackIds: [feedbackId],
    });

    return { success: true };
  }

  // ─── Bulk feedback move ───────────────────────────────────────────────────

  async moveFeedback(workspaceId: string, userId: string, moveFeedbackDto: MoveFeedbackDto) {
    const { feedbackIds, sourceThemeId, targetThemeId } = moveFeedbackDto;

    if (!sourceThemeId && !targetThemeId) {
      throw new BadRequestException('Either sourceThemeId or targetThemeId must be provided.');
    }

    if (sourceThemeId) {
      await this.prisma.themeFeedback.deleteMany({
        where: { themeId: sourceThemeId, feedbackId: { in: feedbackIds } },
      });
      await this.auditService.logAction(workspaceId, userId, AuditLogAction.THEME_FEEDBACK_REMOVE, {
        themeId: sourceThemeId,
        feedbackIds,
      });
    }

    if (targetThemeId) {
      await this.prisma.themeFeedback.createMany({
        data: feedbackIds.map((id) => ({ themeId: targetThemeId, feedbackId: id, assignedBy: 'manual' })),
        skipDuplicates: true,
      });
      await this.auditService.logAction(workspaceId, userId, AuditLogAction.THEME_FEEDBACK_ADD, {
        themeId: targetThemeId,
        feedbackIds,
      });
    }

    return { success: true };
  }

  // ─── Merge / Split ────────────────────────────────────────────────────────

  async merge(workspaceId: string, userId: string, targetThemeId: string, sourceThemeIds: string[]) {
    if (sourceThemeIds.includes(targetThemeId)) {
      throw new BadRequestException('Cannot merge a theme into itself.');
    }

    return this.prisma.$transaction(async (tx) => {
      // For each source theme, re-link its feedback to the target theme.
      // Use upsert to avoid @@id constraint violations when a feedback item
      // is already linked to the target theme.
      const sourceLinks = await tx.themeFeedback.findMany({
        where: { themeId: { in: sourceThemeIds } },
      });

      for (const link of sourceLinks) {
        await tx.themeFeedback.upsert({
          where: { themeId_feedbackId: { themeId: targetThemeId, feedbackId: link.feedbackId } },
          create: {
            themeId: targetThemeId,
            feedbackId: link.feedbackId,
            assignedBy: link.assignedBy,
            confidence: link.confidence,
          },
          update: {}, // keep existing link unchanged if already present
        });
      }

      // Delete source theme feedback links (now migrated)
      await tx.themeFeedback.deleteMany({ where: { themeId: { in: sourceThemeIds } } });

      // Delete the source themes
      await tx.theme.deleteMany({ where: { id: { in: sourceThemeIds }, workspaceId } });

      await this.auditService.logAction(workspaceId, userId, AuditLogAction.THEME_MERGE, {
        targetThemeId,
        sourceThemeIds,
      });

      return this.findOne(workspaceId, targetThemeId);
    });
  }

  async split(workspaceId: string, userId: string, sourceThemeId: string, splitThemeDto: SplitThemeDto) {
    const { newThemeTitle, newThemeDescription, feedbackIdsToMove } = splitThemeDto;

    return this.prisma.$transaction(async (tx) => {
      // 1. Create the new theme
      const newTheme = await tx.theme.create({
        data: { workspaceId, title: newThemeTitle, description: newThemeDescription },
      });

      // 2. Re-link selected feedback to the new theme using upsert
      const sourceLinks = await tx.themeFeedback.findMany({
        where: { themeId: sourceThemeId, feedbackId: { in: feedbackIdsToMove } },
      });

      for (const link of sourceLinks) {
        await tx.themeFeedback.upsert({
          where: { themeId_feedbackId: { themeId: newTheme.id, feedbackId: link.feedbackId } },
          create: {
            themeId: newTheme.id,
            feedbackId: link.feedbackId,
            assignedBy: link.assignedBy,
            confidence: link.confidence,
          },
          update: {},
        });
      }

      // 3. Remove from source
      await tx.themeFeedback.deleteMany({
        where: { themeId: sourceThemeId, feedbackId: { in: feedbackIdsToMove } },
      });

      await this.auditService.logAction(workspaceId, userId, AuditLogAction.THEME_SPLIT, {
        sourceThemeId,
        newThemeId: newTheme.id,
        feedbackIdsToMove,
      });

      return newTheme;
    });
  }

  // ─── Reclustering ─────────────────────────────────────────────────────────

  async triggerReclustering(workspaceId: string) {
    const job = await this.clusteringQueue.add({ workspaceId });
    return { message: 'Theme reclustering job dispatched.', jobId: job.id };
  }
}

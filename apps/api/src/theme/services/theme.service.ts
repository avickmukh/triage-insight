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
import { AuditLogAction, ThemeStatus } from '@prisma/client';

export const AI_CLUSTERING_QUEUE = 'ai-clustering';

@Injectable()
export class ThemeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly themeRepository: ThemeRepository,
    private readonly auditService: AuditService,
    @InjectQueue(AI_CLUSTERING_QUEUE) private readonly clusteringQueue: Queue,
  ) {}

  async create(workspaceId: string, userId: string, createThemeDto: CreateThemeDto) {
    const { title, description, feedbackIds } = createThemeDto;

    const theme = await this.themeRepository.create(workspaceId, {
      title,
      description,
      ...(feedbackIds && {
        feedbacks: {
          create: feedbackIds.map((id) => ({ feedbackId: id })),
        },
      }),
    });

    await this.auditService.logAction(workspaceId, userId, AuditLogAction.THEME_CREATE, { themeId: theme.id, title });
    return theme;
  }

  async findAll(workspaceId: string, query: QueryThemeDto) {
    return this.themeRepository.findMany(workspaceId, query);
  }

  async findOne(workspaceId: string, id: string) {
    const theme = await this.themeRepository.findById(workspaceId, id);
    if (!theme) {
      throw new NotFoundException('Theme not found');
    }
    // Placeholder for aggregated data
    return { ...theme, customerCount: 0, revenueImpactValue: 0, dealInfluenceValue: 0 };
  }

  async update(workspaceId: string, userId: string, id: string, updateThemeDto: UpdateThemeDto) {
    await this.findOne(workspaceId, id);
    const updatedTheme = await this.themeRepository.update(id, updateThemeDto);
    await this.auditService.logAction(workspaceId, userId, AuditLogAction.THEME_UPDATE, { themeId: id, changes: updateThemeDto });
    return updatedTheme;
  }

  async merge(workspaceId: string, userId: string, targetThemeId: string, sourceThemeIds: string[]) {
    if (sourceThemeIds.includes(targetThemeId)) {
      throw new BadRequestException('Cannot merge a theme into itself.');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Move all feedback from source themes to target theme
      await tx.themeFeedback.updateMany({
        where: { themeId: { in: sourceThemeIds } },
        data: { themeId: targetThemeId },
      });

      // 2. Delete the source themes
      await tx.theme.deleteMany({ where: { id: { in: sourceThemeIds }, workspaceId } });

      await this.auditService.logAction(workspaceId, userId, AuditLogAction.THEME_MERGE, { targetThemeId, sourceThemeIds });

      return this.findOne(workspaceId, targetThemeId);
    });
  }

  async split(workspaceId: string, userId: string, sourceThemeId: string, splitThemeDto: SplitThemeDto) {
    const { newThemeTitle, newThemeDescription, feedbackIdsToMove } = splitThemeDto;

    return this.prisma.$transaction(async (tx) => {
      // 1. Create the new theme
      const newTheme = await tx.theme.create({
        data: {
          workspaceId,
          title: newThemeTitle,
          description: newThemeDescription,
        },
      });

      // 2. Move feedback to the new theme
      await tx.themeFeedback.updateMany({
        where: {
          themeId: sourceThemeId,
          feedbackId: { in: feedbackIdsToMove },
        },
        data: { themeId: newTheme.id },
      });

      await this.auditService.logAction(workspaceId, userId, AuditLogAction.THEME_SPLIT, { sourceThemeId, newThemeId: newTheme.id, feedbackIdsToMove });

      return newTheme;
    });
  }

  async moveFeedback(workspaceId: string, userId: string, moveFeedbackDto: MoveFeedbackDto) {
    const { feedbackIds, sourceThemeId, targetThemeId } = moveFeedbackDto;

    if (!sourceThemeId && !targetThemeId) {
      throw new BadRequestException('Either sourceThemeId or targetThemeId must be provided.');
    }

    if (sourceThemeId) {
      // Remove from source
      await this.prisma.themeFeedback.deleteMany({ where: { themeId: sourceThemeId, feedbackId: { in: feedbackIds } } });
      await this.auditService.logAction(workspaceId, userId, AuditLogAction.THEME_FEEDBACK_REMOVE, { themeId: sourceThemeId, feedbackIds });
    }

    if (targetThemeId) {
      // Add to target
      await this.prisma.themeFeedback.createMany({
        data: feedbackIds.map((id) => ({ themeId: targetThemeId, feedbackId: id })),
        skipDuplicates: true,
      });
      await this.auditService.logAction(workspaceId, userId, AuditLogAction.THEME_FEEDBACK_ADD, { themeId: targetThemeId, feedbackIds });
    }

    return { success: true };
  }

  async triggerReclustering(workspaceId: string) {
    const job = await this.clusteringQueue.add({ workspaceId });
    return { message: 'AI reclustering job dispatched.', jobId: job.id };
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, Theme, ThemeStatus } from '@prisma/client';
import { QueryThemeDto, ThemeSortBy } from '../dto/query-theme.dto';

@Injectable()
export class ThemeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(workspaceId: string, id: string) {
    return this.prisma.theme.findFirst({
      where: { id, workspaceId },
      include: { _count: { select: { feedbacks: true } } },
    });
  }

  async findMany(workspaceId: string, query: QueryThemeDto) {
    const { page = 1, limit = 20, search, status, pinned, sortBy = ThemeSortBy.CREATED_AT } = query;
    const where: Prisma.ThemeWhereInput = {
      workspaceId,
      status,
      pinned,
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    // Build orderBy: priorityScore sorts nulls last so unscored themes appear at bottom
    const orderBy: Prisma.ThemeOrderByWithRelationInput[] =
      sortBy === ThemeSortBy.PRIORITY_SCORE
        ? [{ priorityScore: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }]
        : sortBy === ThemeSortBy.UPDATED_AT
        ? [{ updatedAt: 'desc' }]
        : [{ createdAt: 'desc' }];

    const [data, total] = await this.prisma.$transaction([
      this.prisma.theme.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        // AI narration fields are included so the list card can show summary + confidence
        select: {
          id: true,
          workspaceId: true,
          title: true,
          description: true,
          status: true,
          pinned: true,
          priorityScore: true,
          lastScoredAt: true,
          revenueInfluence: true,
          signalBreakdown: true,
          ciqScore: true,
          urgencyScore: true,
          manualOverrideScore: true,
          strategicTag: true,
          aiSummary: true,
          aiExplanation: true,
          aiRecommendation: true,
          aiConfidence: true,
          aiNarratedAt: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { feedbacks: true } },
        },
      }),
      this.prisma.theme.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async create(workspaceId: string, data: Prisma.ThemeCreateWithoutWorkspaceInput) {
    return this.prisma.theme.create({
      data: {
        ...data,
        workspace: { connect: { id: workspaceId } },
      },
    });
  }

  async update(id: string, data: Prisma.ThemeUpdateInput) {
    return this.prisma.theme.update({ where: { id }, data });
  }

  async delete(id: string) {
    return this.prisma.theme.delete({ where: { id } });
  }

  async addFeedback(themeId: string, feedbackId: string) {
    return this.prisma.themeFeedback.create({
      data: { themeId, feedbackId },
    });
  }

  async removeFeedback(themeId: string, feedbackId: string) {
    return this.prisma.themeFeedback.delete({
      where: { themeId_feedbackId: { themeId, feedbackId } },
    });
  }
}

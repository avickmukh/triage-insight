import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, Theme, ThemeStatus } from '@prisma/client';
import { QueryThemeDto } from '../dto/query-theme.dto';

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
    const { page = 1, limit = 20, search, status, pinned } = query;
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

    const [data, total] = await this.prisma.$transaction([
      this.prisma.theme.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { feedbacks: true } } },
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

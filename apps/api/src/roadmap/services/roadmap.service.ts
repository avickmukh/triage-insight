import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../ai/services/audit.service";
import { PrioritizationService } from "../../prioritization/services/prioritization.service";
import { CreateRoadmapItemDto } from "../dto/create-roadmap-item.dto";
import { UpdateRoadmapItemDto } from "../dto/update-roadmap-item.dto";
import { QueryRoadmapDto } from "../dto/query-roadmap.dto";
import { AuditLogAction, Prisma, RoadmapStatus } from "@prisma/client";

type RoadmapOrderByField = 'createdAt' | 'updatedAt' | 'priorityScore';

@Injectable()
export class RoadmapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly prioritizationService: PrioritizationService
  ) {}

  async create(workspaceId: string, userId: string, dto: CreateRoadmapItemDto) {
    const roadmapItem = await this.prisma.roadmapItem.create({
      data: {
        workspaceId,
        ...dto,
      },
    });

    await this.auditService.logAction(workspaceId, userId, AuditLogAction.ROADMAP_ITEM_CREATE, { id: roadmapItem.id, title: roadmapItem.title });

    return roadmapItem;
  }

  async createFromTheme(workspaceId: string, userId: string, themeId: string) {
    const theme = await this.prisma.theme.findUnique({
      where: { id: themeId, workspaceId },
    });

    if (!theme) {
      throw new NotFoundException(`Theme with ID ${themeId} not found.`);
    }

    const score = await this.prioritizationService.getThemeScoreExplanation(workspaceId, themeId);
    const customerCount = await this.prisma.themeFeedback.count({ where: { themeId } });

    const roadmapItem = await this.prisma.roadmapItem.create({
      data: {
        workspaceId,
        themeId,
        title: theme.title,
        description: theme.description ?? undefined,
        priorityScore: score.priorityScore,
        revenueImpactValue: score.revenueImpactValue,
        dealInfluenceValue: score.dealInfluenceValue,
        customerCount,
      },
    });

    await this.auditService.logAction(workspaceId, userId, AuditLogAction.ROADMAP_ITEM_CREATE, {
      id: roadmapItem.id,
      title: roadmapItem.title,
      fromThemeId: themeId,
    });

    return roadmapItem;
  }

  async findAll(workspaceId: string, query: QueryRoadmapDto) {
    const { search, status, isPublic, sortBy = 'createdAt', sortOrder = 'desc' } = query;

    const allowedSortFields: RoadmapOrderByField[] = ['createdAt', 'updatedAt', 'priorityScore'];
    const resolvedSortBy: RoadmapOrderByField = allowedSortFields.includes(sortBy as RoadmapOrderByField)
      ? (sortBy as RoadmapOrderByField)
      : 'createdAt';

    const where: Prisma.RoadmapItemWhereInput = {
      workspaceId,
      status: status && status.length > 0 ? { in: status } : undefined,
      isPublic,
      ...(search && { title: { contains: search, mode: 'insensitive' as const } }),
    };

    const orderBy: Prisma.RoadmapItemOrderByWithRelationInput = {
      [resolvedSortBy]: sortOrder,
    };

    const items = await this.prisma.roadmapItem.findMany({
      where,
      orderBy,
      include: { theme: { select: { id: true, title: true } } },
    });

    // Group by status for Kanban frontend
    const columns = Object.values(RoadmapStatus).reduce(
      (acc, s) => { acc[s] = []; return acc; },
      {} as Record<RoadmapStatus, typeof items>
    );

    for (const item of items) {
      columns[item.status].push(item);
    }

    return columns;
  }

  async findOne(workspaceId: string, id: string) {
    const roadmapItem = await this.prisma.roadmapItem.findUnique({
      where: { id, workspaceId },
      include: { theme: true },
    });

    if (!roadmapItem) {
      throw new NotFoundException(`Roadmap item with ID ${id} not found.`);
    }

    return roadmapItem;
  }

  async update(workspaceId: string, userId: string, id: string, dto: UpdateRoadmapItemDto) {
    const existingItem = await this.findOne(workspaceId, id);

    const updatedItem = await this.prisma.roadmapItem.update({
      where: { id },
      data: dto,
    });

    const newStatus = (dto as { status?: RoadmapStatus }).status;

    if (newStatus && newStatus !== existingItem.status) {
      await this.auditService.logAction(workspaceId, userId, AuditLogAction.ROADMAP_ITEM_STATUS_CHANGE, {
        id,
        from: existingItem.status,
        to: newStatus,
      });
    } else {
      await this.auditService.logAction(workspaceId, userId, AuditLogAction.ROADMAP_ITEM_UPDATE, { id, changes: dto });
    }

    return updatedItem;
  }
}

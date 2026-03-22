import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
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

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async deriveFeedbackCount(themeId: string | null | undefined): Promise<number> {
    if (!themeId) return 0;
    return this.prisma.themeFeedback.count({ where: { themeId } });
  }

  private async enrichItem<T extends { themeId: string | null }>(item: T): Promise<T & { feedbackCount: number }> {
    const feedbackCount = await this.deriveFeedbackCount(item.themeId);
    return { ...item, feedbackCount };
  }

  // ─── Create ─────────────────────────────────────────────────────────────────

  async create(workspaceId: string, userId: string, dto: CreateRoadmapItemDto) {
    if (dto.themeId) {
      const theme = await this.prisma.theme.findUnique({ where: { id: dto.themeId, workspaceId } });
      if (!theme) throw new NotFoundException(`Theme ${dto.themeId} not found in this workspace.`);
    }

    const roadmapItem = await this.prisma.roadmapItem.create({
      data: { workspaceId, ...dto },
      include: { theme: { select: { id: true, title: true, status: true } } },
    });

    await this.auditService.logAction(workspaceId, userId, AuditLogAction.ROADMAP_ITEM_CREATE, { id: roadmapItem.id, title: roadmapItem.title });

    return this.enrichItem(roadmapItem);
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

    // Prevent duplicate roadmap items from the same theme
    const existing = await this.prisma.roadmapItem.findFirst({ where: { workspaceId, themeId } });
    if (existing) {
      throw new BadRequestException(`A roadmap item already exists for theme "${theme.title}". Update it instead.`);
    }

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
      include: { theme: { select: { id: true, title: true, status: true } } },
    });

    await this.auditService.logAction(workspaceId, userId, AuditLogAction.ROADMAP_ITEM_CREATE, {
      id: roadmapItem.id,
      title: roadmapItem.title,
      fromThemeId: themeId,
    });

    return this.enrichItem(roadmapItem);
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
      include: { theme: { select: { id: true, title: true, status: true } } },
    });

    // Enrich each item with feedbackCount
    const enriched = await Promise.all(items.map((item) => this.enrichItem(item)));

    // Group by status for Kanban frontend — all statuses present even if empty
    const columns = Object.values(RoadmapStatus).reduce(
      (acc, s) => { acc[s] = []; return acc; },
      {} as Record<RoadmapStatus, typeof enriched>
    );
    for (const item of enriched) {
      columns[item.status].push(item);
    }

    return columns;
  }

  async findOne(workspaceId: string, id: string) {
    const roadmapItem = await this.prisma.roadmapItem.findUnique({
      where: { id, workspaceId },
      include: { theme: { select: { id: true, title: true, status: true } } },
    });

    if (!roadmapItem) {
      throw new NotFoundException(`Roadmap item ${id} not found.`);
    }

    return this.enrichItem(roadmapItem);
  }

  async update(workspaceId: string, userId: string, id: string, dto: UpdateRoadmapItemDto) {
    const existingItem = await this.findOne(workspaceId, id);

    if (dto.themeId !== undefined && dto.themeId !== null) {
      const theme = await this.prisma.theme.findUnique({ where: { id: dto.themeId, workspaceId } });
      if (!theme) throw new NotFoundException(`Theme ${dto.themeId} not found in this workspace.`);
    }

    const updatedItem = await this.prisma.roadmapItem.update({
      where: { id },
      data: dto,
      include: { theme: { select: { id: true, title: true, status: true } } },
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

    return this.enrichItem(updatedItem);
  }

  // ─── Delete ──────────────────────────────────────────────────────────────────

  async remove(workspaceId: string, userId: string, id: string) {
    await this.findOne(workspaceId, id); // verifies ownership
    await this.prisma.roadmapItem.delete({ where: { id } });
    await this.auditService.logAction(workspaceId, userId, AuditLogAction.ROADMAP_ITEM_UPDATE, { id, action: 'delete' });
    return { success: true };
  }
}

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import type { Queue } from "bull";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../ai/services/audit.service";
import { CiqService } from "../../ai/services/ciq.service";
import { CIQ_SCORING_QUEUE } from "../../ai/processors/ciq-scoring.processor";
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
    private readonly ciqService: CiqService,
    @InjectQueue(CIQ_SCORING_QUEUE) private readonly ciqQueue: Queue,
  ) {}

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Enrich a roadmap item with live CIQ scores.
   * Used for synchronous reads (findOne, findAll) where we want fresh counts
   * but do NOT re-persist (that is handled by the async queue).
   */
  private async enrichItem<T extends { id: string; themeId: string | null; revenueImpactValue?: number | null }>(
    item: T
  ): Promise<T & { feedbackCount: number; signalCount: number; confidenceScore: number; revenueImpactScore: number }> {
    const [feedbackCount, signalCount] = await Promise.all([
      item.themeId ? this.prisma.themeFeedback.count({ where: { themeId: item.themeId } }) : Promise.resolve(0),
      item.themeId ? this.prisma.customerSignal.count({ where: { themeId: item.themeId } }) : Promise.resolve(0),
    ]);
    // Derive confidence and revenueImpactScore from live counts + stored value
    const confidenceScore = parseFloat(Math.min(1, feedbackCount * 0.05 + signalCount * 0.1).toFixed(3));
    const rawRev = item.revenueImpactValue ?? 0;
    const revenueImpactScore = rawRev > 0
      ? parseFloat(Math.min(100, (Math.log10(rawRev + 1) / 6) * 100).toFixed(1))
      : 0;
    return { ...item, feedbackCount, signalCount, confidenceScore, revenueImpactScore };
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

    // Dispatch async CIQ scoring
    await this.ciqQueue.add({ type: 'ROADMAP_SCORED', workspaceId, roadmapItemId: roadmapItem.id });

    const enriched = await this.enrichItem(roadmapItem);
    return enriched;
  }

  async createFromTheme(workspaceId: string, userId: string, themeId: string) {
    const theme = await this.prisma.theme.findUnique({ where: { id: themeId, workspaceId } });
    if (!theme) throw new NotFoundException(`Theme with ID ${themeId} not found.`);

    // Prevent duplicate roadmap items from the same theme
    const existing = await this.prisma.roadmapItem.findFirst({ where: { workspaceId, themeId } });
    if (existing) {
      throw new BadRequestException(`A roadmap item already exists for theme "${theme.title}". Update it instead.`);
    }

    // Use real CIQ scoring synchronously for the initial creation values
    const ciqScore = await this.ciqService.scoreTheme(workspaceId, themeId);

    const roadmapItem = await this.prisma.roadmapItem.create({
      data: {
        workspaceId,
        themeId,
        title: theme.title,
        description: theme.description ?? undefined,
        priorityScore:      ciqScore.priorityScore,
        confidenceScore:    ciqScore.confidenceScore,
        revenueImpactScore: ciqScore.revenueImpactScore,
        revenueImpactValue: ciqScore.revenueImpactValue,
        dealInfluenceValue: ciqScore.dealInfluenceValue,
        signalCount:        ciqScore.signalCount,
        customerCount:      ciqScore.uniqueCustomerCount,
      },
      include: { theme: { select: { id: true, title: true, status: true } } },
    });

    await this.auditService.logAction(workspaceId, userId, AuditLogAction.ROADMAP_ITEM_CREATE, {
      id: roadmapItem.id,
      title: roadmapItem.title,
      fromThemeId: themeId,
    });

    const enriched = await this.enrichItem(roadmapItem);
    return enriched;
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

    // Enrich each item with live feedbackCount / signalCount
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
      include: {
        theme: {
          select: {
            id: true, title: true, status: true, description: true,
            feedbacks: {
              take: 20,
              orderBy: { assignedAt: "desc" },
              select: {
                confidence: true, assignedBy: true,
                feedback: {
                  select: {
                    id: true, title: true, description: true, status: true,
                    sentiment: true, impactScore: true, sourceType: true, createdAt: true,
                    customer: { select: { id: true, name: true, companyName: true, arrValue: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!roadmapItem) throw new NotFoundException(`Roadmap item ${id} not found.`);

    const signals = roadmapItem.themeId
      ? await this.prisma.customerSignal.findMany({
          where: { themeId: roadmapItem.themeId },
          select: { signalType: true, strength: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : [];

    const signalSummary = signals.reduce((acc, s) => {
      acc[s.signalType] = (acc[s.signalType] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const enriched = await this.enrichItem(roadmapItem);
    const linkedFeedback = roadmapItem.theme?.feedbacks.map((tf) => ({
      ...tf.feedback,
      assignedBy: tf.assignedBy,
      assignmentConfidence: tf.confidence,
    })) ?? [];

    return { ...enriched, linkedFeedback, signalSummary, signalCount: signals.length };
  }

  // ─── Refresh intelligence (manual trigger for ADMIN/EDITOR) ─────────────────

  async refreshIntelligence(workspaceId: string, id: string) {
    const item = await this.prisma.roadmapItem.findUnique({ where: { id, workspaceId } });
    if (!item) throw new NotFoundException(`Roadmap item ${id} not found.`);

    // Run real CIQ scoring synchronously so the response is immediately fresh
    const ciqScore = await this.ciqService.scoreRoadmapItem(workspaceId, id);

    const updated = await this.prisma.roadmapItem.update({
      where: { id },
      data: {
        priorityScore:      ciqScore.priorityScore,
        confidenceScore:    ciqScore.confidenceScore,
        revenueImpactScore: ciqScore.revenueImpactScore,
        revenueImpactValue: ciqScore.revenueImpactValue,
        dealInfluenceValue: ciqScore.dealInfluenceValue,
        signalCount:        ciqScore.signalCount,
        customerCount:      ciqScore.uniqueCustomerCount,
      },
      include: { theme: { select: { id: true, title: true, status: true } } },
    });

    return {
      ...updated,
      feedbackCount: ciqScore.feedbackCount,
      signalCount: ciqScore.signalCount,
      confidenceScore: ciqScore.confidenceScore,
      revenueImpactScore: ciqScore.revenueImpactScore,
      // Expose full explainability shape for future UI use
      scoreExplanation: ciqScore.scoreExplanation,
    };
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

    // Dispatch async CIQ re-scoring (themeId may have changed)
    await this.ciqQueue.add({ type: 'ROADMAP_SCORED', workspaceId, roadmapItemId: id });

    const enriched = await this.enrichItem(updatedItem);
    return enriched;
  }

  // ─── Delete ──────────────────────────────────────────────────────────────────

  async remove(workspaceId: string, userId: string, id: string) {
    await this.findOne(workspaceId, id); // verifies ownership
    await this.prisma.roadmapItem.delete({ where: { id } });
    await this.auditService.logAction(workspaceId, userId, AuditLogAction.ROADMAP_ITEM_UPDATE, { id, action: 'delete' });
    return { success: true };
  }
}

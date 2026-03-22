import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../ai/services/audit.service";
import { PrioritizationService } from "../../prioritization/services/prioritization.service";
import { CreateRoadmapItemDto } from "../dto/create-roadmap-item.dto";
import { UpdateRoadmapItemDto } from "../dto/update-roadmap-item.dto";
import { QueryRoadmapDto } from "../dto/query-roadmap.dto";
import { AuditLogAction, Prisma, RoadmapStatus } from "@prisma/client";

type RoadmapOrderByField = 'createdAt' | 'updatedAt' | 'priorityScore';

// ─── Intelligence helpers ─────────────────────────────────────────────────────

/** Confidence score (0–1): min(1, feedbackCount*0.05 + signalCount*0.1) */
function deriveConfidenceScore(feedbackCount: number, signalCount: number): number {
  const raw = feedbackCount * 0.05 + signalCount * 0.1;
  return Math.min(1, parseFloat(raw.toFixed(3)));
}

/** Normalise raw revenue impact to 0–100 using log10 scale */
function normaliseRevenueImpact(revenueImpactValue: number): number {
  if (!revenueImpactValue || revenueImpactValue <= 0) return 0;
  const score = (Math.log10(revenueImpactValue + 1) / 6) * 100;
  return Math.min(100, parseFloat(score.toFixed(1)));
}

@Injectable()
export class RoadmapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly prioritizationService: PrioritizationService
  ) {}

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async enrichItem<T extends { id: string; themeId: string | null; revenueImpactValue?: number | null }>(
    item: T
  ): Promise<T & { feedbackCount: number; signalCount: number; confidenceScore: number; revenueImpactScore: number }> {
    const [feedbackCount, signalCount] = await Promise.all([
      item.themeId ? this.prisma.themeFeedback.count({ where: { themeId: item.themeId } }) : Promise.resolve(0),
      item.themeId ? this.prisma.customerSignal.count({ where: { themeId: item.themeId } }) : Promise.resolve(0),
    ]);
    const confidenceScore = deriveConfidenceScore(feedbackCount, signalCount);
    const revenueImpactScore = normaliseRevenueImpact(item.revenueImpactValue ?? 0);
    return { ...item, feedbackCount, signalCount, confidenceScore, revenueImpactScore };
  }

  private persistIntelligence(id: string, confidenceScore: number, revenueImpactScore: number, signalCount: number): void {
    this.prisma.roadmapItem
      .update({ where: { id }, data: { confidenceScore, revenueImpactScore, signalCount } })
      .catch(() => { /* non-critical */ });
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

    const enriched = await this.enrichItem(roadmapItem);
    this.persistIntelligence(roadmapItem.id, enriched.confidenceScore, enriched.revenueImpactScore, enriched.signalCount);
    return enriched;
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

    const enriched = await this.enrichItem(roadmapItem);
    this.persistIntelligence(roadmapItem.id, enriched.confidenceScore, enriched.revenueImpactScore, enriched.signalCount);
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

  // ─── Refresh intelligence ────────────────────────────────────────────────────

  async refreshIntelligence(workspaceId: string, id: string) {
    const item = await this.prisma.roadmapItem.findUnique({ where: { id, workspaceId } });
    if (!item) throw new NotFoundException(`Roadmap item ${id} not found.`);

    let priorityScore = item.priorityScore;
    let revenueImpactValue = item.revenueImpactValue;
    let dealInfluenceValue = item.dealInfluenceValue;

    if (item.themeId) {
      try {
        const score = await this.prioritizationService.getThemeScoreExplanation(workspaceId, item.themeId);
        priorityScore = score.priorityScore;
        revenueImpactValue = score.revenueImpactValue;
        dealInfluenceValue = score.dealInfluenceValue;
      } catch { /* use existing values */ }
    }

    const [feedbackCount, signalCount] = await Promise.all([
      item.themeId ? this.prisma.themeFeedback.count({ where: { themeId: item.themeId } }) : Promise.resolve(0),
      item.themeId ? this.prisma.customerSignal.count({ where: { themeId: item.themeId } }) : Promise.resolve(0),
    ]);

    const confidenceScore = deriveConfidenceScore(feedbackCount, signalCount);
    const revenueImpactScore = normaliseRevenueImpact(revenueImpactValue ?? 0);

    const updated = await this.prisma.roadmapItem.update({
      where: { id },
      data: { priorityScore, revenueImpactValue, dealInfluenceValue, confidenceScore, revenueImpactScore, signalCount },
      include: { theme: { select: { id: true, title: true, status: true } } },
    });

    return { ...updated, feedbackCount, signalCount, confidenceScore, revenueImpactScore };
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

    const enriched = await this.enrichItem(updatedItem);
    this.persistIntelligence(id, enriched.confidenceScore, enriched.revenueImpactScore, enriched.signalCount);
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

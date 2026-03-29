import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import type { Queue } from "bull";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../ai/services/audit.service";
import { CiqService } from "../../ai/services/ciq.service";
import { AggregationService } from "./aggregation.service";
import { PrioritizationCacheService } from "./prioritization-cache.service";
import { UpdateSettingsDto } from "../dto/update-settings.dto";
import { QueryPrioritizationDto } from "../dto/query-prioritization.dto";
import { AuditLogAction, ThemeStatus } from "@prisma/client";
import { CIQ_SCORING_QUEUE } from "../../ai/processors/ciq-scoring.processor";
import { PRIORITIZATION_QUEUE } from "../workers/prioritization.worker";

export interface SetManualOverrideDto {
  manualOverrideScore: number | null;
  strategicTag?: string | null;
  overrideReason?: string | null;
}

@Injectable()
export class PrioritizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly ciqService: CiqService,
    private readonly aggregationService: AggregationService,
    private readonly cacheService: PrioritizationCacheService,
    @InjectQueue(CIQ_SCORING_QUEUE) private readonly ciqQueue: Queue,
    @InjectQueue(PRIORITIZATION_QUEUE) private readonly prioritizationQueue: Queue,
  ) {}

  /**
   * Return all non-archived themes ordered by their stored priorityScore (desc).
   * Includes both AI_GENERATED and VERIFIED themes.
   * Themes that have never been scored appear last (null score).
   */
  async getPrioritizedThemes(workspaceId: string, query: QueryPrioritizationDto) {
    const { page = 1, limit = 20 } = query;

    const [themes, total] = await this.prisma.$transaction([
      this.prisma.theme.findMany({
        where: { workspaceId, status: { not: ThemeStatus.ARCHIVED } },
        orderBy: [
          { priorityScore: { sort: "desc", nulls: "last" } },
          { createdAt: "desc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { feedbacks: true } } },
      }),
      this.prisma.theme.count({ where: { workspaceId, status: { not: ThemeStatus.ARCHIVED } } }),
    ]);

    return { data: themes, total, page, limit };
  }

  /**
   * Return the stored score for a single theme plus a live CIQ computation.
   */
  async getThemeScoreExplanation(workspaceId: string, themeId: string) {
    return this.ciqService.scoreTheme(workspaceId, themeId);
  }

  /**
   * GET /prioritization/features — ranked feature list from cache or live compute.
   */
  async getPrioritizedFeatures(workspaceId: string, limit = 50) {
    const cached = this.cacheService.get(workspaceId);
    if (cached) return { data: cached.features.slice(0, limit), total: cached.features.length, computedAt: cached.computedAt, cached: true };
    const features = await this.aggregationService.getFeaturePriorityRanking(workspaceId, limit);
    return { data: features, total: features.length, computedAt: new Date(), cached: false };
  }

  /**
   * GET /prioritization/opportunities — revenue opportunity list from cache or live compute.
   */
  async getOpportunities(workspaceId: string, limit = 20) {
    const cached = this.cacheService.get(workspaceId);
    if (cached) return { data: cached.opportunities.slice(0, limit), total: cached.opportunities.length, computedAt: cached.computedAt, cached: true };
    const opportunities = await this.aggregationService.getOpportunities(workspaceId, limit);
    return { data: opportunities, total: opportunities.length, computedAt: new Date(), cached: false };
  }

  /**
   * GET /prioritization/roadmap — roadmap recommendations from cache or live compute.
   */
  async getRoadmapRecommendations(workspaceId: string, limit = 30) {
    const cached = this.cacheService.get(workspaceId);
    if (cached) return { data: cached.roadmap.slice(0, limit), total: cached.roadmap.length, computedAt: cached.computedAt, cached: true };
    const roadmap = await this.aggregationService.getRoadmapRecommendations(workspaceId, limit);
    return { data: roadmap, total: roadmap.length, computedAt: new Date(), cached: false };
  }

  /**
   * POST /prioritization/recompute — enqueue a full workspace recompute job.
   * Returns immediately with a job reference.
   */
  async enqueueFullRecompute(workspaceId: string, userId: string) {
    let jobId: string | undefined;
    try {
      const job = await this.prioritizationQueue.add(
        { type: 'WORKSPACE_RECOMPUTE', workspaceId, userId },
        { attempts: 3, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: 50 },
      );
      jobId = String(job.id);
    } catch (queueErr) {
      console.warn('[Queue] Redis unavailable — job skipped:', (queueErr as Error).message);
    }
    await this.auditService.logAction(
      workspaceId,
      userId,
      AuditLogAction.PRIORITIZATION_SETTINGS_UPDATE,
      { action: 'full_recompute_enqueued', jobId },
    );
    return { jobId, message: 'Full prioritization recompute enqueued' };
  }

  /**
   * POST /prioritization/themes/:themeId/override — set or clear a manual override score.
   * ADMIN only.
   */
  async setManualOverride(workspaceId: string, themeId: string, userId: string, dto: SetManualOverrideDto) {
    const theme = await this.prisma.theme.findFirst({ where: { id: themeId, workspaceId } });
    if (!theme) throw new NotFoundException('Theme not found');

    const updated = await this.prisma.theme.update({
      where: { id: themeId },
      data: {
        manualOverrideScore: dto.manualOverrideScore,
        strategicTag:        dto.strategicTag ?? theme.strategicTag,
        overrideReason:      dto.overrideReason ?? null,
        lastScoredAt:        new Date(),
      },
    });

    await this.auditService.logAction(
      workspaceId,
      userId,
      AuditLogAction.PRIORITIZATION_SETTINGS_UPDATE,
      { action: 'manual_override', themeId, overrideScore: dto.manualOverrideScore, reason: dto.overrideReason },
    );

    // Invalidate cache so next read reflects the override
    this.cacheService.invalidate(workspaceId);

    return updated;
  }

  /**
   * PATCH /prioritization/themes/:themeId/strategic-tag — set strategic tag only.
   * ADMIN only.
   */
  async setStrategicTag(workspaceId: string, themeId: string, userId: string, strategicTag: string | null) {
    const theme = await this.prisma.theme.findFirst({ where: { id: themeId, workspaceId } });
    if (!theme) throw new NotFoundException('Theme not found');

    const updated = await this.prisma.theme.update({
      where: { id: themeId },
      data: { strategicTag },
    });

    await this.auditService.logAction(
      workspaceId,
      userId,
      AuditLogAction.PRIORITIZATION_SETTINGS_UPDATE,
      { action: 'strategic_tag_update', themeId, strategicTag },
    );

    this.cacheService.invalidate(workspaceId);
    return updated;
  }

  /**
   * Enqueue an async CIQ scoring job for a single theme.
   */
  async enqueueThemeRescore(workspaceId: string, themeId: string) {
    let jobId: string | undefined;
    try {
      const job = await this.ciqQueue.add(
        { type: "THEME_SCORED", workspaceId, themeId },
        { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
      );
      jobId = String(job.id);
    } catch (queueErr) {
      console.warn('[Queue] Redis unavailable — job skipped:', (queueErr as Error).message);
    }
    return { jobId, message: "CIQ scoring job enqueued" };
  }

  /**
   * Enqueue CIQ scoring jobs for all non-archived themes in a workspace.
   * Includes both AI_GENERATED and VERIFIED themes.
   */
  async enqueueWorkspaceRescore(workspaceId: string, userId: string) {
    const themes = await this.prisma.theme.findMany({
      where: { workspaceId, status: { not: ThemeStatus.ARCHIVED } },
      select: { id: true },
    });

    const jobs = await Promise.all(
      themes.map((t) =>
        this.ciqQueue.add(
          { type: "THEME_SCORED", workspaceId, themeId: t.id },
          { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
        ),
      ),
    );

    await this.auditService.logAction(
      workspaceId,
      userId,
      AuditLogAction.PRIORITIZATION_SETTINGS_UPDATE,
      { action: "bulk_rescore", themeCount: themes.length },
    );

    return { enqueued: jobs.length, message: `${jobs.length} CIQ scoring jobs enqueued` };
  }

  async getSettings(workspaceId: string) {
    let settings = await this.prisma.prioritizationSettings.findUnique({ where: { workspaceId } });
    if (!settings) {
      settings = await this.prisma.prioritizationSettings.create({ data: { workspaceId } });
    }
    return settings;
  }

  async updateSettings(workspaceId: string, userId: string, dto: UpdateSettingsDto) {
    const updatedSettings = await this.prisma.prioritizationSettings.upsert({
      where: { workspaceId },
      update: dto,
      create: { workspaceId, ...dto },
    });

    await this.auditService.logAction(
      workspaceId,
      userId,
      AuditLogAction.PRIORITIZATION_SETTINGS_UPDATE,
      { changes: dto },
    );

    // Settings change invalidates cache
    this.cacheService.invalidate(workspaceId);

    return updatedSettings;
  }
}

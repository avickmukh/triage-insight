import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import type { Queue } from "bull";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../ai/services/audit.service";
import { CiqService } from "../../ai/services/ciq.service";
import { UpdateSettingsDto } from "../dto/update-settings.dto";
import { QueryPrioritizationDto } from "../dto/query-prioritization.dto";
import { AuditLogAction, ThemeStatus } from "@prisma/client";
import { CIQ_SCORING_QUEUE } from "../../ai/processors/ciq-scoring.processor";

@Injectable()
export class PrioritizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly ciqService: CiqService,
    @InjectQueue(CIQ_SCORING_QUEUE) private readonly ciqQueue: Queue,
  ) {}

  /**
   * Return all ACTIVE themes ordered by their stored priorityScore (desc).
   * Themes that have never been scored appear last (null score).
   * Also returns the live CIQ score for the first page so the UI can display
   * the full scoreExplanation without a second round-trip.
   */
  async getPrioritizedThemes(workspaceId: string, query: QueryPrioritizationDto) {
    const { page = 1, limit = 20 } = query;

    const [themes, total] = await this.prisma.$transaction([
      this.prisma.theme.findMany({
        where: { workspaceId, status: ThemeStatus.ACTIVE },
        orderBy: [
          { priorityScore: { sort: "desc", nulls: "last" } },
          { createdAt: "desc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { feedbacks: true } } },
      }),
      this.prisma.theme.count({ where: { workspaceId, status: ThemeStatus.ACTIVE } }),
    ]);

    return { data: themes, total, page, limit };
  }

  /**
   * Return the stored score for a single theme plus a live CIQ computation.
   * The live computation is returned in scoreExplanation for the explainability UI.
   */
  async getThemeScoreExplanation(workspaceId: string, themeId: string) {
    return this.ciqService.scoreTheme(workspaceId, themeId);
  }

  /**
   * Enqueue an async CIQ scoring job for a single theme.
   * Returns immediately with a job reference.
   */
  async enqueueThemeRescore(workspaceId: string, themeId: string) {
    const job = await this.ciqQueue.add(
      { type: "THEME_SCORED", workspaceId, themeId },
      { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
    );
    return { jobId: job.id, message: "CIQ scoring job enqueued" };
  }

  /**
   * Enqueue CIQ scoring jobs for ALL active themes in a workspace.
   * Used by the "Recalculate All" button in the AI settings panel.
   */
  async enqueueWorkspaceRescore(workspaceId: string, userId: string) {
    const themes = await this.prisma.theme.findMany({
      where: { workspaceId, status: ThemeStatus.ACTIVE },
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
    let settings = await this.prisma.prioritizationSettings.findUnique({
      where: { workspaceId },
    });
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
      { changes: dto }
    );

    return updatedSettings;
  }
}

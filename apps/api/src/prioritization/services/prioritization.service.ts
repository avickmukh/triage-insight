import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../ai/services/audit.service";
import { AggregationService } from "./aggregation.service";
import { ScoringService } from "./scoring.service";
import { UpdateSettingsDto } from "../dto/update-settings.dto";
import { QueryPrioritizationDto } from "../dto/query-prioritization.dto";
import { AuditLogAction, ThemeStatus } from "@prisma/client";

@Injectable()
export class PrioritizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly aggregationService: AggregationService,
    private readonly scoringService: ScoringService
  ) {}

  async getPrioritizedThemes(workspaceId: string, query: QueryPrioritizationDto) {
    const { page = 1, limit = 20 } = query;

    const themes = await this.prisma.theme.findMany({
      where: { workspaceId, status: ThemeStatus.ACTIVE },
      orderBy: { createdAt: "desc" },
    });

    const settings = await this.getSettings(workspaceId);

    const scoredThemes = await Promise.all(
      themes.map(async (theme) => {
        const themeData = await this.aggregationService.getThemeData(workspaceId, theme.id);
        const scoreOutput = this.scoringService.calculateScore(settings, themeData);
        return { theme, ...scoreOutput };
      })
    );

    const sorted = scoredThemes.sort((a, b) => b.priorityScore - a.priorityScore);
    const paginated = sorted.slice((page - 1) * limit, page * limit);

    return { data: paginated, total: sorted.length, page, limit };
  }

  async getThemeScoreExplanation(workspaceId: string, themeId: string) {
    const settings = await this.getSettings(workspaceId);
    const themeData = await this.aggregationService.getThemeData(workspaceId, themeId);
    return this.scoringService.calculateScore(settings, themeData);
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

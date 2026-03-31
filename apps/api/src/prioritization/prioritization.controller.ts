import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, Req, ParseIntPipe, DefaultValuePipe,
} from "@nestjs/common";
import { PrioritizationService, SetManualOverrideDto } from "./services/prioritization.service";
import { ActionPlanService } from "./services/action-plan.service";
import { CiqService } from "../ai/services/ciq.service";
import { UpdateSettingsDto } from "./dto/update-settings.dto";
import { QueryPrioritizationDto } from "./dto/query-prioritization.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../workspace/guards/roles.guard";
import { Roles } from "../workspace/decorators/roles.decorator";
import { WorkspaceRole } from "@prisma/client";
import { IsNumber, IsOptional, IsString, Min, Max } from "class-validator";
import { Type } from "class-transformer";

interface AuthenticatedRequest {
  user: { sub: string; email: string };
}

class SetOverrideDto implements SetManualOverrideDto {
  @IsOptional() @IsNumber() @Min(0) @Max(100) @Type(() => Number)
  manualOverrideScore: number | null = null;

  @IsOptional() @IsString()
  strategicTag?: string | null;

  @IsOptional() @IsString()
  overrideReason?: string | null;
}

class SetStrategicTagDto {
  @IsOptional() @IsString()
  strategicTag: string | null = null;
}

@Controller("workspaces/:workspaceId/prioritization")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PrioritizationController {
  constructor(
    private readonly prioritizationService: PrioritizationService,
    private readonly ciqService: CiqService,
    private readonly actionPlanService: ActionPlanService,
  ) {}

  // ─── Theme Ranking ────────────────────────────────────────────────────────

  @Get("themes")
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getPrioritizedThemes(
    @Param("workspaceId") workspaceId: string,
    @Query() query: QueryPrioritizationDto,
  ) {
    return this.prioritizationService.getPrioritizedThemes(workspaceId, query);
  }

  @Get("themes/:themeId/explanation")
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getThemeScoreExplanation(
    @Param("workspaceId") workspaceId: string,
    @Param("themeId") themeId: string,
  ) {
    return this.prioritizationService.getThemeScoreExplanation(workspaceId, themeId);
  }

  @Get("themes/:themeId/ciq")
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getThemeCiqScore(
    @Param("workspaceId") workspaceId: string,
    @Param("themeId") themeId: string,
  ) {
    return this.ciqService.scoreTheme(workspaceId, themeId);
  }

  @Post("themes/:themeId/recalculate")
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  recalculateThemeCiq(
    @Param("workspaceId") workspaceId: string,
    @Param("themeId") themeId: string,
  ) {
    return this.prioritizationService.enqueueThemeRescore(workspaceId, themeId);
  }

  /**
   * POST /workspaces/:workspaceId/prioritization/themes/:themeId/override
   * Set or clear a manual override score for a theme.
   * ADMIN only.
   */
  @Post("themes/:themeId/override")
  @Roles(WorkspaceRole.ADMIN)
  setManualOverride(
    @Param("workspaceId") workspaceId: string,
    @Param("themeId") themeId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: SetOverrideDto,
  ) {
    return this.prioritizationService.setManualOverride(workspaceId, themeId, req.user.sub, dto);
  }

  /**
   * PATCH /workspaces/:workspaceId/prioritization/themes/:themeId/strategic-tag
   * Set strategic tag only (without full override).
   * ADMIN only.
   */
  @Patch("themes/:themeId/strategic-tag")
  @Roles(WorkspaceRole.ADMIN)
  setStrategicTag(
    @Param("workspaceId") workspaceId: string,
    @Param("themeId") themeId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: SetStrategicTagDto,
  ) {
    return this.prioritizationService.setStrategicTag(workspaceId, themeId, req.user.sub, dto.strategicTag);
  }

  // ─── Feature Priority Ranking ─────────────────────────────────────────────

  /**
   * GET /workspaces/:workspaceId/prioritization/features
   * Returns feedback items ranked by 4-dimension CIQ priority score.
   * Results are served from cache when available (5-min TTL).
   */
  @Get("features")
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getPrioritizedFeatures(
    @Param("workspaceId") workspaceId: string,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.prioritizationService.getPrioritizedFeatures(workspaceId, limit);
  }

  // ─── Revenue Opportunities ────────────────────────────────────────────────

  /**
   * GET /workspaces/:workspaceId/prioritization/opportunities
   * Returns high-value themes and features not yet committed to roadmap.
   * Results are served from cache when available (5-min TTL).
   */
  @Get("opportunities")
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getOpportunities(
    @Param("workspaceId") workspaceId: string,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.prioritizationService.getOpportunities(workspaceId, limit);
  }

  // ─── Roadmap Recommendations ──────────────────────────────────────────────

  /**
   * GET /workspaces/:workspaceId/prioritization/roadmap
   * Returns roadmap items with AI-generated promotion/deprioritisation recommendations.
   * Results are served from cache when available (5-min TTL).
   */
  @Get("roadmap")
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getRoadmapRecommendations(
    @Param("workspaceId") workspaceId: string,
    @Query("limit", new DefaultValuePipe(30), ParseIntPipe) limit: number,
  ) {
    return this.prioritizationService.getRoadmapRecommendations(workspaceId, limit);
  }

  // ─── Full Workspace Recompute ─────────────────────────────────────────────

  /**
   * POST /workspaces/:workspaceId/prioritization/recompute
   * Enqueues a full 4-dimension workspace recompute job.
   * Invalidates the priority cache on completion.
   * ADMIN only.
   */
  @Post("recompute")
  @Roles(WorkspaceRole.ADMIN)
  enqueueFullRecompute(
    @Param("workspaceId") workspaceId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.prioritizationService.enqueueFullRecompute(workspaceId, req.user.sub);
  }

  /**
   * POST /workspaces/:workspaceId/prioritization/recalculate-all
   * Legacy endpoint — enqueues CIQ scoring jobs for ALL active themes.
   * ADMIN only.
   */
  @Post("recalculate-all")
  @Roles(WorkspaceRole.ADMIN)
  recalculateAllThemes(
    @Param("workspaceId") workspaceId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.prioritizationService.enqueueWorkspaceRescore(workspaceId, req.user.sub);
  }

  // ─── Weekly Action Plan ──────────────────────────────────────────────────

  @Get('action-plan')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getActionPlan(@Param('workspaceId') workspaceId: string) {
    return this.actionPlanService.getActionPlan(workspaceId);
  }

  // ─── Settings ─────────────────────────────────────────────────────────────

  @Get("settings")
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  getSettings(@Param("workspaceId") workspaceId: string) {
    return this.prioritizationService.getSettings(workspaceId);
  }

  @Patch("settings")
  @Roles(WorkspaceRole.ADMIN)
  updateSettings(
    @Param("workspaceId") workspaceId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.prioritizationService.updateSettings(workspaceId, req.user.sub, dto);
  }
}

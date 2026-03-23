import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req } from "@nestjs/common";
import { PrioritizationService } from "./services/prioritization.service";
import { CiqService } from "../ai/services/ciq.service";
import { UpdateSettingsDto } from "./dto/update-settings.dto";
import { QueryPrioritizationDto } from "./dto/query-prioritization.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../workspace/guards/roles.guard";
import { Roles } from "../workspace/decorators/roles.decorator";
import { WorkspaceRole } from "@prisma/client";

interface AuthenticatedRequest {
  user: { sub: string; email: string };
}

@Controller("workspaces/:workspaceId/prioritization")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PrioritizationController {
  constructor(
    private readonly prioritizationService: PrioritizationService,
    private readonly ciqService: CiqService,
  ) {}

  @Get("themes")
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getPrioritizedThemes(
    @Param("workspaceId") workspaceId: string,
    @Query() query: QueryPrioritizationDto
  ) {
    return this.prioritizationService.getPrioritizedThemes(workspaceId, query);
  }

  @Get("themes/:themeId/explanation")
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getThemeScoreExplanation(
    @Param("workspaceId") workspaceId: string,
    @Param("themeId") themeId: string
  ) {
    return this.prioritizationService.getThemeScoreExplanation(workspaceId, themeId);
  }

  /**
   * GET /workspaces/:workspaceId/prioritization/themes/:themeId/ciq
   * Real CIQ score for a theme using actual DB data (ARR, deals, signals).
   * Returns full scoreExplanation map for explainability UI.
   */
  @Get("themes/:themeId/ciq")
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getThemeCiqScore(
    @Param("workspaceId") workspaceId: string,
    @Param("themeId") themeId: string
  ) {
    return this.ciqService.scoreTheme(workspaceId, themeId);
  }

  /**
   * POST /workspaces/:workspaceId/prioritization/themes/:themeId/recalculate
   * Enqueues an async CIQ scoring job for a single theme.
   * Returns immediately with a job reference.
   * ADMIN / EDITOR only.
   */
  @Post("themes/:themeId/recalculate")
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  recalculateThemeCiq(
    @Param("workspaceId") workspaceId: string,
    @Param("themeId") themeId: string
  ) {
    return this.prioritizationService.enqueueThemeRescore(workspaceId, themeId);
  }

  /**
   * POST /workspaces/:workspaceId/prioritization/recalculate-all
   * Enqueues CIQ scoring jobs for ALL active themes in the workspace.
   * ADMIN only.
   */
  @Post("recalculate-all")
  @Roles(WorkspaceRole.ADMIN)
  recalculateAllThemes(
    @Param("workspaceId") workspaceId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.prioritizationService.enqueueWorkspaceRescore(workspaceId, req.user.sub);
  }

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
    @Body() dto: UpdateSettingsDto
  ) {
    return this.prioritizationService.updateSettings(workspaceId, req.user.sub, dto);
  }
}

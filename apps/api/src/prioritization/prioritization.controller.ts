import { Controller, Get, Patch, Body, Param, Query, UseGuards, Req } from "@nestjs/common";
import { PrioritizationService } from "./services/prioritization.service";
import { UpdateSettingsDto } from "./dto/update-settings.dto";
import { QueryPrioritizationDto } from "./dto/query-prioritization.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../workspace/guards/roles.guard";
import { Roles } from "../workspace/decorators/roles.decorator";
import { Role } from "@prisma/client";

interface AuthenticatedRequest {
  user: { sub: string; email: string };
}

@Controller("workspaces/:workspaceId/prioritization")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PrioritizationController {
  constructor(private readonly prioritizationService: PrioritizationService) {}

  @Get("themes")
  @Roles(Role.ADMIN, Role.EDITOR, Role.VIEWER)
  getPrioritizedThemes(
    @Param("workspaceId") workspaceId: string,
    @Query() query: QueryPrioritizationDto
  ) {
    return this.prioritizationService.getPrioritizedThemes(workspaceId, query);
  }

  @Get("themes/:themeId/explanation")
  @Roles(Role.ADMIN, Role.EDITOR, Role.VIEWER)
  getThemeScoreExplanation(
    @Param("workspaceId") workspaceId: string,
    @Param("themeId") themeId: string
  ) {
    return this.prioritizationService.getThemeScoreExplanation(workspaceId, themeId);
  }

  @Get("settings")
  @Roles(Role.ADMIN, Role.EDITOR)
  getSettings(@Param("workspaceId") workspaceId: string) {
    return this.prioritizationService.getSettings(workspaceId);
  }

  @Patch("settings")
  @Roles(Role.ADMIN)
  updateSettings(
    @Param("workspaceId") workspaceId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateSettingsDto
  ) {
    return this.prioritizationService.updateSettings(workspaceId, req.user.sub, dto);
  }
}

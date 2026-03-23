import { Controller, Delete, Get, Post, Body, Patch, Param, Query, UseGuards, Req, HttpCode, HttpStatus } from "@nestjs/common";
import { RoadmapService } from "./services/roadmap.service";
import { CiqService } from "../ai/services/ciq.service";
import { CreateRoadmapItemDto } from "./dto/create-roadmap-item.dto";
import { UpdateRoadmapItemDto } from "./dto/update-roadmap-item.dto";
import { QueryRoadmapDto } from "./dto/query-roadmap.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../workspace/guards/roles.guard";
import { Roles } from "../workspace/decorators/roles.decorator";
import { WorkspaceRole } from "@prisma/client";

interface AuthenticatedRequest {
  user: { sub: string; email: string };
}

@Controller("workspaces/:workspaceId/roadmap")
@UseGuards(JwtAuthGuard, RolesGuard)
export class RoadmapController {
  constructor(
    private readonly roadmapService: RoadmapService,
    private readonly ciqService: CiqService,
  ) {}

  @Post()
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  create(@Param("workspaceId") workspaceId: string, @Req() req: AuthenticatedRequest, @Body() dto: CreateRoadmapItemDto) {
    return this.roadmapService.create(workspaceId, req.user.sub, dto);
  }

  @Post("from-theme/:themeId")
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  createFromTheme(
    @Param("workspaceId") workspaceId: string,
    @Req() req: AuthenticatedRequest,
    @Param("themeId") themeId: string
  ) {
    return this.roadmapService.createFromTheme(workspaceId, req.user.sub, themeId);
  }

  @Get()
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  findAll(@Param("workspaceId") workspaceId: string, @Query() query: QueryRoadmapDto) {
    return this.roadmapService.findAll(workspaceId, query);
  }

  @Get(":id")
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  findOne(@Param("workspaceId") workspaceId: string, @Param("id") id: string) {
    return this.roadmapService.findOne(workspaceId, id);
  }

  @Patch(":id")
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  update(
    @Param("workspaceId") workspaceId: string,
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateRoadmapItemDto
  ) {
    return this.roadmapService.update(workspaceId, req.user.sub, id, dto);
  }

  /**
   * POST /workspaces/:workspaceId/roadmap/:id/refresh-intelligence
   * Synchronously re-runs CIQ scoring and persists results.
   * ADMIN / EDITOR only.
   */
  @Post(":id/refresh-intelligence")
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  refreshIntelligence(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string
  ) {
    return this.roadmapService.refreshIntelligence(workspaceId, id);
  }

  /**
   * GET /workspaces/:workspaceId/roadmap/:id/ciq-explanation
   * Returns the full CIQ score breakdown (scoreExplanation map) for a roadmap item.
   * Read-only; all roles may access.
   * Shape supports future "why is this score high?" UI without additional API changes.
   */
  @Get(":id/ciq-explanation")
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getCiqExplanation(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string
  ) {
    return this.ciqService.scoreRoadmapItem(workspaceId, id);
  }

  @Delete(":id")
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param("workspaceId") workspaceId: string,
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string
  ) {
    return this.roadmapService.remove(workspaceId, req.user.sub, id);
  }
}

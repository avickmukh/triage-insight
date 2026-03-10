import { Controller, Get, Post, Body, Patch, Param, Query, UseGuards, Req } from "@nestjs/common";
import { RoadmapService } from "./services/roadmap.service";
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
  constructor(private readonly roadmapService: RoadmapService) {}

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
}

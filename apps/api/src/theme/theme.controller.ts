import { Controller, Get, Post, Body, Patch, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ThemeService } from './services/theme.service';
import { CreateThemeDto } from './dto/create-theme.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';
import { QueryThemeDto } from './dto/query-theme.dto';
import { MergeThemesDto } from './dto/merge-themes.dto';
import { SplitThemeDto } from './dto/split-theme.dto';
import { MoveFeedbackDto } from './dto/move-feedback.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../workspace/guards/roles.guard';
import { Roles } from '../workspace/decorators/roles.decorator';
import { Role } from '@prisma/client';

interface AuthenticatedRequest {
  user: { sub: string; email: string };
}

@Controller('workspaces/:workspaceId/themes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ThemeController {
  constructor(private readonly themeService: ThemeService) {}

  @Post()
  @Roles(Role.ADMIN, Role.EDITOR)
  create(@Param('workspaceId') workspaceId: string, @Req() req: AuthenticatedRequest, @Body() createThemeDto: CreateThemeDto) {
    return this.themeService.create(workspaceId, req.user.sub, createThemeDto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.EDITOR, Role.VIEWER)
  findAll(@Param('workspaceId') workspaceId: string, @Query() query: QueryThemeDto) {
    return this.themeService.findAll(workspaceId, query);
  }

  @Post('recluster')
  @Roles(Role.ADMIN)
  triggerReclustering(@Param('workspaceId') workspaceId: string) {
    return this.themeService.triggerReclustering(workspaceId);
  }

  @Post('feedback')
  @Roles(Role.ADMIN, Role.EDITOR)
  moveFeedback(@Param('workspaceId') workspaceId: string, @Req() req: AuthenticatedRequest, @Body() moveFeedbackDto: MoveFeedbackDto) {
    return this.themeService.moveFeedback(workspaceId, req.user.sub, moveFeedbackDto);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.EDITOR, Role.VIEWER)
  findOne(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.themeService.findOne(workspaceId, id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.EDITOR)
  update(@Param('workspaceId') workspaceId: string, @Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() updateThemeDto: UpdateThemeDto) {
    return this.themeService.update(workspaceId, req.user.sub, id, updateThemeDto);
  }

  @Post(':id/merge')
  @Roles(Role.ADMIN, Role.EDITOR)
  mergeThemes(@Param('workspaceId') workspaceId: string, @Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() mergeThemesDto: MergeThemesDto) {
    return this.themeService.merge(workspaceId, req.user.sub, id, mergeThemesDto.sourceThemeIds);
  }

  @Post(':id/split')
  @Roles(Role.ADMIN, Role.EDITOR)
  splitTheme(@Param('workspaceId') workspaceId: string, @Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() splitThemeDto: SplitThemeDto) {
    return this.themeService.split(workspaceId, req.user.sub, id, splitThemeDto);
  }
}

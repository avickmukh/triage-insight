import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ThemeService } from './services/theme.service';
import { DealService } from '../deal/deal.service';
import { CreateThemeDto } from './dto/create-theme.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';
import { QueryThemeDto } from './dto/query-theme.dto';
import { MergeThemesDto } from './dto/merge-themes.dto';
import { SplitThemeDto } from './dto/split-theme.dto';
import { MoveFeedbackDto } from './dto/move-feedback.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../workspace/guards/roles.guard';
import { Roles } from '../workspace/decorators/roles.decorator';
import { WorkspaceRole } from '@prisma/client';

interface AuthenticatedRequest {
  user: { sub: string; email: string };
}

@Controller('workspaces/:workspaceId/themes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ThemeController {
  constructor(
    private readonly themeService: ThemeService,
    private readonly dealService: DealService,
  ) {}

  @Post()
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  create(@Param('workspaceId') workspaceId: string, @Req() req: AuthenticatedRequest, @Body() createThemeDto: CreateThemeDto) {
    return this.themeService.create(workspaceId, req.user.sub, createThemeDto);
  }

  @Get()
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  findAll(@Param('workspaceId') workspaceId: string, @Query() query: QueryThemeDto) {
    return this.themeService.findAll(workspaceId, query);
  }

  @Post('recluster')
  @Roles(WorkspaceRole.ADMIN)
  triggerReclustering(@Param('workspaceId') workspaceId: string) {
    return this.themeService.triggerReclustering(workspaceId);
  }

  @Post('feedback')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  moveFeedback(@Param('workspaceId') workspaceId: string, @Req() req: AuthenticatedRequest, @Body() moveFeedbackDto: MoveFeedbackDto) {
    return this.themeService.moveFeedback(workspaceId, req.user.sub, moveFeedbackDto);
  }

  @Get(':id')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  findOne(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.themeService.findOne(workspaceId, id);
  }

  @Patch(':id')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  update(@Param('workspaceId') workspaceId: string, @Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() updateThemeDto: UpdateThemeDto) {
    return this.themeService.update(workspaceId, req.user.sub, id, updateThemeDto);
  }

  /** GET /workspaces/:workspaceId/themes/:id/feedback — list linked feedback (paginated) */
  @Get(':id/feedback')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  listLinkedFeedback(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.themeService.listLinkedFeedback(workspaceId, id, page, limit);
  }

  /** POST /workspaces/:workspaceId/themes/:id/feedback/:feedbackId — manually link feedback */
  @Post(':id/feedback/:feedbackId')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  addFeedback(
    @Param('workspaceId') workspaceId: string,
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('feedbackId') feedbackId: string,
  ) {
    return this.themeService.addFeedback(workspaceId, req.user.sub, id, feedbackId);
  }

  /** DELETE /workspaces/:workspaceId/themes/:id/feedback/:feedbackId — unlink feedback */
  @Delete(':id/feedback/:feedbackId')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  removeFeedback(
    @Param('workspaceId') workspaceId: string,
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('feedbackId') feedbackId: string,
  ) {
    return this.themeService.removeFeedback(workspaceId, req.user.sub, id, feedbackId);
  }

  @Post(':id/merge')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  mergeThemes(@Param('workspaceId') workspaceId: string, @Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() mergeThemesDto: MergeThemesDto) {
    return this.themeService.merge(workspaceId, req.user.sub, id, mergeThemesDto.sourceThemeIds);
  }

  @Post(':id/split')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  splitTheme(@Param('workspaceId') workspaceId: string, @Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() splitThemeDto: SplitThemeDto) {
    return this.themeService.split(workspaceId, req.user.sub, id, splitThemeDto);
  }

  /**
   * GET /workspaces/:workspaceId/themes/:id/revenue-intelligence
   * Returns deal influence, ARR impact, and impacted customers for a theme.
   */
  @Get(':id/revenue-intelligence')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getRevenueIntelligence(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.dealService.findByTheme(workspaceId, id);
  }
}

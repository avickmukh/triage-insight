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
import { UnifiedAggregationService } from './services/unified-aggregation.service';
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
import { IsString } from 'class-validator';

interface AuthenticatedRequest {
  user: { sub: string; email: string };
}

class LinkDealDto {
  @IsString()
  dealId: string;
}

class LinkCustomerDto {
  @IsString()
  customerId: string;
}

@Controller('workspaces/:workspaceId/themes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ThemeController {
  constructor(
    private readonly themeService: ThemeService,
    private readonly dealService: DealService,
    private readonly unifiedAggregationService: UnifiedAggregationService,
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

  /**
   * GET /workspaces/:workspaceId/themes/top-issues
   * Returns top N themes ranked by totalSignalCount (cross-source: feedback + support + voice).
   */
  @Get('top-issues')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getTopIssues(
    @Param('workspaceId') workspaceId: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.unifiedAggregationService.getTopIssues(workspaceId, limit);
  }

  /**
   * GET /workspaces/:workspaceId/themes/source-summary
   * Returns workspace-level signal counts by source (feedback / voice / support).
   */
  @Get('source-summary')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getSourceSummary(@Param('workspaceId') workspaceId: string) {
    return this.unifiedAggregationService.getWorkspaceSourceSummary(workspaceId);
  }

  /**
   * POST /workspaces/:workspaceId/themes/aggregate-all
   * Triggers a full workspace-wide cross-source aggregation (admin only).
   */
  @Post('aggregate-all')
  @Roles(WorkspaceRole.ADMIN)
  aggregateAll(@Param('workspaceId') workspaceId: string) {
    return this.unifiedAggregationService.aggregateWorkspace(workspaceId);
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

  /**
   * POST /workspaces/:workspaceId/themes/:id/aggregate
   * Triggers cross-source aggregation for a single theme (admin/editor).
   */
  @Post(':id/aggregate')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  aggregateTheme(
    @Param('workspaceId') _workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.unifiedAggregationService.aggregateTheme(id);
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
   * Returns deal influence, ARR impact, top requesting customers, and open pipeline.
   */
  @Get(':id/revenue-intelligence')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getRevenueIntelligence(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.dealService.findByTheme(workspaceId, id);
  }

  /**
   * POST /workspaces/:workspaceId/themes/:id/link-deal
   * Link a deal to a theme and trigger revenue recomputation.
   */
  @Post(':id/link-deal')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  linkDeal(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() body: LinkDealDto,
  ) {
    return this.dealService.linkTheme(workspaceId, body.dealId, id);
  }

  /**
   * DELETE /workspaces/:workspaceId/themes/:id/link-deal/:dealId
   * Unlink a deal from a theme and trigger revenue recomputation.
   */
  @Delete(':id/link-deal/:dealId')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  unlinkDeal(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Param('dealId') dealId: string,
  ) {
    return this.dealService.unlinkTheme(workspaceId, dealId, id);
  }

  /**
   * POST /workspaces/:workspaceId/themes/:id/link-customer
   * Manually link a customer signal to a theme (creates a CustomerSignal record).
   */
  @Post(':id/link-customer')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  linkCustomer(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() body: LinkCustomerDto,
  ) {
    return this.themeService.linkCustomer(workspaceId, id, body.customerId);
  }

  /**
   * DELETE /workspaces/:workspaceId/themes/:id/link-customer/:customerId
   * Remove a manually-linked customer signal from a theme.
   */
  @Delete(':id/link-customer/:customerId')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  unlinkCustomer(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Param('customerId') customerId: string,
  ) {
    return this.themeService.unlinkCustomer(workspaceId, id, customerId);
  }
}

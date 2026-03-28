/**
 * CiqController
 *
 * Exposes the CIQ Full Scoring Engine via workspace-scoped endpoints:
 *
 *   GET /workspaces/:workspaceId/ciq/top
 *     — Top N feedback items by CIQ score (convenience alias, default 10)
 *
 *   GET /workspaces/:workspaceId/ciq/feature-ranking
 *     — Ranked list of feedback items by CIQ score (6-dimension composite)
 *
 *   GET /workspaces/:workspaceId/ciq/theme-ranking
 *     — Ranked list of ACTIVE themes by CIQ score (voice + survey + support enriched)
 *
 *   GET /workspaces/:workspaceId/ciq/customer-ranking
 *     — Ranked list of customers by CIQ influence score (ARR × segment weighted)
 *
 *   GET /workspaces/:workspaceId/ciq/strategic-signals
 *     — Workspace-level strategic intelligence: roadmap recommendations,
 *       voice sentiment summary, survey demand summary, support spike summary,
 *       and a composite signal feed
 *
 *   POST /workspaces/:workspaceId/ciq/recompute
 *     — Enqueue a full workspace CIQ recompute job (ADMIN / EDITOR only)
 *
 * All endpoints require JWT auth + workspace membership.
 * Viewer role is sufficient for read-only access.
 */
import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CiqEngineService } from './ciq-engine.service';
import { PrioritizationService } from '../prioritization/services/prioritization.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../workspace/guards/roles.guard';
import { Roles } from '../workspace/decorators/roles.decorator';
import { WorkspaceRole } from '@prisma/client';

interface AuthenticatedRequest {
  user: { sub: string; email: string };
}

@Controller('workspaces/:workspaceId/ciq')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CiqController {
  constructor(
    private readonly ciqEngineService: CiqEngineService,
    private readonly prioritizationService: PrioritizationService,
  ) {}

  /**
   * GET /workspaces/:workspaceId/ciq/top
   *
   * Convenience alias: returns the top N feedback items by CIQ score.
   * Equivalent to GET /ciq/feature-ranking?limit=N.
   * Default limit is 10; maximum is 50.
   */
  @Get('top')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getTop(
    @Param('workspaceId') workspaceId: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.ciqEngineService.getFeatureRanking(workspaceId, Math.min(limit, 50));
  }

  /**
   * GET /workspaces/:workspaceId/ciq/feature-ranking
   *
   * Returns up to `limit` feedback items ranked by their CIQ score.
   * Scoring dimensions: ARR, account priority, sentiment urgency, vote count,
   * duplicate cluster size, theme linkage, recency.
   */
  @Get('feature-ranking')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getFeatureRanking(
    @Param('workspaceId') workspaceId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.ciqEngineService.getFeatureRanking(workspaceId, Math.min(limit, 200));
  }

  /**
   * GET /workspaces/:workspaceId/ciq/theme-ranking
   *
   * Returns up to `limit` ACTIVE themes ranked by their full CIQ score.
   * Enriched with voice urgency, survey demand, and support spike signals
   * beyond the base priorityScore.
   */
  @Get('theme-ranking')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getThemeRanking(
    @Param('workspaceId') workspaceId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.ciqEngineService.getThemeRanking(workspaceId, Math.min(limit, 200));
  }

  /**
   * GET /workspaces/:workspaceId/ciq/customer-ranking
   *
   * Returns up to `limit` customers ranked by their CIQ influence score.
   * Incorporates ARR × segment multiplier, account priority, feedback volume,
   * deal pipeline activity, and churn risk penalty.
   */
  @Get('customer-ranking')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getCustomerRanking(
    @Param('workspaceId') workspaceId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.ciqEngineService.getCustomerRanking(workspaceId, Math.min(limit, 200));
  }

  /**
   * GET /workspaces/:workspaceId/ciq/strategic-signals
   *
   * Returns workspace-level strategic intelligence:
   *   - topThemes: top 10 themes by CIQ score with roadmap linkage
   *   - roadmapRecommendations: promote / monitor signals per theme
   *   - signals: composite intelligence feed (voice, survey, support, theme gaps)
   *   - voiceSentimentSummary: avg sentiment, urgent count, complaint count
   *   - surveyDemandSummary: avg ciqWeight, validation count, feature validation count
   *   - supportSpikeSummary: spike count, negative sentiment count
   */
  @Get('strategic-signals')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getStrategicSignals(@Param('workspaceId') workspaceId: string) {
    return this.ciqEngineService.getStrategicSignals(workspaceId);
  }

  /**
   * POST /workspaces/:workspaceId/ciq/recompute
   *
   * Enqueues a full workspace CIQ recompute job.
   * Convenience alias for POST /prioritization/recompute.
   * Requires ADMIN or EDITOR role.
   */
  @Post('recompute')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  @HttpCode(HttpStatus.ACCEPTED)
  recompute(
    @Param('workspaceId') workspaceId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.prioritizationService.enqueueFullRecompute(workspaceId, req.user.sub);
  }
}

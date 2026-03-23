/**
 * DashboardController
 *
 * Provides the 5 executive intelligence API endpoints:
 *   GET  /workspaces/:id/dashboard/executive        — full executive dashboard
 *   GET  /workspaces/:id/dashboard/themes           — emerging theme radar
 *   GET  /workspaces/:id/dashboard/revenue-risk     — revenue risk indicator
 *   GET  /workspaces/:id/dashboard/voice-signals    — voice sentiment signal
 *   GET  /workspaces/:id/dashboard/roadmap-health   — roadmap health panel
 *   POST /workspaces/:id/dashboard/refresh          — trigger async refresh
 */
import { Controller, Get, Post, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../workspace/guards/roles.guard';
import { Roles } from '../workspace/decorators/roles.decorator';
import { WorkspaceRole } from '@prisma/client';
import { DashboardAggregationService } from './services/dashboard-aggregation.service';
import { ExecutiveInsightService } from './services/executive-insight.service';
import { DashboardCacheService } from './services/dashboard-cache.service';
import { DASHBOARD_QUEUE, DASHBOARD_JOB_TYPES } from './workers/dashboard-refresh.worker';

@Controller('workspaces/:workspaceId/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(WorkspaceRole.VIEWER, WorkspaceRole.EDITOR, WorkspaceRole.ADMIN)
export class DashboardController {
  constructor(
    private readonly aggregation: DashboardAggregationService,
    private readonly insight:     ExecutiveInsightService,
    private readonly cache:       DashboardCacheService,
    @InjectQueue(DASHBOARD_QUEUE) private readonly dashboardQueue: Queue,
  ) {}

  /** GET /workspaces/:id/dashboard/executive — full executive intelligence dashboard */
  @Get('executive')
  async getExecutiveDashboard(@Param('workspaceId') workspaceId: string) {
    // Try cache first
    const cached = this.cache.get(workspaceId, 'executive');
    if (cached) return { ...cached, cached: true };

    const [pd, et, rr, vs, sp, rh] = await Promise.all([
      this.aggregation.getProductDirection(workspaceId),
      this.aggregation.getEmergingThemes(workspaceId),
      this.aggregation.getRevenueRisk(workspaceId),
      this.aggregation.getVoiceSentiment(workspaceId),
      this.aggregation.getSupportPressure(workspaceId),
      this.aggregation.getRoadmapHealth(workspaceId),
    ]);

    const executiveSummary = this.insight.synthesise(pd, et, rr, vs, sp, rh);

    const result = {
      productDirection:  pd,
      emergingThemes:    et,
      revenueRisk:       rr,
      voiceSentiment:    vs,
      supportPressure:   sp,
      roadmapHealth:     rh,
      executiveSummary,
      refreshedAt:       new Date().toISOString(),
      cached:            false,
    };

    this.cache.set(workspaceId, 'executive', result);
    return result;
  }

  /** GET /workspaces/:id/dashboard/themes — emerging theme radar */
  @Get('themes')
  async getThemes(@Param('workspaceId') workspaceId: string) {
    const cached = this.cache.get(workspaceId, 'emergingThemes');
    if (cached) return { data: cached, cached: true };

    const data = await this.aggregation.getEmergingThemes(workspaceId);
    this.cache.set(workspaceId, 'emergingThemes', data);
    return { data, cached: false };
  }

  /** GET /workspaces/:id/dashboard/revenue-risk — revenue risk indicator */
  @Get('revenue-risk')
  async getRevenueRisk(@Param('workspaceId') workspaceId: string) {
    const cached = this.cache.get(workspaceId, 'revenueRisk');
    if (cached) return { data: cached, cached: true };

    const data = await this.aggregation.getRevenueRisk(workspaceId);
    this.cache.set(workspaceId, 'revenueRisk', data);
    return { data, cached: false };
  }

  /** GET /workspaces/:id/dashboard/voice-signals — voice sentiment signal */
  @Get('voice-signals')
  async getVoiceSignals(@Param('workspaceId') workspaceId: string) {
    const cached = this.cache.get(workspaceId, 'voiceSentiment');
    if (cached) return { data: cached, cached: true };

    const data = await this.aggregation.getVoiceSentiment(workspaceId);
    this.cache.set(workspaceId, 'voiceSentiment', data);
    return { data, cached: false };
  }

  /** GET /workspaces/:id/dashboard/roadmap-health — roadmap health panel */
  @Get('roadmap-health')
  async getRoadmapHealth(@Param('workspaceId') workspaceId: string) {
    const cached = this.cache.get(workspaceId, 'roadmapHealth');
    if (cached) return { data: cached, cached: true };

    const data = await this.aggregation.getRoadmapHealth(workspaceId);
    this.cache.set(workspaceId, 'roadmapHealth', data);
    return { data, cached: false };
  }

  /** POST /workspaces/:id/dashboard/refresh — trigger async full refresh */
  @Post('refresh')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerRefresh(@Param('workspaceId') workspaceId: string) {
    this.cache.invalidate(workspaceId);
    await this.dashboardQueue.add(DASHBOARD_JOB_TYPES.REFRESH_ALL, { workspaceId }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
    return { message: 'Dashboard refresh queued.', workspaceId };
  }
}

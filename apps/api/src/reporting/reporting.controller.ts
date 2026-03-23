/**
 * ReportingController
 *
 * Exposes workspace-scoped enterprise reporting endpoints.
 * All endpoints require authentication and at minimum VIEWER role.
 * Export endpoints stream CSV or JSON files.
 *
 * Routes:
 *   GET  /workspaces/:workspaceId/reports/theme-trends
 *   GET  /workspaces/:workspaceId/reports/priority-distribution
 *   GET  /workspaces/:workspaceId/reports/revenue-impact
 *   GET  /workspaces/:workspaceId/reports/roadmap-progress
 *   GET  /workspaces/:workspaceId/reports/feedback-volume
 *   GET  /workspaces/:workspaceId/reports/export/:report  (CSV / JSON)
 */
import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../workspace/guards/roles.guard';
import { Roles } from '../workspace/decorators/roles.decorator';
import { WorkspaceRole } from '@prisma/client';
import { ReportingService } from './reporting.service';
import { ReportingQueryDto } from './dto/reporting-query.dto';

type ExportReport =
  | 'theme-trends'
  | 'priority-distribution'
  | 'revenue-impact'
  | 'roadmap-progress'
  | 'feedback-volume';

@Controller('workspaces/:workspaceId/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  // ─── 1. Theme Trends ──────────────────────────────────────────────────────

  @Get('theme-trends')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  async getThemeTrends(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ReportingQueryDto,
  ) {
    return this.reportingService.getThemeTrends(
      workspaceId,
      query.from,
      query.to,
      query.limit ?? 20,
    );
  }

  // ─── 2. Priority Distribution ─────────────────────────────────────────────

  @Get('priority-distribution')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  async getPriorityDistribution(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ReportingQueryDto,
  ) {
    return this.reportingService.getPriorityDistribution(
      workspaceId,
      query.from,
      query.to,
    );
  }

  // ─── 3. Revenue Impact ────────────────────────────────────────────────────

  @Get('revenue-impact')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  async getRevenueImpact(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ReportingQueryDto,
  ) {
    return this.reportingService.getRevenueImpact(
      workspaceId,
      query.from,
      query.to,
      query.limit ?? 10,
    );
  }

  // ─── 4. Roadmap Progress ──────────────────────────────────────────────────

  @Get('roadmap-progress')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  async getRoadmapProgress(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ReportingQueryDto,
  ) {
    return this.reportingService.getRoadmapProgress(
      workspaceId,
      query.from,
      query.to,
    );
  }

  // ─── 5. Feedback Volume ───────────────────────────────────────────────────

  @Get('feedback-volume')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  async getFeedbackVolume(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ReportingQueryDto,
  ) {
    return this.reportingService.getFeedbackVolume(
      workspaceId,
      query.from,
      query.to,
    );
  }

  // ─── Export (CSV / JSON) ──────────────────────────────────────────────────

  /**
   * GET /workspaces/:workspaceId/reports/export/:report?format=csv|json&from=&to=
   *
   * Streams the requested report as a downloadable file.
   * Supported reports: theme-trends | priority-distribution | revenue-impact |
   *                    roadmap-progress | feedback-volume
   */
  @Get('export/:report')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  async exportReport(
    @Param('workspaceId') workspaceId: string,
    @Param('report') report: string,
    @Query() query: ReportingQueryDto & { format?: string },
    @Res() res: Response,
  ) {
    const format = (query.format ?? 'json').toLowerCase();
    if (!['csv', 'json'].includes(format)) {
      throw new BadRequestException('format must be csv or json');
    }

    const validReports: ExportReport[] = [
      'theme-trends',
      'priority-distribution',
      'revenue-impact',
      'roadmap-progress',
      'feedback-volume',
    ];
    if (!validReports.includes(report as ExportReport)) {
      throw new BadRequestException(
        `report must be one of: ${validReports.join(', ')}`,
      );
    }

    let data: unknown;
    let rows: Record<string, unknown>[] = [];
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${report}-${ts}`;

    switch (report as ExportReport) {
      case 'theme-trends': {
        const result = await this.reportingService.getThemeTrends(
          workspaceId, query.from, query.to, query.limit ?? 50,
        );
        data = result;
        rows = result.themes as unknown as Record<string, unknown>[];
        break;
      }
      case 'priority-distribution': {
        const result = await this.reportingService.getPriorityDistribution(
          workspaceId, query.from, query.to,
        );
        data = result;
        rows = result.buckets as unknown as Record<string, unknown>[];
        break;
      }
      case 'revenue-impact': {
        const result = await this.reportingService.getRevenueImpact(
          workspaceId, query.from, query.to, query.limit ?? 50,
        );
        data = result;
        rows = result.topThemes as unknown as Record<string, unknown>[];
        break;
      }
      case 'roadmap-progress': {
        const result = await this.reportingService.getRoadmapProgress(
          workspaceId, query.from, query.to,
        );
        data = result;
        rows = result.byStatus as unknown as Record<string, unknown>[];
        break;
      }
      case 'feedback-volume': {
        const result = await this.reportingService.getFeedbackVolume(
          workspaceId, query.from, query.to,
        );
        data = result;
        rows = result.series.map((s) => ({
          date: s.date,
          total: s.total,
          ...s.bySource,
        })) as Record<string, unknown>[];
        break;
      }
    }

    if (format === 'csv') {
      const csv = this.reportingService.toCsv(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}.csv"`,
      );
      res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}.json"`,
      );
      res.json({
        report,
        workspaceId,
        exportedAt: new Date().toISOString(),
        from: query.from ?? null,
        to: query.to ?? null,
        data,
      });
    }
  }
}

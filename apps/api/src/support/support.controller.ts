import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../workspace/guards/roles.guard';
import { Roles } from '../workspace/decorators/roles.decorator';
import { WorkspaceRole } from '@prisma/client';
import { TicketService } from './services/ticket.service';
import { SpikeDetectionService } from './services/spike-detection.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('workspaces/:workspaceId/support')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
export class SupportController {
  constructor(
    private readonly ticketService: TicketService,
    private readonly spikeDetectionService: SpikeDetectionService,
    private readonly prisma: PrismaService,
    @InjectQueue('support-clustering') private readonly clusteringQueue: Queue,
    @InjectQueue('support-spike-detection') private readonly spikeQueue: Queue,
    @InjectQueue('support-sync') private readonly syncQueue: Queue,
  ) {}

  // ─── GET /support/overview ────────────────────────────────────────────────────
  @Get('overview')
  async getOverview(@Param('workspaceId') workspaceId: string) {
    const [
      totalTickets,
      openTickets,
      resolvedTickets,
      totalClusters,
      linkedClusters,
      topClusters,
      activeSpikes,
      recentTickets,
    ] = await Promise.all([
      this.prisma.supportTicket.count({ where: { workspaceId } }),
      this.prisma.supportTicket.count({ where: { workspaceId, status: 'OPEN' } }),
      this.prisma.supportTicket.count({ where: { workspaceId, status: 'RESOLVED' } }),
      this.prisma.supportIssueCluster.count({ where: { workspaceId } }),
      this.prisma.supportIssueCluster.count({ where: { workspaceId, themeId: { not: null } } }),
      this.prisma.supportIssueCluster.findMany({
        where: { workspaceId },
        orderBy: { ticketCount: 'desc' },
        take: 5,
        include: { theme: { select: { id: true, title: true } } },
      }),
      this.spikeDetectionService.getActiveSpikes(workspaceId),
      this.prisma.supportTicket.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, subject: true, status: true, createdAt: true, customerEmail: true },
      }),
    ]);

    const totalArrExposure = await this.prisma.supportIssueCluster.aggregate({
      where: { workspaceId },
      _sum: { arrExposure: true },
    });

    return {
      summary: {
        totalTickets,
        openTickets,
        resolvedTickets,
        totalClusters,
        linkedClusters,
        totalArrExposure: totalArrExposure._sum.arrExposure ?? 0,
        activeSpikes: activeSpikes.length,
        criticalSpikes: activeSpikes.filter((s) => s.severity === 'CRITICAL' || s.severity === 'HIGH').length,
      },
      topClusters: topClusters.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        ticketCount: c.ticketCount,
        arrExposure: c.arrExposure,
        themeId: c.themeId,
        themeTitle: c.theme?.title ?? null,
      })),
      activeSpikes: activeSpikes.slice(0, 5),
      recentTickets,
    };
  }

  // ─── GET /support/tickets ─────────────────────────────────────────────────────
  @Get('tickets')
  findAllTickets(
    @Param('workspaceId') workspaceId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.ticketService.findAll(workspaceId, page, limit, status, search);
  }

  // ─── GET /support/clusters ────────────────────────────────────────────────────
  @Get('clusters')
  async findClusters(
    @Param('workspaceId') workspaceId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    const clusters = await this.prisma.supportIssueCluster.findMany({
      where: { workspaceId },
      include: {
        theme: { select: { id: true, title: true } },
        _count: { select: { ticketMaps: true } },
      },
      orderBy: { ticketCount: 'desc' },
      take: limit,
    });

    return clusters.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      ticketCount: c.ticketCount,
      arrExposure: c.arrExposure,
      themeId: c.themeId,
      themeTitle: c.theme?.title ?? null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  // ─── GET /support/spikes ──────────────────────────────────────────────────────
  @Get('spikes')
  async findSpikes(@Param('workspaceId') workspaceId: string) {
    return this.spikeDetectionService.getActiveSpikes(workspaceId);
  }

  // ─── GET /support/correlations ────────────────────────────────────────────────
  @Get('correlations')
  findCorrelations(@Param('workspaceId') workspaceId: string) {
    return this.prisma.supportIssueCluster.findMany({
      where: { workspaceId, themeId: { not: null } },
      include: { theme: true },
    });
  }

  // ─── GET /support/customer-impact ────────────────────────────────────────────
  @Get('customer-impact')
  async getCustomerImpact(@Param('workspaceId') workspaceId: string) {
    const clusters = await this.prisma.supportIssueCluster.findMany({
      where: { workspaceId },
      select: { id: true, title: true, arrExposure: true },
      orderBy: { arrExposure: 'desc' },
    });
    return clusters.map((c) => ({ clusterId: c.id, title: c.title, arrExposure: c.arrExposure }));
  }

  // ─── POST /support/sync ───────────────────────────────────────────────────────
  @Post('sync')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerSync(@Param('workspaceId') workspaceId: string) {
    // Enqueue clustering + spike detection jobs
    try {
    await this.clusteringQueue.add({ workspaceId }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
    } catch (queueErr) {
      console.warn('[Queue] Redis unavailable — job skipped:', (queueErr as Error).message);
    }
    try {
    await this.spikeQueue.add({ workspaceId }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
    } catch (queueErr) {
      console.warn('[Queue] Redis unavailable — job skipped:', (queueErr as Error).message);
    }
    return { message: 'Support intelligence sync enqueued.', workspaceId };
  }

  // ─── POST /support/recluster ──────────────────────────────────────────────────
  @Post('recluster')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerRecluster(@Param('workspaceId') workspaceId: string) {
    try {
    await this.clusteringQueue.add({ workspaceId }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
    } catch (queueErr) {
      console.warn('[Queue] Redis unavailable — job skipped:', (queueErr as Error).message);
    }
    return { message: 'Clustering job enqueued.', workspaceId };
  }
}

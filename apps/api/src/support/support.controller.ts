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
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../workspace/guards/roles.guard';
import { Roles } from '../workspace/decorators/roles.decorator';
import { WorkspaceRole } from '@prisma/client';
import { TicketService } from './services/ticket.service';
import { IngestionService } from './services/ingestion.service';
import { IntegrationProvider } from '@prisma/client';
import { SpikeDetectionService } from './services/spike-detection.service';
import { SentimentService } from './services/sentiment.service';
import { PrismaService } from '../prisma/prisma.service';

// Helper: derive severity label from z-score (mirrors spike-detection.service.ts)
function severityFromZScore(z: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (z >= 4) return 'CRITICAL';
  if (z >= 3) return 'HIGH';
  if (z >= 2) return 'MEDIUM';
  return 'LOW';
}

@Controller('workspaces/:workspaceId/support')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
export class SupportController {
  constructor(
    private readonly ticketService: TicketService,
    private readonly spikeDetectionService: SpikeDetectionService,
    private readonly sentimentService: SentimentService,
    private readonly ingestionService: IngestionService,
    private readonly prisma: PrismaService,
    @InjectQueue('support-clustering') private readonly clusteringQueue: Queue,
    @InjectQueue('support-spike-detection') private readonly spikeQueue: Queue,
    @InjectQueue('support-sync') private readonly syncQueue: Queue,
    @InjectQueue('support-sentiment') private readonly sentimentQueue: Queue,
  ) {}

  // ─── GET /support/overview ────────────────────────────────────────────────────
  @Get('overview')
  async getOverview(@Param('workspaceId') workspaceId: string) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalTickets,
      openTickets,
      resolvedTickets,
      totalClusters,
      linkedClusters,
      topClustersRaw,
      activeSpikes,
      recentTickets,
    ] = await Promise.all([
      this.prisma.supportTicket.count({ where: { workspaceId } }),
      this.prisma.supportTicket.count({
        where: { workspaceId, status: 'OPEN' },
      }),
      this.prisma.supportTicket.count({
        where: { workspaceId, status: 'RESOLVED' },
      }),
      this.prisma.supportIssueCluster.count({ where: { workspaceId } }),
      this.prisma.supportIssueCluster.count({
        where: { workspaceId, themeId: { not: null } },
      }),
      // Use raw query for new fields until Prisma client is regenerated
      this.prisma.$queryRaw<
        Array<{
          id: string;
          title: string;
          description: string | null;
          ticketCount: number;
          arrExposure: number;
          themeId: string | null;
          avgSentiment: number | null;
          negativeTicketPct: number | null;
          hasActiveSpike: boolean;
        }>
      >`
        SELECT id, title, description, "ticketCount", "arrExposure", "themeId",
               "avgSentiment", "negativeTicketPct", "hasActiveSpike"
        FROM "SupportIssueCluster"
        WHERE "workspaceId" = ${workspaceId}
        ORDER BY "ticketCount" DESC
        LIMIT 5
      `,
      this.spikeDetectionService.getActiveSpikes(workspaceId),
      this.prisma.supportTicket.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          subject: true,
          status: true,
          createdAt: true,
          customerEmail: true,
        },
      }),
    ]);

    // Fetch theme titles for top clusters
    const themeIds = topClustersRaw
      .map((c) => c.themeId)
      .filter(Boolean) as string[];
    const themes = themeIds.length
      ? await this.prisma.theme.findMany({
          where: { id: { in: themeIds } },
          select: { id: true, title: true },
        })
      : [];
    const themeMap = new Map(themes.map((t) => [t.id, t.title]));

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
        criticalSpikes: activeSpikes.filter(
          (s) =>
            severityFromZScore(s.zScore) === 'CRITICAL' ||
            severityFromZScore(s.zScore) === 'HIGH',
        ).length,
      },
      topClusters: topClustersRaw.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        ticketCount: Number(c.ticketCount),
        arrExposure: Number(c.arrExposure),
        avgSentiment: c.avgSentiment != null ? Number(c.avgSentiment) : null,
        negativeTicketPct:
          c.negativeTicketPct != null ? Number(c.negativeTicketPct) : null,
        hasActiveSpike: Boolean(c.hasActiveSpike),
        themeId: c.themeId,
        themeTitle: c.themeId ? (themeMap.get(c.themeId) ?? null) : null,
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
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const clustersRaw = await this.prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        description: string | null;
        ticketCount: number;
        arrExposure: number;
        themeId: string | null;
        avgSentiment: number | null;
        negativeTicketPct: number | null;
        hasActiveSpike: boolean;
        createdAt: Date;
        updatedAt: Date;
      }>
    >`
      SELECT id, title, description, "ticketCount", "arrExposure", "themeId",
             "avgSentiment", "negativeTicketPct", "hasActiveSpike",
             "createdAt", "updatedAt"
      FROM "SupportIssueCluster"
      WHERE "workspaceId" = ${workspaceId}
      ORDER BY "ticketCount" DESC
      LIMIT ${limit}
    `;

    // Fetch active spike events for these clusters
    const clusterIds = clustersRaw.map((c) => c.id);
    const spikeEvents = clusterIds.length
      ? await this.prisma.issueSpikeEvent.findMany({
          where: {
            clusterId: { in: clusterIds },
            windowEnd: { gte: sevenDaysAgo },
          },
          select: { clusterId: true, zScore: true },
          orderBy: { windowEnd: 'desc' },
        })
      : [];
    const spikeMap = new Map<string, number>();
    for (const s of spikeEvents) {
      if (!spikeMap.has(s.clusterId)) spikeMap.set(s.clusterId, s.zScore);
    }

    // Fetch theme titles
    const themeIds = clustersRaw
      .map((c) => c.themeId)
      .filter(Boolean) as string[];
    const themes = themeIds.length
      ? await this.prisma.theme.findMany({
          where: { id: { in: themeIds } },
          select: { id: true, title: true },
        })
      : [];
    const themeMap = new Map(themes.map((t) => [t.id, t.title]));

    return clustersRaw.map((c) => {
      const spikeZScore = spikeMap.get(c.id);
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        ticketCount: Number(c.ticketCount),
        arrExposure: Number(c.arrExposure),
        avgSentiment: c.avgSentiment != null ? Number(c.avgSentiment) : null,
        negativeTicketPct:
          c.negativeTicketPct != null ? Number(c.negativeTicketPct) : null,
        hasActiveSpike: Boolean(c.hasActiveSpike) || spikeZScore != null,
        latestSpikeSeverity:
          spikeZScore != null ? severityFromZScore(spikeZScore) : null,
        themeId: c.themeId,
        themeTitle: c.themeId ? (themeMap.get(c.themeId) ?? null) : null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });
  }

  // ─── GET /support/spikes ──────────────────────────────────────────────────────
  @Get('spikes')
  async findSpikes(@Param('workspaceId') workspaceId: string) {
    return this.spikeDetectionService.getActiveSpikes(workspaceId);
  }

  // ─── GET /support/negative-trends ─────────────────────────────────────────────
  @Get('negative-trends')
  async getNegativeTrends(
    @Param('workspaceId') workspaceId: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.sentimentService.getNegativeTrends(workspaceId, limit);
  }

  // ─── GET /support/linked-themes ───────────────────────────────────────────────
  @Get('linked-themes')
  async getLinkedThemes(@Param('workspaceId') workspaceId: string) {
    const clustersRaw = await this.prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        ticketCount: number;
        arrExposure: number;
        avgSentiment: number | null;
        hasActiveSpike: boolean;
        themeId: string | null;
      }>
    >`
      SELECT id, title, "ticketCount", "arrExposure",
             "avgSentiment", "hasActiveSpike", "themeId"
      FROM "SupportIssueCluster"
      WHERE "workspaceId" = ${workspaceId}
        AND "themeId" IS NOT NULL
      ORDER BY "ticketCount" DESC
    `;

    const themeIds = [
      ...new Set(clustersRaw.map((c) => c.themeId).filter(Boolean) as string[]),
    ];
    const themes = themeIds.length
      ? await this.prisma.theme.findMany({
          where: { id: { in: themeIds } },
          select: {
            id: true,
            title: true,
            ciqScore: true,
            status: true,
            feedbacks: { select: { feedbackId: true } },
          },
        })
      : [];
    const themeDataMap = new Map(themes.map((t) => [t.id, t]));

    // Group clusters by theme
    const grouped = new Map<
      string,
      {
        themeId: string;
        themeTitle: string;
        themeCiqScore: number | null;
        themeStatus: string;
        feedbackCount: number;
        totalTickets: number;
        linkedClusters: Array<{
          id: string;
          title: string;
          ticketCount: number;
          arrExposure: number;
          avgSentiment: number | null;
          hasActiveSpike: boolean;
        }>;
      }
    >();

    for (const c of clustersRaw) {
      if (!c.themeId) continue;
      const theme = themeDataMap.get(c.themeId);
      if (!grouped.has(c.themeId)) {
        grouped.set(c.themeId, {
          themeId: c.themeId,
          themeTitle: theme?.title ?? '',
          themeCiqScore: theme?.ciqScore ?? null,
          themeStatus: theme?.status ?? 'OPEN',
          feedbackCount: theme?.feedbacks?.length ?? 0,
          totalTickets: 0,
          linkedClusters: [],
        });
      }
      const entry = grouped.get(c.themeId)!;
      entry.totalTickets += Number(c.ticketCount);
      entry.linkedClusters.push({
        id: c.id,
        title: c.title,
        ticketCount: Number(c.ticketCount),
        arrExposure: Number(c.arrExposure),
        avgSentiment: c.avgSentiment != null ? Number(c.avgSentiment) : null,
        hasActiveSpike: Boolean(c.hasActiveSpike),
      });
    }

    return Array.from(grouped.values()).sort(
      (a, b) => b.totalTickets - a.totalTickets,
    );
  }

  // ─── GET /support/correlations ────────────────────────────────────────────────
  @Get('correlations')
  async findCorrelations(@Param('workspaceId') workspaceId: string) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const clustersRaw = await this.prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        description: string | null;
        ticketCount: number;
        arrExposure: number;
        themeId: string | null;
        avgSentiment: number | null;
        negativeTicketPct: number | null;
        hasActiveSpike: boolean;
      }>
    >`
      SELECT id, title, description, "ticketCount", "arrExposure", "themeId",
             "avgSentiment", "negativeTicketPct", "hasActiveSpike"
      FROM "SupportIssueCluster"
      WHERE "workspaceId" = ${workspaceId}
        AND "themeId" IS NOT NULL
    `;

    const themeIds = clustersRaw
      .map((c) => c.themeId)
      .filter(Boolean) as string[];
    const themes = themeIds.length
      ? await this.prisma.theme.findMany({
          where: { id: { in: themeIds } },
          select: {
            id: true,
            title: true,
            ciqScore: true,
            feedbacks: { select: { feedbackId: true } },
          },
        })
      : [];
    const themeDataMap = new Map(themes.map((t) => [t.id, t]));

    const clusterIds = clustersRaw.map((c) => c.id);
    const spikeEvents = clusterIds.length
      ? await this.prisma.issueSpikeEvent.findMany({
          where: {
            clusterId: { in: clusterIds },
            windowEnd: { gte: sevenDaysAgo },
          },
          select: { clusterId: true, zScore: true },
          orderBy: { windowEnd: 'desc' },
        })
      : [];
    const spikeMap = new Map<string, number>();
    for (const s of spikeEvents) {
      if (!spikeMap.has(s.clusterId)) spikeMap.set(s.clusterId, s.zScore);
    }

    return clustersRaw.map((c) => {
      const theme = c.themeId ? themeDataMap.get(c.themeId) : null;
      const spikeZScore = spikeMap.get(c.id);
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        ticketCount: Number(c.ticketCount),
        arrExposure: Number(c.arrExposure),
        avgSentiment: c.avgSentiment != null ? Number(c.avgSentiment) : null,
        negativeTicketPct:
          c.negativeTicketPct != null ? Number(c.negativeTicketPct) : null,
        hasActiveSpike: Boolean(c.hasActiveSpike) || spikeZScore != null,
        latestSpikeSeverity:
          spikeZScore != null ? severityFromZScore(spikeZScore) : null,
        themeId: c.themeId,
        themeTitle: theme?.title ?? null,
        themeCiqScore: theme?.ciqScore ?? null,
        themeFeedbackCount: theme?.feedbacks?.length ?? 0,
      };
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
    return clusters.map((c) => ({
      clusterId: c.id,
      title: c.title,
      arrExposure: c.arrExposure,
    }));
  }

  // ─── POST /support/import-csv ────────────────────────────────────────────────
  /**
   * Upload a CSV file to bulk-import support tickets.
   * Required columns: externalId, subject
   * Optional columns: description, status, customerEmail, tags (pipe-separated), arrValue, createdAt
   */
  @Post('import-csv')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async importCsv(
    @Param('workspaceId') workspaceId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file)
      throw new BadRequestException(
        'No file uploaded. Send multipart/form-data with field name "file".',
      );
    if (
      !file.originalname.toLowerCase().endsWith('.csv') &&
      file.mimetype !== 'text/csv'
    ) {
      throw new BadRequestException('Only CSV files are accepted.');
    }

    const csv = file.buffer.toString('utf-8');
    const lines = csv.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2)
      throw new BadRequestException(
        'CSV must have a header row and at least one data row.',
      );

    const headers = lines[0]
      .split(',')
      .map((h) => h.trim().replace(/^"|"$/g, ''));
    for (const col of ['externalId', 'subject']) {
      if (!headers.includes(col))
        throw new BadRequestException(
          `CSV is missing required column: "${col}"`,
        );
    }

    const idx = (col: string) => headers.indexOf(col);
    const cell = (row: string[], col: string) =>
      idx(col) >= 0 ? (row[idx(col)] ?? '').replace(/^"|"$/g, '').trim() : '';

    const tickets = lines
      .slice(1)
      .map((line) => {
        const row = line.split(',');
        const externalId = cell(row, 'externalId');
        if (!externalId) return null;
        const tagsRaw = cell(row, 'tags');
        const arrRaw = cell(row, 'arrValue');
        const createdRaw = cell(row, 'createdAt');
        const statusRaw = cell(row, 'status').toUpperCase();
        const validStatuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
        return {
          externalId,
          subject: cell(row, 'subject') || '(no subject)',
          description: cell(row, 'description') || null,
          status: (validStatuses.includes(statusRaw) ? statusRaw : 'OPEN') as
            | 'OPEN'
            | 'IN_PROGRESS'
            | 'RESOLVED'
            | 'CLOSED',
          customerEmail: cell(row, 'customerEmail') || null,
          tags: tagsRaw ? tagsRaw.split('|').map((t) => t.trim()) : [],
          arrValue: arrRaw ? parseFloat(arrRaw) : undefined,
          externalCreatedAt: createdRaw ? new Date(createdRaw) : undefined,
        };
      })
      .filter(Boolean) as Array<{
      externalId: string;
      subject: string;
      description: string | null;
      status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
      customerEmail: string | null;
      tags: string[];
      arrValue?: number;
      externalCreatedAt?: Date;
    }>;

    if (!tickets.length)
      throw new BadRequestException('No valid rows found in CSV.');

    const imported = await this.ingestionService.ingestTickets(
      workspaceId,
      IntegrationProvider.EMAIL,
      tickets,
    );

    // Trigger background clustering + sentiment for the new tickets
    const opts = { attempts: 3, backoff: { type: 'exponential', delay: 5000 } };
    for (const [queue, label] of [
      [this.clusteringQueue, 'clustering'],
      [this.sentimentQueue, 'sentiment'],
    ] as [Queue, string][]) {
      try {
        await queue.add({ workspaceId }, opts);
      } catch (err) {
        console.warn(
          `[Queue] Redis unavailable — ${label} job skipped:`,
          (err as Error).message,
        );
      }
    }

    return {
      imported: imported.ingested,
      bridged: imported.bridged,
      total: tickets.length,
      message: `Successfully imported ${imported.ingested} of ${tickets.length} tickets (${imported.bridged} bridged to unified pipeline).`,
    };
  }

  // ─── POST /support/sync ───────────────────────────────────────────────────────
  @Post('sync')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerSync(@Param('workspaceId') workspaceId: string) {
    const opts = { attempts: 3, backoff: { type: 'exponential', delay: 5000 } };
    const jobs: Array<[Queue, string]> = [
      [this.clusteringQueue, 'clustering'],
      [this.spikeQueue, 'spike-detection'],
      [this.sentimentQueue, 'sentiment'],
    ];
    for (const [queue, label] of jobs) {
      try {
        await queue.add({ workspaceId }, opts);
      } catch (err) {
        console.warn(
          `[Queue] Redis unavailable — ${label} job skipped:`,
          (err as Error).message,
        );
      }
    }
    return { message: 'Support intelligence sync enqueued.', workspaceId };
  }

  // ─── POST /support/recluster ──────────────────────────────────────────────────
  @Post('recluster')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerRecluster(@Param('workspaceId') workspaceId: string) {
    try {
      await this.clusteringQueue.add(
        { workspaceId },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
    } catch (err) {
      console.warn(
        '[Queue] Redis unavailable — clustering job skipped:',
        (err as Error).message,
      );
    }
    return { message: 'Clustering job enqueued.', workspaceId };
  }

  // ─── POST /support/score-sentiment ────────────────────────────────────────────
  @Post('score-sentiment')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerSentimentScoring(@Param('workspaceId') workspaceId: string) {
    try {
      await this.sentimentQueue.add(
        { workspaceId },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
    } catch (err) {
      console.warn(
        '[Queue] Redis unavailable — sentiment job skipped:',
        (err as Error).message,
      );
    }
    return { message: 'Sentiment scoring job enqueued.', workspaceId };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface SpikeResult {
  id?: string;
  clusterId: string;
  clusterTitle: string;
  windowStart: Date;
  windowEnd: Date;
  ticketCount: number;
  baseline: number;
  zScore: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  arrExposure: number;
}

function severityFromZScore(z: number): SpikeResult['severity'] {
  if (z >= 5) return 'CRITICAL';
  if (z >= 4) return 'HIGH';
  if (z >= 3) return 'MEDIUM';
  return 'LOW';
}

@Injectable()
export class SpikeDetectionService {
  private readonly logger = new Logger(SpikeDetectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async detectSpikes(
    workspaceId: string,
    windowHours = 24,
    zScoreThreshold = 2.5,
  ): Promise<SpikeResult[]> {
    this.logger.log(`[SpikeDetection] workspace=${workspaceId} window=${windowHours}h`);

    const now = new Date();
    const windowEnd = new Date(now);
    const windowStart = new Date(now.getTime() - windowHours * 3_600_000);

    // Historical baseline window: 7x the detection window, ending at windowStart
    const baselineEnd = new Date(windowStart);
    const baselineStart = new Date(windowStart.getTime() - windowHours * 7 * 3_600_000);

    const clusters = await this.prisma.supportIssueCluster.findMany({
      where: { workspaceId },
      select: { id: true, title: true, arrExposure: true, ticketMaps: { select: { ticketId: true } } },
    });

    if (clusters.length === 0) return [];

    const results: SpikeResult[] = [];

    for (const cluster of clusters) {
      const ticketIds = cluster.ticketMaps.map((m) => m.ticketId);
      if (ticketIds.length === 0) continue;

      // Count tickets in current window
      const currentCount = await this.prisma.supportTicket.count({
        where: {
          id: { in: ticketIds },
          createdAt: { gte: windowStart, lte: windowEnd },
        },
      });

      // Count tickets in baseline window (split into 7 equal sub-windows for std dev)
      const subWindowMs = windowHours * 3_600_000;
      const subCounts: number[] = [];
      for (let i = 0; i < 7; i++) {
        const subStart = new Date(baselineStart.getTime() + i * subWindowMs);
        const subEnd = new Date(subStart.getTime() + subWindowMs);
        const count = await this.prisma.supportTicket.count({
          where: {
            id: { in: ticketIds },
            createdAt: { gte: subStart, lte: subEnd },
          },
        });
        subCounts.push(count);
      }

      const mean = subCounts.reduce((s, c) => s + c, 0) / subCounts.length;
      const variance = subCounts.reduce((s, c) => s + (c - mean) ** 2, 0) / subCounts.length;
      const stdDev = Math.sqrt(variance);

      // Avoid division by zero — use a floor of 1
      const effectiveStdDev = Math.max(stdDev, 1);
      const zScore = (currentCount - mean) / effectiveStdDev;

      if (zScore < zScoreThreshold) continue;

      // Upsert spike event
      const existing = await this.prisma.issueSpikeEvent.findFirst({
        where: { workspaceId, clusterId: cluster.id, windowStart: { gte: windowStart } },
      });

      if (!existing) {
        await this.prisma.issueSpikeEvent.create({
          data: {
            workspaceId,
            clusterId: cluster.id,
            windowStart,
            windowEnd,
            ticketCount: currentCount,
            baseline: mean,
            zScore,
          },
        });
      } else {
        await this.prisma.issueSpikeEvent.update({
          where: { id: existing.id },
          data: { ticketCount: currentCount, baseline: mean, zScore, windowEnd },
        });
      }

      results.push({
        clusterId: cluster.id,
        clusterTitle: cluster.title,
        windowStart,
        windowEnd,
        ticketCount: currentCount,
        baseline: parseFloat(mean.toFixed(2)),
        zScore: parseFloat(zScore.toFixed(2)),
        severity: severityFromZScore(zScore),
        arrExposure: cluster.arrExposure,
      });
    }

    this.logger.log(`[SpikeDetection] Found ${results.length} spikes`);
    return results;
  }

  async getActiveSpikes(workspaceId: string): Promise<
    Array<{
      id: string;
      clusterId: string;
      clusterTitle: string;
      ticketCount: number;
      baseline: number;
      zScore: number;
      severity: SpikeResult['severity'];
      arrExposure: number;
      windowStart: Date;
      windowEnd: Date;
      themeId: string | null;
      themeTitle: string | null;
    }>
  > {
    const since = new Date(Date.now() - 7 * 24 * 3_600_000); // last 7 days
    const spikes = await this.prisma.issueSpikeEvent.findMany({
      where: { workspaceId, windowStart: { gte: since } },
      include: { cluster: { include: { theme: { select: { id: true, title: true } } } } },
      orderBy: { zScore: 'desc' },
      take: 50,
    });

    return spikes.map((s) => ({
      id: s.id,
      clusterId: s.clusterId,
      clusterTitle: s.cluster.title,
      ticketCount: s.ticketCount,
      baseline: parseFloat(s.baseline.toFixed(2)),
      zScore: parseFloat(s.zScore.toFixed(2)),
      severity: severityFromZScore(s.zScore),
      arrExposure: s.cluster.arrExposure,
      windowStart: s.windowStart,
      windowEnd: s.windowEnd,
      themeId: s.cluster.themeId,
      themeTitle: s.cluster.theme?.title ?? null,
    }));
  }
}

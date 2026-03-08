import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { IssueSpikeEvent } from "@prisma/client";

@Injectable()
export class SpikeDetectionService {
  constructor(private readonly prisma: PrismaService) {}

  async detectSpikes(workspaceId: string, windowHours: number = 24, zScoreThreshold: number = 3): Promise<IssueSpikeEvent[]> {
    const now = new Date();
    const windowEnd = new Date(now);
    const windowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);

    // Baseline values — in production these would be computed from historical data
    const baseline = 10;
    const stdDev = 3;

    const recentTicketCounts = await this.prisma.supportTicket.groupBy({
      by: ["workspaceId"],
      where: {
        workspaceId,
        createdAt: { gte: windowStart, lte: windowEnd },
      },
      _count: { id: true },
    });

    const spikeEvents: IssueSpikeEvent[] = [];

    for (const group of recentTicketCounts) {
      const ticketCount = group._count.id;
      const zScore = (ticketCount - baseline) / stdDev;

      if (zScore > zScoreThreshold) {
        // Find the most active cluster in this workspace to link the spike to
        const topCluster = await this.prisma.supportIssueCluster.findFirst({
          where: { workspaceId },
          orderBy: { ticketCount: "desc" },
        });

        if (!topCluster) continue;

        const event = await this.prisma.issueSpikeEvent.create({
          data: {
            workspaceId,
            clusterId: topCluster.id,
            windowStart,
            windowEnd,
            ticketCount,
            baseline,
            zScore,
          },
        });
        spikeEvents.push(event);
      }
    }

    return spikeEvents;
  }
}

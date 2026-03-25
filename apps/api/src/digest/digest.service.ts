import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SummarizationService } from '../ai/services/summarization.service';
import { DigestFrequency } from '@prisma/client';

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly summarizationService: SummarizationService,
  ) {}

  async generateDigest(workspaceId: string, frequency: DigestFrequency = DigestFrequency.WEEKLY) {
    this.logger.log(`Generating ${frequency} digest for workspace ${workspaceId}`);

    const since = new Date();
    if (frequency === DigestFrequency.WEEKLY) {
      since.setDate(since.getDate() - 7);
    }

    const topThemes = await this.prisma.theme.findMany({
      where: {
        workspaceId,
        feedbacks: {
          some: {
            assignedAt: { gte: since },
          },
        },
      },
      orderBy: {
        feedbacks: {
          _count: 'desc',
        },
      },
      take: 5,
    });

    const sentimentSummary = await this.prisma.feedback.aggregate({
      where: {
        workspaceId,
        createdAt: { gte: since },
      },
      _avg: {
        sentiment: true,
      },
    });

    const summaryText = await this.summarizationService.summarize(
      `Weekly digest for workspace ${workspaceId}. Top themes: ${topThemes.map((t) => t.title).join(', ')}. Average sentiment: ${sentimentSummary._avg.sentiment?.toFixed(2)}`
    );

    const digestRun = await this.prisma.digestRun.create({
      data: {
        workspaceId,
        summary: {
          topThemes,
          sentimentSummary,
          summaryText,
        },
      },
    });

    this.logger.log(`Digest ${digestRun.id} created for workspace ${workspaceId}`);

    return digestRun;
  }
}

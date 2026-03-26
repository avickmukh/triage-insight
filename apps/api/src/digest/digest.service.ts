import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SummarizationService } from '../ai/services/summarization.service';
import { EmailService } from '../email/email.service';
import { DigestFrequency } from '@prisma/client';

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly summarizationService: SummarizationService,
    private readonly emailService: EmailService,
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

    await this.sendDigestEmail(digestRun.id);

    return digestRun;
  }

  private async sendDigestEmail(digestRunId: string) {
    const digestRun = await this.prisma.digestRun.findUnique({
      where: { id: digestRunId },
      include: {
        workspace: {
          include: {
            members: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (!digestRun) {
      this.logger.error(`Digest run ${digestRunId} not found for sending email.`);
      return;
    }

    const recipients = digestRun.workspace.members
      .filter((m) => m.user.email)
      .map((m) => m.user.email);

    if (recipients.length === 0) {
      this.logger.warn(`No recipients found for digest email for workspace ${digestRun.workspaceId}`);
      return;
    }

    const summary = digestRun.summary as any;

    for (const recipient of recipients) {
      await this.emailService.send({
        to: recipient,
        subject: `Your Weekly TriageInsight Digest for ${digestRun.workspace.name}`,
        text: `Weekly Digest\n\n${summary.summaryText}\n\nTop Themes:\n${summary.topThemes.map((t: any) => `- ${t.title}`).join('\n')}\n\nAverage sentiment: ${summary.sentimentSummary._avg.sentiment?.toFixed(2)}`,
        html: `
          <h1>Weekly Digest</h1>
          <p>${summary.summaryText}</p>
          <h2>Top Themes</h2>
          <ul>
            ${summary.topThemes.map((t: any) => `<li>${t.title}</li>`).join('')}
          </ul>
          <p>Average sentiment: ${summary.sentimentSummary._avg.sentiment?.toFixed(2)}</p>
        `,
      });
    }

    this.logger.log(`Digest email sent for digest run ${digestRunId} to ${recipients.length} recipients.`);
  }
}

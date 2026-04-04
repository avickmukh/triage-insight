import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SlackService, SlackMessage } from '../providers/slack.service';
import { FeedbackSourceType, Prisma } from '@prisma/client';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { AI_ANALYSIS_QUEUE } from '../../ai/processors/analysis.processor';
import { CIQ_SCORING_QUEUE } from '../../ai/processors/ciq-scoring.processor';

export interface SlackIngestionResult {
  ingested: number;
  skipped: number;
  errors: number;
  channelsSynced: string[];
}

/**
 * SlackIngestionService
 *
 * Fetches messages from configured Slack channels, deduplicates against
 * existing Feedback records (via sourceRef = Slack permalink / ts), and
 * creates new Feedback entries with sourceType=SLACK.
 *
 * Each message is then queued for AI analysis and CIQ scoring, entering
 * the same intelligence pipeline as all other feedback sources.
 */
@Injectable()
export class SlackIngestionService {
  private readonly logger = new Logger(SlackIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly slackService: SlackService,
    @InjectQueue(AI_ANALYSIS_QUEUE) private readonly analysisQueue: Queue,
    @InjectQueue(CIQ_SCORING_QUEUE) private readonly ciqQueue: Queue,
  ) {}

  /**
   * Ingest messages from all configured channels for a workspace.
   * Called by the SlackIngestionProcessor.
   */
  async ingestWorkspace(workspaceId: string): Promise<SlackIngestionResult> {
    const result: SlackIngestionResult = {
      ingested: 0,
      skipped: 0,
      errors: 0,
      channelsSynced: [],
    };

    // Load the Slack integration connection
    const connection = await this.prisma.integrationConnection.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: 'SLACK' } },
    });

    if (!connection) {
      this.logger.warn(
        `No Slack connection found for workspace ${workspaceId}`,
      );
      return result;
    }

    const token = connection.accessToken;
    const metadata = (connection.metadata ?? {}) as Record<string, unknown>;
    const selectedChannels =
      (metadata.channels as Array<{ id: string; name: string }>) ?? [];

    if (selectedChannels.length === 0) {
      this.logger.log(
        `No channels configured for workspace ${workspaceId} — skipping`,
      );
      return result;
    }

    // Use lastSyncedAt as the oldest timestamp for message fetching
    const oldest = connection.lastSyncedAt
      ? String(connection.lastSyncedAt.getTime() / 1000)
      : undefined;

    for (const channel of selectedChannels) {
      try {
        const messages = await this.slackService.fetchMessages(
          token,
          channel.id,
          channel.name,
          oldest,
        );

        for (const msg of messages) {
          const channelResult = await this.ingestMessage(workspaceId, msg);
          if (channelResult === 'ingested') result.ingested++;
          else if (channelResult === 'skipped') result.skipped++;
          else result.errors++;

          // If message has replies, fetch and ingest thread
          if (msg.replyCount && msg.replyCount > 0 && msg.threadTs === msg.ts) {
            try {
              const replies = await this.slackService.fetchThreadReplies(
                token,
                channel.id,
                channel.name,
                msg.ts,
              );
              for (const reply of replies) {
                const replyResult = await this.ingestMessage(
                  workspaceId,
                  reply,
                );
                if (replyResult === 'ingested') result.ingested++;
                else if (replyResult === 'skipped') result.skipped++;
                else result.errors++;
              }
            } catch (threadErr) {
              this.logger.warn(
                `Failed to fetch thread ${msg.ts} in ${channel.name}: ${String(threadErr)}`,
              );
            }
          }
        }

        result.channelsSynced.push(channel.name);
      } catch (channelErr) {
        this.logger.error(
          `Failed to ingest channel ${channel.name}: ${String(channelErr)}`,
        );
        result.errors++;
      }
    }

    // Update lastSyncedAt
    await this.prisma.integrationConnection.update({
      where: { workspaceId_provider: { workspaceId, provider: 'SLACK' } },
      data: { lastSyncedAt: new Date() },
    });

    this.logger.log(
      `Slack ingestion for ${workspaceId}: ingested=${result.ingested}, skipped=${result.skipped}, errors=${result.errors}`,
    );

    return result;
  }

  /**
   * Ingest a single Slack message as a Feedback record.
   * Returns 'ingested', 'skipped' (duplicate), or 'error'.
   */
  private async ingestMessage(
    workspaceId: string,
    msg: SlackMessage,
  ): Promise<'ingested' | 'skipped' | 'error'> {
    // Build a stable sourceRef: slack://<channelId>/<ts>
    const sourceRef = `slack://${msg.channelId}/${msg.ts}`;

    // Deduplicate: skip if already ingested
    const existing = await this.prisma.feedback.findFirst({
      where: { workspaceId, sourceRef },
      select: { id: true },
    });
    if (existing) return 'skipped';

    // Skip very short messages (likely reactions or noise)
    const text = msg.text.trim();
    if (text.length < 10) return 'skipped';

    // Build a title from the first line or first 80 chars
    const firstLine = text.split('\n')[0].trim();
    const title =
      firstLine.length > 80 ? firstLine.slice(0, 77) + '…' : firstLine;

    // Build metadata for traceability
    const slackMetadata: Record<string, unknown> = {
      channelId: msg.channelId,
      channelName: msg.channelName,
      messageTs: msg.ts,
      ...(msg.threadTs ? { threadTs: msg.threadTs } : {}),
      ...(msg.userId ? { authorId: msg.userId } : {}),
      ...(msg.username ? { authorName: msg.username } : {}),
      ...(msg.reactions?.length
        ? {
            reactions: msg.reactions.map((r) => ({
              name: r.name,
              count: r.count,
            })),
            reactionScore: msg.reactions.reduce((sum, r) => sum + r.count, 0),
          }
        : {}),
    };

    try {
      const feedback = await this.prisma.feedback.create({
        data: {
          workspaceId,
          sourceType: FeedbackSourceType.SLACK,
          sourceRef,
          title,
          description: text,
          rawText: text,
          normalizedText: text.toLowerCase(),
          status: 'NEW',
          metadata: slackMetadata as Prisma.InputJsonValue,
          submittedAt: new Date(parseFloat(msg.ts) * 1000),
        },
      });

      // Queue for AI analysis (summarization, embedding, clustering)
      // workspaceId is required by AiAnalysisProcessor for tenant isolation
      await this.analysisQueue
        .add({ feedbackId: feedback.id, workspaceId })
        .catch(() => {});

      // Queue for CIQ scoring — use 'type' not 'action' to match CiqJobPayload
      await this.ciqQueue
        .add({ type: 'FEEDBACK_SCORED', workspaceId, feedbackId: feedback.id })
        .catch(() => {});

      return 'ingested';
    } catch (err) {
      this.logger.error(
        `Failed to create feedback for ${sourceRef}: ${String(err)}`,
      );
      return 'error';
    }
  }
}

/**
 * PortalSignalProcessor
 *
 * Consumes jobs from the PORTAL_SIGNAL_QUEUE and:
 *   1. Updates theme signal weights / vote counts / sentiment aggregates
 *   2. Broadcasts real-time SSE events to connected portal clients
 *   3. Enqueues a CIQ re-scoring job for the affected theme (if any)
 *
 * All DB mutations are lightweight (single-row updates) to keep the worker
 * fast.  Heavy AI work is delegated to the existing AI_ANALYSIS_QUEUE and
 * CIQ_SCORING_QUEUE.
 */
import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { PortalSseGateway } from '../gateway/portal-sse.gateway';
import {
  PORTAL_SIGNAL_QUEUE,
  PORTAL_SIGNAL_JOB,
  PortalSignalPayload,
  RoadmapSignalPayload,
} from '../portal-signal.constants';
import { CIQ_SCORING_QUEUE } from '../../ai/processors/ciq-scoring.processor';

@Processor(PORTAL_SIGNAL_QUEUE)
export class PortalSignalProcessor {
  private readonly logger = new Logger(PortalSignalProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sseGateway: PortalSseGateway,
    @InjectQueue(CIQ_SCORING_QUEUE) private readonly ciqQueue: Queue,
  ) {}

  // ─── FEEDBACK_CREATED ─────────────────────────────────────────────────────

  @Process(PORTAL_SIGNAL_JOB.FEEDBACK_CREATED)
  async handleFeedbackCreated(job: Job<PortalSignalPayload>): Promise<void> {
    const { workspaceId, workspaceSlug, feedbackId } = job.data;
    try {
      // Load the feedback with its linked themes
      const feedback = await this.prisma.feedback.findFirst({
        where: { id: feedbackId, workspaceId },
        select: {
          id: true,
          title: true,
          status: true,
          sentiment: true,
          sourceType: true,
          themes: {
            select: { themeId: true },
          },
          _count: {
            select: { votes: true },
          },
        },
      });

      if (!feedback) return;

      // Broadcast SSE event to all connected portal clients
      this.sseGateway.broadcast(workspaceSlug, {
        type: 'FEEDBACK_CREATED',
        data: {
          feedbackId: feedback.id,
          title: feedback.title,
          status: feedback.status,
          voteCount: feedback._count.votes,
          sentiment: feedback.sentiment,
        },
      });

      // Enqueue CIQ re-scoring for each linked theme
      for (const link of feedback.themes) {
        await this.ciqQueue
          .add(
            'THEME_SCORED',
            { themeId: link.themeId, workspaceId },
            { attempts: 2, removeOnComplete: true },
          )
          .catch(() => {
            /* non-critical */
          });
      }
    } catch (err) {
      this.logger.error(`FEEDBACK_CREATED processor error: ${String(err)}`);
    }
  }

  // ─── FEEDBACK_VOTED ───────────────────────────────────────────────────────

  @Process(PORTAL_SIGNAL_JOB.FEEDBACK_VOTED)
  async handleFeedbackVoted(job: Job<PortalSignalPayload>): Promise<void> {
    const { workspaceId, workspaceSlug, feedbackId } = job.data;
    try {
      // Recompute the live vote count
      const voteCount = await this.prisma.feedbackVote.count({
        where: { feedbackId, workspaceId },
      });

      // Load linked themes for CIQ re-scoring
      const links = await this.prisma.themeFeedback.findMany({
        where: { feedbackId },
        select: { themeId: true },
      });

      // Broadcast SSE
      this.sseGateway.broadcast(workspaceSlug, {
        type: 'FEEDBACK_VOTED',
        data: { feedbackId, voteCount },
      });

      // Enqueue CIQ re-scoring for each linked theme
      for (const link of links) {
        await this.ciqQueue
          .add(
            'THEME_SCORED',
            { themeId: link.themeId, workspaceId },
            { attempts: 2, removeOnComplete: true },
          )
          .catch(() => {
            /* non-critical */
          });
      }
    } catch (err) {
      this.logger.error(`FEEDBACK_VOTED processor error: ${String(err)}`);
    }
  }

  // ─── FEEDBACK_COMMENTED ───────────────────────────────────────────────────

  @Process(PORTAL_SIGNAL_JOB.FEEDBACK_COMMENTED)
  async handleFeedbackCommented(job: Job<PortalSignalPayload>): Promise<void> {
    const { workspaceId, workspaceSlug, feedbackId, data } = job.data;
    try {
      const commentCount = await this.prisma.feedbackComment.count({
        where: { feedbackId, workspaceId },
      });

      // Broadcast SSE
      this.sseGateway.broadcast(workspaceSlug, {
        type: 'FEEDBACK_COMMENTED',
        data: {
          feedbackId,
          commentCount,
          authorName: data?.authorName ?? null,
          body: data?.body ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`FEEDBACK_COMMENTED processor error: ${String(err)}`);
    }
  }

  // ─── ROADMAP_STATUS_CHANGED ───────────────────────────────────────────────

  @Process(PORTAL_SIGNAL_JOB.ROADMAP_STATUS_CHANGED)
  async handleRoadmapStatusChanged(
    job: Job<RoadmapSignalPayload>,
  ): Promise<void> {
    const { workspaceSlug, roadmapItemId, newStatus } = job.data;
    try {
      this.sseGateway.broadcast(workspaceSlug, {
        type: 'ROADMAP_STATUS_CHANGED',
        data: { roadmapItemId, newStatus },
      });
    } catch (err) {
      this.logger.error(
        `ROADMAP_STATUS_CHANGED processor error: ${String(err)}`,
      );
    }
  }
}

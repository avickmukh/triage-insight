import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { ThemeRepository } from '../repositories/theme.repository';
import { AuditService } from '../../ai/services/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateThemeDto } from '../dto/create-theme.dto';
import { UpdateThemeDto } from '../dto/update-theme.dto';
import { QueryThemeDto } from '../dto/query-theme.dto';
import { SplitThemeDto } from '../dto/split-theme.dto';
import { MoveFeedbackDto } from '../dto/move-feedback.dto';
import { AuditLogAction } from '@prisma/client';
import { CIQ_SCORING_QUEUE } from '../../ai/processors/ciq-scoring.processor';

export const AI_CLUSTERING_QUEUE = 'theme-clustering';

@Injectable()
export class ThemeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly themeRepository: ThemeRepository,
    private readonly auditService: AuditService,
    @InjectQueue(AI_CLUSTERING_QUEUE) private readonly clusteringQueue: Queue,
    @InjectQueue(CIQ_SCORING_QUEUE) private readonly ciqQueue: Queue,
  ) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async create(workspaceId: string, userId: string, createThemeDto: CreateThemeDto) {
    const { title, description, feedbackIds } = createThemeDto;

    const theme = await this.themeRepository.create(workspaceId, {
      title,
      description,
      ...(feedbackIds && feedbackIds.length > 0 && {
        feedbacks: {
          create: feedbackIds.map((id) => ({ feedbackId: id, assignedBy: 'manual' })),
        },
      }),
    });

    await this.auditService.logAction(workspaceId, userId, AuditLogAction.THEME_CREATE, { themeId: theme.id, title });

    // Trigger CIQ scoring if feedback was linked at creation
    if (feedbackIds && feedbackIds.length > 0) {
      try {
      await this.ciqQueue.add({ type: 'THEME_SCORED', workspaceId, themeId: theme.id });
      } catch (queueErr) {
        console.warn('[Queue] Redis unavailable — job skipped:', (queueErr as Error).message);
      }
    }

    return theme;
  }

  async findAll(workspaceId: string, query: QueryThemeDto) {
    return this.themeRepository.findMany(workspaceId, query);
  }

  /**
   * Return theme detail with:
   * - linked feedback items (paginated, default 50)
   * - real feedbackCount from _count
   * - aggregated priorityScore from linked feedback impactScores
   */
  async findOne(workspaceId: string, id: string) {
    const theme = await this.prisma.theme.findFirst({
      where: { id, workspaceId },
      include: {
        _count: { select: { feedbacks: true } },
        feedbacks: {
          take: 50,
          orderBy: { assignedAt: 'desc' },
          include: {
            feedback: {
              select: {
                id: true,
                title: true,
                description: true,
                status: true,
                sourceType: true,
                sentiment: true,
                impactScore: true,
                createdAt: true,
                submittedAt: true,
                customerId: true,
                portalUserId: true,
              },
            },
          },
        },
      },
    });

    if (!theme) {
      throw new NotFoundException('Theme not found');
    }

    // Aggregate priority score: mean of non-null impactScores across linked feedback
    const impactScores = theme.feedbacks
      .map((tf) => tf.feedback.impactScore)
      .filter((v): v is number => v !== null && v !== undefined);

    const aggregatedPriorityScore =
      impactScores.length > 0
        ? impactScores.reduce((a, b) => a + b, 0) / impactScores.length
        : null;

    // Flatten linked feedback for the response
    const linkedFeedback = theme.feedbacks.map((tf) => ({
      ...tf.feedback,
      assignedAt: tf.assignedAt,
      assignedBy: tf.assignedBy,
      confidence: tf.confidence,
    }));

    return {
      id: theme.id,
      workspaceId: theme.workspaceId,
      title: theme.title,
      description: theme.description,
      status: theme.status,
      pinned: theme.pinned,
      priorityScore: theme.priorityScore,
      revenueInfluence: theme.revenueInfluence,
      signalBreakdown: theme.signalBreakdown,
      // ── Unified cross-source signal counts ─────────────────────────────────────────────────────────────────────────────────────────────────
      // These are written by CIQ.persistThemeScore after every recomputation.
      // feedbackCount prefers the CIQ-persisted value (which excludes MERGED rows)
      // and falls back to the raw _count for themes not yet scored.
      feedbackCount:    theme.feedbackCount    ?? theme._count.feedbacks,
      voiceCount:       theme.voiceCount       ?? 0,
      supportCount:     theme.supportCount     ?? 0,
      surveyCount:      theme.surveyCount      ?? 0,
      totalSignalCount: theme.totalSignalCount ?? 0,
      // ── Stage-2 AI Narration ─────────────────────────────────────────────────────────────────────────────────────────────────
      aiSummary: theme.aiSummary,
      aiExplanation: theme.aiExplanation,
      aiRecommendation: theme.aiRecommendation,
      aiConfidence: theme.aiConfidence,
      aiNarratedAt: theme.aiNarratedAt,
      // ── Cluster confidence + explainability ───────────────────────────────────────────────────────
      clusterConfidence: theme.clusterConfidence,
      confidenceFactors: theme.confidenceFactors,
      outlierCount: theme.outlierCount,
      topKeywords: theme.topKeywords,
      dominantSignal: theme.dominantSignal,
      createdAt: theme.createdAt,
      updatedAt: theme.updatedAt,
      aggregatedPriorityScore,
      linkedFeedback,
    };
  }

  async update(workspaceId: string, userId: string, id: string, updateThemeDto: UpdateThemeDto) {
    await this.findOne(workspaceId, id);
    const updatedTheme = await this.themeRepository.update(id, updateThemeDto);
    await this.auditService.logAction(workspaceId, userId, AuditLogAction.THEME_UPDATE, { themeId: id, changes: updateThemeDto });

    // Re-score theme when its metadata changes (status, title, etc.)
    try {
    await this.ciqQueue.add({ type: 'THEME_SCORED', workspaceId, themeId: id });
    } catch (queueErr) {
      console.warn('[Queue] Redis unavailable — job skipped:', (queueErr as Error).message);
    }

    return updatedTheme;
  }

  // ─── Feedback linking ─────────────────────────────────────────────────────

  /**
   * List all feedback linked to a theme (paginated).
   */
  async listLinkedFeedback(
    workspaceId: string,
    themeId: string,
    page = 1,
    limit = 50,
  ) {
    // Verify theme belongs to workspace
    const theme = await this.prisma.theme.findFirst({ where: { id: themeId, workspaceId } });
    if (!theme) throw new NotFoundException('Theme not found');

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.themeFeedback.findMany({
        where: { themeId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { assignedAt: 'desc' },
        include: {
          feedback: {
            select: {
              id: true,
              title: true,
              description: true,
              status: true,
              sourceType: true,
              sentiment: true,
              impactScore: true,
              createdAt: true,
              submittedAt: true,
              customerId: true,
              portalUserId: true,
            },
          },
        },
      }),
      this.prisma.themeFeedback.count({ where: { themeId } }),
    ]);

    const data = rows.map((tf) => ({
      ...tf.feedback,
      assignedAt: tf.assignedAt,
      assignedBy: tf.assignedBy,
      confidence: tf.confidence,
    }));

    return { data, total, page, limit };
  }

  /**
   * Add a single feedback item to a theme (manual assignment).
   */
  async addFeedback(workspaceId: string, userId: string, themeId: string, feedbackId: string) {
    // Verify theme belongs to workspace
    const theme = await this.prisma.theme.findFirst({ where: { id: themeId, workspaceId } });
    if (!theme) throw new NotFoundException('Theme not found');

    // Verify feedback belongs to workspace
    const feedback = await this.prisma.feedback.findFirst({ where: { id: feedbackId, workspaceId } });
    if (!feedback) throw new NotFoundException('Feedback not found');

    await this.prisma.themeFeedback.upsert({
      where: { themeId_feedbackId: { themeId, feedbackId } },
      create: { themeId, feedbackId, assignedBy: 'manual' },
      update: { assignedBy: 'manual', confidence: null },
    });

    await this.auditService.logAction(workspaceId, userId, AuditLogAction.THEME_FEEDBACK_ADD, {
      themeId,
      feedbackIds: [feedbackId],
    });

    // Re-score theme now that a new feedback signal was added
    try {
    await this.ciqQueue.add({ type: 'THEME_SCORED', workspaceId, themeId });
    } catch (queueErr) {
      console.warn('[Queue] Redis unavailable — job skipped:', (queueErr as Error).message);
    }

    return { success: true };
  }

  /**
   * Remove a single feedback item from a theme.
   */
  async removeFeedback(workspaceId: string, userId: string, themeId: string, feedbackId: string) {
    // Verify theme belongs to workspace
    const theme = await this.prisma.theme.findFirst({ where: { id: themeId, workspaceId } });
    if (!theme) throw new NotFoundException('Theme not found');

    const existing = await this.prisma.themeFeedback.findUnique({
      where: { themeId_feedbackId: { themeId, feedbackId } },
    });
    if (!existing) {
      throw new BadRequestException('Feedback is not linked to this theme');
    }

    await this.prisma.themeFeedback.delete({
      where: { themeId_feedbackId: { themeId, feedbackId } },
    });

    await this.auditService.logAction(workspaceId, userId, AuditLogAction.THEME_FEEDBACK_REMOVE, {
      themeId,
      feedbackIds: [feedbackId],
    });

    // Re-score theme after signal removal
    try {
    await this.ciqQueue.add({ type: 'THEME_SCORED', workspaceId, themeId });
    } catch (queueErr) {
      console.warn('[Queue] Redis unavailable — job skipped:', (queueErr as Error).message);
    }

    return { success: true };
  }

  // ─── Bulk feedback move ───────────────────────────────────────────────────

  async moveFeedback(workspaceId: string, userId: string, moveFeedbackDto: MoveFeedbackDto) {
    const { feedbackIds, sourceThemeId, targetThemeId } = moveFeedbackDto;

    if (!sourceThemeId && !targetThemeId) {
      throw new BadRequestException('Either sourceThemeId or targetThemeId must be provided.');
    }

    if (sourceThemeId) {
      await this.prisma.themeFeedback.deleteMany({
        where: { themeId: sourceThemeId, feedbackId: { in: feedbackIds } },
      });
      await this.auditService.logAction(workspaceId, userId, AuditLogAction.THEME_FEEDBACK_REMOVE, {
        themeId: sourceThemeId,
        feedbackIds,
      });
      // Re-score source theme
      try {
      await this.ciqQueue.add({ type: 'THEME_SCORED', workspaceId, themeId: sourceThemeId });
      } catch (queueErr) {
        console.warn('[Queue] Redis unavailable — job skipped:', (queueErr as Error).message);
      }
    }

    if (targetThemeId) {
      await this.prisma.themeFeedback.createMany({
        data: feedbackIds.map((id) => ({ themeId: targetThemeId, feedbackId: id, assignedBy: 'manual' })),
        skipDuplicates: true,
      });
      await this.auditService.logAction(workspaceId, userId, AuditLogAction.THEME_FEEDBACK_ADD, {
        themeId: targetThemeId,
        feedbackIds,
      });
      // Re-score target theme
      try {
      await this.ciqQueue.add({ type: 'THEME_SCORED', workspaceId, themeId: targetThemeId });
      } catch (queueErr) {
        console.warn('[Queue] Redis unavailable — job skipped:', (queueErr as Error).message);
      }
    }

    return { success: true };
  }

  // ─── Merge / Split ────────────────────────────────────────────────────────

  async merge(workspaceId: string, userId: string, targetThemeId: string, sourceThemeIds: string[]) {
    if (sourceThemeIds.includes(targetThemeId)) {
      throw new BadRequestException('Cannot merge a theme into itself.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // For each source theme, re-link its feedback to the target theme.
      const sourceLinks = await tx.themeFeedback.findMany({
        where: { themeId: { in: sourceThemeIds } },
      });

      for (const link of sourceLinks) {
        await tx.themeFeedback.upsert({
          where: { themeId_feedbackId: { themeId: targetThemeId, feedbackId: link.feedbackId } },
          create: {
            themeId: targetThemeId,
            feedbackId: link.feedbackId,
            assignedBy: link.assignedBy,
            confidence: link.confidence,
          },
          update: {},
        });
      }

      await tx.themeFeedback.deleteMany({ where: { themeId: { in: sourceThemeIds } } });
      await tx.theme.deleteMany({ where: { id: { in: sourceThemeIds }, workspaceId } });

      await this.auditService.logAction(workspaceId, userId, AuditLogAction.THEME_MERGE, {
        targetThemeId,
        sourceThemeIds,
      });

      return this.findOne(workspaceId, targetThemeId);
    });

    // Re-score merged theme
    try {
    await this.ciqQueue.add({ type: 'THEME_SCORED', workspaceId, themeId: targetThemeId });
    } catch (queueErr) {
      console.warn('[Queue] Redis unavailable — job skipped:', (queueErr as Error).message);
    }

    return result;
  }

  async split(workspaceId: string, userId: string, sourceThemeId: string, splitThemeDto: SplitThemeDto) {
    const { newThemeTitle, newThemeDescription, feedbackIdsToMove } = splitThemeDto;

    const newTheme = await this.prisma.$transaction(async (tx) => {
      const created = await tx.theme.create({
        data: { workspaceId, title: newThemeTitle, description: newThemeDescription },
      });

      const sourceLinks = await tx.themeFeedback.findMany({
        where: { themeId: sourceThemeId, feedbackId: { in: feedbackIdsToMove } },
      });

      for (const link of sourceLinks) {
        await tx.themeFeedback.upsert({
          where: { themeId_feedbackId: { themeId: created.id, feedbackId: link.feedbackId } },
          create: {
            themeId: created.id,
            feedbackId: link.feedbackId,
            assignedBy: link.assignedBy,
            confidence: link.confidence,
          },
          update: {},
        });
      }

      await tx.themeFeedback.deleteMany({
        where: { themeId: sourceThemeId, feedbackId: { in: feedbackIdsToMove } },
      });

      await this.auditService.logAction(workspaceId, userId, AuditLogAction.THEME_SPLIT, {
        sourceThemeId,
        newThemeId: created.id,
        feedbackIdsToMove,
      });

      return created;
    });

    // Re-score both themes after split
    try {
    await this.ciqQueue.add({ type: 'THEME_SCORED', workspaceId, themeId: sourceThemeId });
    } catch (queueErr) {
      console.warn('[Queue] Redis unavailable — job skipped:', (queueErr as Error).message);
    }
    try {
    await this.ciqQueue.add({ type: 'THEME_SCORED', workspaceId, themeId: newTheme.id });
    } catch (queueErr) {
      console.warn('[Queue] Redis unavailable — job skipped:', (queueErr as Error).message);
    }

    return newTheme;
  }

  // ─── Customer linking ─────────────────────────────────────────────────────

  /**
   * Manually link a customer to a theme by creating a CustomerSignal record.
   * This is used when a PM wants to explicitly associate a customer with a theme
   * outside of the normal feedback-driven flow.
   */
  async linkCustomer(workspaceId: string, themeId: string, customerId: string) {
    const [theme, customer] = await Promise.all([
      this.prisma.theme.findFirst({ where: { id: themeId, workspaceId } }),
      this.prisma.customer.findFirst({ where: { id: customerId, workspaceId } }),
    ]);
    if (!theme) throw new NotFoundException(`Theme ${themeId} not found`);
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);

    // Upsert a MANUAL signal so we don't create duplicates
    const existing = await this.prisma.customerSignal.findFirst({
      where: { workspaceId, customerId, themeId, signalType: 'MANUAL' },
    });

    if (!existing) {
      await this.prisma.customerSignal.create({
        data: {
          workspaceId,
          customerId,
          themeId,
          signalType: 'MANUAL',
          strength: 1.0,
        },
      });
    }

    try {
    await this.ciqQueue.add({ type: 'THEME_SCORED', workspaceId, themeId });
    } catch (queueErr) {
      console.warn('[Queue] Redis unavailable — job skipped:', (queueErr as Error).message);
    }
    return { success: true, message: 'Customer linked to theme.' };
  }

  /**
   * Remove a manually-linked customer signal from a theme.
   */
  async unlinkCustomer(workspaceId: string, themeId: string, customerId: string) {
    const signal = await this.prisma.customerSignal.findFirst({
      where: { workspaceId, customerId, themeId, signalType: 'MANUAL' },
    });
    if (!signal) throw new NotFoundException('No manual customer link found for this theme');

    await this.prisma.customerSignal.delete({ where: { id: signal.id } });
    try {
    await this.ciqQueue.add({ type: 'THEME_SCORED', workspaceId, themeId });
    } catch (queueErr) {
      console.warn('[Queue] Redis unavailable — job skipped:', (queueErr as Error).message);
    }
    return { success: true, message: 'Customer unlinked from theme.' };
  }

   // ─── Auto-merge ───────────────────────────────────────────────────────────

  /**
   * Dismiss an auto-merge suggestion for a theme.
   * Clears autoMergeCandidate, autoMergeTargetId, and autoMergeSimilarity.
   */
  async dismissAutoMerge(workspaceId: string, themeId: string) {
    const theme = await this.prisma.theme.findUnique({ where: { id: themeId } });
    if (!theme || theme.workspaceId !== workspaceId) {
      throw new NotFoundException('Theme not found');
    }
    await this.prisma.theme.update({
      where: { id: themeId },
      data: { autoMergeCandidate: false, autoMergeTargetId: null, autoMergeSimilarity: null },
    });
    return { success: true, message: 'Auto-merge suggestion dismissed.' };
  }

  // ─── Reclustering ─────────────────────────────────────────────────────────
  async triggerReclustering(workspaceId: string) {
    let jobId: string | undefined;
    try {
      const job = await this.clusteringQueue.add({ workspaceId });
      jobId = String(job.id);
    } catch (queueErr) {
      console.warn('[Queue] Redis unavailable — job skipped:', (queueErr as Error).message);
    }
    return { message: 'Theme reclustering job dispatched.', jobId };
  }
}

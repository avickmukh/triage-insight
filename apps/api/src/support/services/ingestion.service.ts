import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import {
  IntegrationProvider,
  SupportTicket,
  FeedbackPrimarySource,
  FeedbackSecondarySource,
  FeedbackSourceType,
} from '@prisma/client';
import { AI_ANALYSIS_QUEUE } from '../../ai/processors/analysis.processor';
import { RetryPolicy } from '../../common/queue/retry-policy';

/**
 * IngestionService — ingests support tickets from external providers.
 *
 * For each new ticket (identified by workspaceId + provider + externalId),
 * a unified Feedback record is created with primarySource=SUPPORT so the
 * ticket flows through the same AI analysis → ThemeFeedback → CIQ pipeline
 * as all other signal types. The SupportTicket row stores a reference to
 * the bridged Feedback via `unifiedFeedbackId` to prevent duplicate creation
 * on subsequent syncs.
 *
 * BATCH FINALIZATION
 * ------------------
 * When multiple tickets are ingested in a single call, an ImportBatch record
 * is created and each Feedback is linked to it via `importBatchId`. The
 * AiAnalysisProcessor.updateBatchProgress() method detects when the last item
 * completes and automatically triggers ThemeClusteringService.runBatchFinalization(),
 * which runs borderline reassignment, batch merge, weak cluster suppression,
 * centroid refresh, promotion, and confidence refresh.
 *
 * Single-ticket ingestions (e.g. webhook-driven) also get a batch record so
 * the same finalization path fires, giving the clustering engine a chance to
 * suppress any weak provisional themes created by the new item.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(AI_ANALYSIS_QUEUE) private readonly analysisQueue: Queue,
  ) {}

  async ingestTickets(
    workspaceId: string,
    provider: IntegrationProvider,
    tickets: Partial<SupportTicket>[],
  ) {
    const validTickets = tickets.filter(
      (t) => t.externalId,
    ) as (Partial<SupportTicket> & { externalId: string })[];

    const createdFeedbackIds: string[] = [];

    for (const ticket of validTickets) {
      const { id: _id, ...rest } = ticket;
      const data = { ...rest, workspaceId, provider };

      // ── Upsert the SupportTicket row ──────────────────────────────────────
      const upserted = await this.prisma.supportTicket.upsert({
        where: {
          workspaceId_provider_externalId: {
            workspaceId,
            provider,
            externalId: ticket.externalId,
          },
        },
        update: data,
        create: {
          externalId: ticket.externalId,
          subject: ticket.subject ?? '(no subject)',
          workspaceId,
          provider,
          status: ticket.status ?? 'OPEN',
          tags: ticket.tags ?? [],
          customerId: ticket.customerEmail ?? undefined,
          customerEmail: ticket.customerEmail ?? undefined,
          arrValue: ticket.arrValue ?? undefined,
          externalCreatedAt: ticket.externalCreatedAt ?? undefined,
        },
        select: {
          id: true,
          unifiedFeedbackId: true,
          subject: true,
          description: true,
          customerId: true,
        },
      });

      // ── Bridge to unified Feedback (only for new tickets) ─────────────────
      // Skip if a Feedback record was already created for this ticket.
      if (upserted.unifiedFeedbackId) continue;

      try {
        const secondarySource: FeedbackSecondarySource =
          provider === IntegrationProvider.ZENDESK
            ? FeedbackSecondarySource.ZENDESK
            : provider === IntegrationProvider.INTERCOM
              ? FeedbackSecondarySource.INTERCOM
              : FeedbackSecondarySource.OTHER;

        const feedback = await this.prisma.feedback.create({
          data: {
            workspaceId,
            title: upserted.subject ?? '(no subject)',
            description: upserted.description ?? '',
            rawText: upserted.description ?? '',
            normalizedText: (upserted.description ?? '').toLowerCase(),
            status: 'NEW',
            sourceType: FeedbackSourceType.API,
            primarySource: FeedbackPrimarySource.SUPPORT,
            secondarySource,
            customerId: upserted.customerId ?? undefined,
            submittedAt: ticket.externalCreatedAt ?? undefined,
          },
          select: { id: true },
        });

        // Link the Feedback back to the SupportTicket
        await this.prisma.supportTicket.update({
          where: { id: upserted.id },
          data: { unifiedFeedbackId: feedback.id },
        });

        createdFeedbackIds.push(feedback.id);
      } catch (err) {
        this.logger.warn(
          `Failed to create unified Feedback for SupportTicket ${upserted.id}: ${(err as Error).message}`,
        );
      }
    }

    if (createdFeedbackIds.length === 0) {
      this.logger.log(
        `Ingested ${validTickets.length} tickets for workspace ${workspaceId}; 0 new Feedback records (all already bridged)`,
      );
      return { ingested: validTickets.length, bridged: 0 };
    }

    // ── Create an ImportBatch so batch finalization fires automatically ───────
    // The AiAnalysisProcessor increments completedRows/failedRows as each job
    // finishes. When all rows are accounted for it triggers runBatchFinalization()
    // which runs borderline reassignment, merge, suppress, centroid refresh,
    // promote, and confidence refresh — giving the clustering engine a full
    // batch-level view before themes become visible.
    let batchId: string | null = null;
    try {
      const batch = await this.prisma.importBatch.create({
        data: {
          workspaceId,
          totalRows: createdFeedbackIds.length,
          completedRows: 0,
          failedRows: 0,
          stage: 'ANALYZING',
          status: 'PROCESSING',
        },
        select: { id: true },
      });
      batchId = batch.id;

      // Link each feedback to the batch
      if (batchId) {
        await this.prisma.feedback.updateMany({
          where: { id: { in: createdFeedbackIds } },
          data: { importBatchId: batchId },
        });
      }
    } catch (err) {
      // Non-fatal: batch tracking is a quality enhancement, not a blocker.
      this.logger.warn(
        `Failed to create ImportBatch for support sync (workspace=${workspaceId}): ${(err as Error).message}`,
      );
    }

    // ── Enqueue AI analysis for all newly bridged Feedback records ───────────
    for (const feedbackId of createdFeedbackIds) {
      try {
        await this.analysisQueue.add(
          { feedbackId, workspaceId },
          RetryPolicy.standard(),
        );
      } catch (err) {
        this.logger.warn(
          `Failed to enqueue AI analysis for bridged Feedback ${feedbackId}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Ingested ${validTickets.length} tickets for workspace ${workspaceId}; ` +
        `bridged ${createdFeedbackIds.length} new Feedback records` +
        (batchId ? ` (batchId=${batchId})` : ''),
    );

    return {
      ingested: validTickets.length,
      bridged: createdFeedbackIds.length,
    };
  }
}

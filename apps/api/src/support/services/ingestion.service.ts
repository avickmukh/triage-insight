import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import type { Queue } from "bull";
import { PrismaService } from "../../prisma/prisma.service";
import {
  IntegrationProvider,
  SupportTicket,
  FeedbackPrimarySource,
  FeedbackSecondarySource,
  FeedbackSourceType,
} from "@prisma/client";
import { AI_ANALYSIS_QUEUE } from "../../ai/processors/analysis.processor";
import { RetryPolicy } from "../../common/queue/retry-policy";

/**
 * IngestionService — ingests support tickets from external providers.
 *
 * For each new ticket (identified by workspaceId + provider + externalId),
 * a unified Feedback record is created with primarySource=SUPPORT so the
 * ticket flows through the same AI analysis → ThemeFeedback → CIQ pipeline
 * as all other signal types. The SupportTicket row stores a reference to
 * the bridged Feedback via `unifiedFeedbackId` to prevent duplicate creation
 * on subsequent syncs.
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
          subject: ticket.subject ?? "(no subject)",
          workspaceId,
          provider,
          status: ticket.status ?? "OPEN",
          tags: ticket.tags ?? [],
          customerId: ticket.customerEmail ?? undefined,
          customerEmail: ticket.customerEmail ?? undefined,
          arrValue: ticket.arrValue ?? undefined,
          externalCreatedAt: ticket.externalCreatedAt ?? undefined,
        },
        select: { id: true, unifiedFeedbackId: true, subject: true, description: true, customerId: true },
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
            title: upserted.subject ?? "(no subject)",
            description: upserted.description ?? "",
            rawText: upserted.description ?? "",
            normalizedText: (upserted.description ?? "").toLowerCase(),
            status: "NEW",
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
      `Ingested ${validTickets.length} tickets for workspace ${workspaceId}; bridged ${createdFeedbackIds.length} new Feedback records`,
    );

    return { ingested: validTickets.length, bridged: createdFeedbackIds.length };
  }
}

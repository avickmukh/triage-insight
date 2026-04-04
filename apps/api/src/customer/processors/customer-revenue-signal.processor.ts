/**
 * CustomerRevenueSignalProcessor
 *
 * Consumes the `customer-revenue-signal` Bull queue.
 *
 * Job types:
 *   - RECOMPUTE_THEME_REVENUE   : recompute revenueInfluence for a single theme
 *   - RECOMPUTE_WORKSPACE       : recompute revenueInfluence for ALL themes in a workspace
 *
 * Revenue influence formula:
 *   theme.revenueInfluence =
 *     SUM(arrValue of customers whose feedback is linked to this theme)
 *     + SUM(annualValue × influenceWeight of OPEN deals linked to this theme)
 *
 * After updating revenueInfluence, the processor enqueues a CIQ THEME_SCORED
 * job so the full priority score is recalculated with the fresh revenue data.
 */

import { Processor, Process, InjectQueue } from '@nestjs/bull';
import type { Job, Queue } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CIQ_SCORING_QUEUE,
  type CiqJobPayload,
} from '../../ai/processors/ciq-scoring.processor';

export const CUSTOMER_REVENUE_SIGNAL_QUEUE = 'customer-revenue-signal';

export type CustomerRevenueSignalJobType =
  | 'RECOMPUTE_THEME_REVENUE'
  | 'RECOMPUTE_WORKSPACE';

export interface CustomerRevenueSignalJobPayload {
  type: CustomerRevenueSignalJobType;
  workspaceId: string;
  /** Required when type === RECOMPUTE_THEME_REVENUE */
  themeId?: string;
}

@Injectable()
@Processor(CUSTOMER_REVENUE_SIGNAL_QUEUE)
export class CustomerRevenueSignalProcessor {
  private readonly logger = new Logger(CustomerRevenueSignalProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(CIQ_SCORING_QUEUE)
    private readonly ciqQueue: Queue<CiqJobPayload>,
  ) {}

  @Process()
  async handle(job: Job<CustomerRevenueSignalJobPayload>) {
    const { type, workspaceId } = job.data;

    try {
      switch (type) {
        case 'RECOMPUTE_THEME_REVENUE': {
          const { themeId } = job.data;
          if (!themeId) {
            this.logger.warn('RECOMPUTE_THEME_REVENUE job missing themeId');
            return;
          }
          await this.recomputeThemeRevenue(workspaceId, themeId);
          break;
        }

        case 'RECOMPUTE_WORKSPACE': {
          await this.recomputeWorkspaceRevenue(workspaceId);
          break;
        }

        default:
          this.logger.warn(`Unknown CustomerRevenueSignal job type: ${type}`);
      }
    } catch (err) {
      this.logger.error(
        `CustomerRevenueSignal job failed [${type}]: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err; // Re-throw so Bull marks the job as failed and retries
    }
  }

  // ─── Core computation ────────────────────────────────────────────────────────

  /**
   * Recompute revenueInfluence for a single theme, then enqueue CIQ re-scoring.
   */
  async recomputeThemeRevenue(
    workspaceId: string,
    themeId: string,
  ): Promise<void> {
    const revenueInfluence = await this.computeRevenueInfluence(
      workspaceId,
      themeId,
    );

    await this.prisma.theme.update({
      where: { id: themeId },
      data: { revenueInfluence },
    });

    this.logger.debug(
      `Revenue influence updated: theme=${themeId} → $${revenueInfluence.toFixed(0)}`,
    );

    // Enqueue CIQ re-scoring so the full priority score reflects the new revenue
    await this.ciqQueue.add(
      { type: 'THEME_SCORED', workspaceId, themeId },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );
  }

  /**
   * Recompute revenueInfluence for every active theme in the workspace.
   */
  async recomputeWorkspaceRevenue(workspaceId: string): Promise<void> {
    const themes = await this.prisma.theme.findMany({
      where: { workspaceId, status: { not: 'ARCHIVED' } },
      select: { id: true },
    });

    this.logger.log(
      `Recomputing revenue influence for ${themes.length} themes in workspace ${workspaceId}`,
    );

    for (const theme of themes) {
      await this.recomputeThemeRevenue(workspaceId, theme.id);
    }
  }

  // ─── Revenue formula ─────────────────────────────────────────────────────────

  /**
   * theme.revenueInfluence =
   *   SUM(arrValue of customers whose feedback is linked to this theme)
   *   + SUM(annualValue × influenceWeight of OPEN deals linked to this theme)
   */
  private async computeRevenueInfluence(
    workspaceId: string,
    themeId: string,
  ): Promise<number> {
    const [feedbackLinks, dealLinks] = await Promise.all([
      // Customer ARR from feedback linked to this theme
      this.prisma.themeFeedback.findMany({
        where: { themeId },
        select: {
          feedback: {
            select: {
              customerId: true,
              customer: {
                select: { arrValue: true },
              },
            },
          },
        },
      }),
      // Open deal pipeline linked to this theme
      this.prisma.dealThemeLink.findMany({
        where: { themeId },
        select: {
          deal: {
            select: {
              annualValue: true,
              influenceWeight: true,
              status: true,
              workspaceId: true,
            },
          },
        },
      }),
    ]);

    // De-duplicate customers (each customer's ARR counted once)
    const seenCustomerIds = new Set<string>();
    let arrSum = 0;
    for (const link of feedbackLinks) {
      const customerId = link.feedback.customerId;
      if (customerId && !seenCustomerIds.has(customerId)) {
        seenCustomerIds.add(customerId);
        arrSum += link.feedback.customer?.arrValue ?? 0;
      }
    }

    // Sum open deal pipeline (workspace-isolated)
    let dealSum = 0;
    for (const link of dealLinks) {
      const deal = link.deal;
      if (deal.status === 'OPEN' && deal.workspaceId === workspaceId) {
        dealSum += deal.annualValue * (deal.influenceWeight ?? 1.0);
      }
    }

    return arrSum + dealSum;
  }
}

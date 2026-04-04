import { Injectable, Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';

export const CUSTOMER_SIGNAL_AGGREGATION_QUEUE = 'customer-signal-aggregation';

export type CustomerSignalAggregationJobType =
  | 'AGGREGATE_CUSTOMER'
  | 'AGGREGATE_WORKSPACE';

export interface CustomerSignalAggregationJobPayload {
  type: CustomerSignalAggregationJobType;
  workspaceId: string;
  /** Required when type === AGGREGATE_CUSTOMER */
  customerId?: string;
}

@Injectable()
@Processor(CUSTOMER_SIGNAL_AGGREGATION_QUEUE)
export class CustomerSignalAggregationProcessor {
  private readonly logger = new Logger(CustomerSignalAggregationProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process()
  async handle(job: Job<CustomerSignalAggregationJobPayload>) {
    const { type, workspaceId } = job.data;
    try {
      switch (type) {
        case 'AGGREGATE_CUSTOMER': {
          const { customerId } = job.data;
          if (!customerId) {
            this.logger.warn('AGGREGATE_CUSTOMER job missing customerId');
            return;
          }
          await this.aggregateCustomer(workspaceId, customerId);
          break;
        }
        case 'AGGREGATE_WORKSPACE': {
          await this.aggregateWorkspace(workspaceId);
          break;
        }
        default:
          this.logger.warn(
            `Unknown CustomerSignalAggregation job type: ${type}`,
          );
      }
    } catch (err) {
      this.logger.error(
        `CustomerSignalAggregation job failed [${type}]: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err;
    }
  }

  // ─── Aggregate a single customer ─────────────────────────────────────────────

  async aggregateCustomer(
    workspaceId: string,
    customerId: string,
  ): Promise<void> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, workspaceId },
      select: {
        id: true,
        arrValue: true,
        lifecycleStage: true,
        churnRisk: true,
        feedbacks: {
          select: {
            id: true,
            sentiment: true,
            impactScore: true,
            createdAt: true,
            submittedAt: true,
            status: true,
          },
        },
        supportTickets: {
          select: {
            id: true,
            status: true,
            createdAt: true,
          },
        },
        signals: {
          select: {
            id: true,
            signalType: true,
            strength: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        deals: {
          select: {
            id: true,
            status: true,
            annualValue: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!customer) return;

    const scores = this.computeScores(customer);

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        ciqInfluenceScore: scores.ciqInfluenceScore,
        featureDemandScore: scores.featureDemandScore,
        supportIntensityScore: scores.supportIntensityScore,
        healthScore: scores.healthScore,
        lastActivityAt: scores.lastActivityAt ?? undefined,
      },
    });

    this.logger.debug(
      `Customer ${customerId} scores updated: CIQ=${scores.ciqInfluenceScore.toFixed(1)} ` +
        `FD=${scores.featureDemandScore.toFixed(1)} SI=${scores.supportIntensityScore.toFixed(1)} ` +
        `Health=${scores.healthScore.toFixed(1)}`,
    );
  }

  // ─── Aggregate all customers in a workspace ───────────────────────────────────

  async aggregateWorkspace(workspaceId: string): Promise<void> {
    const customers = await this.prisma.customer.findMany({
      where: { workspaceId },
      select: { id: true },
    });
    this.logger.log(
      `Aggregating signals for ${customers.length} customers in workspace ${workspaceId}`,
    );
    for (const c of customers) {
      await this.aggregateCustomer(workspaceId, c.id);
    }
  }

  // ─── Score computation ────────────────────────────────────────────────────────

  private computeScores(customer: {
    arrValue?: number | null;
    lifecycleStage: string;
    churnRisk?: number | null;
    feedbacks: Array<{
      sentiment?: number | null;
      impactScore?: number | null;
      createdAt: Date;
      submittedAt: Date | null;
    }>;
    supportTickets: Array<{ status: string; createdAt: Date }>;
    signals: Array<{ signalType: string; strength: number; createdAt: Date }>;
    deals: Array<{ status: string; annualValue: number; updatedAt: Date }>;
  }) {
    const arr = customer.arrValue ?? 0;
    const feedbacks = customer.feedbacks;
    const tickets = customer.supportTickets;
    const signals = customer.signals;
    const deals = customer.deals;

    // ── Feature Demand Score ─────────────────────────────────────────────────
    // Based on feedback volume (normalised to 100) weighted by ARR tier
    const feedbackCount = feedbacks.length;
    const arrTierMultiplier =
      arr >= 100_000 ? 1.5 : arr >= 50_000 ? 1.25 : arr >= 10_000 ? 1.1 : 1.0;
    const rawFD = Math.min(feedbackCount * 5, 100) * arrTierMultiplier;
    const featureDemandScore = Math.min(Math.round(rawFD), 100);

    // ── Support Intensity Score ──────────────────────────────────────────────
    // Based on open/pending ticket count
    const openTickets = tickets.filter(
      (t) => t.status === 'OPEN' || t.status === 'PENDING',
    ).length;
    const totalTickets = tickets.length;
    const rawSI = Math.min(openTickets * 15 + totalTickets * 3, 100);
    const supportIntensityScore = Math.min(Math.round(rawSI), 100);

    // ── CIQ Influence Score ──────────────────────────────────────────────────
    // Composite: ARR weight (40%) + feedback demand (30%) + deal pipeline (20%) + signals (10%)
    const arrScore = Math.min((arr / 200_000) * 100, 100); // normalise to $200K max
    const openDealValue = deals
      .filter((d) => d.status === 'OPEN')
      .reduce((s, d) => s + d.annualValue, 0);
    const dealScore = Math.min((openDealValue / 500_000) * 100, 100);
    const signalScore = Math.min(signals.length * 4, 100);
    const ciqInfluenceScore = Math.round(
      arrScore * 0.4 +
        featureDemandScore * 0.3 +
        dealScore * 0.2 +
        signalScore * 0.1,
    );

    // ── Health Score ─────────────────────────────────────────────────────────
    // Composite: lifecycle (40%) + churn risk inverse (40%) + activity recency (20%)
    const lifecycleScoreMap: Record<string, number> = {
      LEAD: 30,
      PROSPECT: 50,
      ACTIVE: 80,
      EXPANDING: 95,
      AT_RISK: 20,
      CHURNED: 0,
    };
    const lifecycleScore = lifecycleScoreMap[customer.lifecycleStage] ?? 50;
    const churnRiskInverse = 100 - Math.min(customer.churnRisk ?? 0, 100);

    // Recency: days since last activity (feedback, signal, deal update)
    const allDates: Date[] = [
      ...feedbacks.map((f) => f.submittedAt ?? f.createdAt),
      ...signals.map((s) => s.createdAt),
      ...deals.map((d) => d.updatedAt),
    ];
    const lastDate =
      allDates.length > 0
        ? new Date(Math.max(...allDates.map((d) => d.getTime())))
        : null;
    const daysSinceLast = lastDate
      ? (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
      : 365;
    const recencyScore = Math.max(0, 100 - daysSinceLast * 2); // -2 pts per day, floor 0

    const healthScore = Math.round(
      lifecycleScore * 0.4 + churnRiskInverse * 0.4 + recencyScore * 0.2,
    );

    return {
      ciqInfluenceScore: Math.min(ciqInfluenceScore, 100),
      featureDemandScore,
      supportIntensityScore,
      healthScore: Math.min(healthScore, 100),
      lastActivityAt: lastDate,
    };
  }
}

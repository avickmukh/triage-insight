import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';
import { Prisma } from '@prisma/client';
import {
  CUSTOMER_REVENUE_SIGNAL_QUEUE,
  type CustomerRevenueSignalJobPayload,
} from './processors/customer-revenue-signal.processor';
import {
  CUSTOMER_SIGNAL_AGGREGATION_QUEUE,
  type CustomerSignalAggregationJobPayload,
} from './processors/customer-signal-aggregation.processor';

type CustomerSortField =
  | 'createdAt'
  | 'updatedAt'
  | 'arrValue'
  | 'name'
  | 'ciqInfluenceScore'
  | 'healthScore';

@Injectable()
export class CustomerService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(CUSTOMER_REVENUE_SIGNAL_QUEUE)
    private readonly revenueSignalQueue: Queue<CustomerRevenueSignalJobPayload>,
    @InjectQueue(CUSTOMER_SIGNAL_AGGREGATION_QUEUE)
    private readonly signalAggregationQueue: Queue<CustomerSignalAggregationJobPayload>,
  ) {}

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(workspaceId: string, dto: CreateCustomerDto) {
    const customer = await this.prisma.customer.create({
      data: { workspaceId, ...dto },
    });
    // Enqueue workspace-wide revenue recomputation so new customer ARR is reflected
    await this.revenueSignalQueue
      .add(
        { type: 'RECOMPUTE_WORKSPACE', workspaceId },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          delay: 5000,
        },
      )
      .catch(() => {
        /* non-critical */
      });
    // Enqueue signal aggregation for the new customer
    await this.signalAggregationQueue
      .add(
        { type: 'AGGREGATE_CUSTOMER', workspaceId, customerId: customer.id },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          delay: 3000,
        },
      )
      .catch(() => {
        /* non-critical */
      });
    return customer;
  }

  // ─── List (paginated, filterable) ─────────────────────────────────────────

  async findAll(workspaceId: string, query: QueryCustomerDto) {
    const {
      search,
      segment,
      accountPriority,
      lifecycleStage,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 50,
    } = query;

    const allowedSort: CustomerSortField[] = [
      'createdAt',
      'updatedAt',
      'arrValue',
      'name',
      'ciqInfluenceScore',
      'healthScore',
    ];
    const resolvedSort: CustomerSortField = allowedSort.includes(
      sortBy as CustomerSortField,
    )
      ? (sortBy as CustomerSortField)
      : 'createdAt';

    const where: Prisma.CustomerWhereInput = {
      workspaceId,
      segment,
      accountPriority,
      lifecycleStage,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { companyName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: { [resolvedSort]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: {
            select: { feedbacks: true, deals: true, signals: true },
          },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // ─── Single customer with full intelligence ────────────────────────────────

  async findOne(workspaceId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, workspaceId },
      include: {
        _count: {
          select: { feedbacks: true, deals: true, signals: true },
        },
        feedbacks: {
          where: { mergedIntoId: null },
          orderBy: { createdAt: 'desc' },
          take: 20,
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
            themes: {
              select: {
                theme: {
                  select: {
                    id: true,
                    title: true,
                    status: true,
                    priorityScore: true,
                    revenueInfluence: true,
                  },
                },
              },
            },
          },
        },
        deals: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            themeLinks: {
              include: {
                theme: { select: { id: true, title: true, status: true } },
              },
            },
          },
        },
        signals: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            signalType: true,
            strength: true,
            createdAt: true,
            themeId: true,
          },
        },
      },
    });

    if (!customer) throw new NotFoundException('Customer not found');

    // Revenue intelligence summary
    const openDealValue = customer.deals
      .filter((d) => d.status === 'OPEN')
      .reduce((sum, d) => sum + d.annualValue, 0);

    const totalDealValue = customer.deals.reduce(
      (sum, d) => sum + d.annualValue,
      0,
    );

    // Unique themes influenced by this customer's feedback
    const influencedThemeIds = new Set<string>();
    const influencedThemes: Array<{
      id: string;
      title: string;
      status: string;
      priorityScore: number | null;
      revenueInfluence: number | null;
    }> = [];

    for (const fb of customer.feedbacks) {
      for (const tf of fb.themes) {
        if (!influencedThemeIds.has(tf.theme.id)) {
          influencedThemeIds.add(tf.theme.id);
          influencedThemes.push({
            id: tf.theme.id,
            title: tf.theme.title,
            status: tf.theme.status,
            priorityScore: tf.theme.priorityScore ?? null,
            revenueInfluence: tf.theme.revenueInfluence ?? null,
          });
        }
      }
    }

    // Roadmap items linked to those themes
    const roadmapItems =
      influencedThemeIds.size > 0
        ? await this.prisma.roadmapItem.findMany({
            where: {
              workspaceId,
              themeId: { in: Array.from(influencedThemeIds) },
            },
            select: {
              id: true,
              title: true,
              status: true,
              priorityScore: true,
              confidenceScore: true,
              isPublic: true,
              targetQuarter: true,
              targetYear: true,
            },
          })
        : [];

    return {
      ...customer,
      revenueIntelligence: {
        arrValue: customer.arrValue ?? 0,
        mrrValue: customer.mrrValue ?? 0,
        openDealValue,
        totalDealValue,
        feedbackCount: customer._count.feedbacks,
        dealCount: customer._count.deals,
        signalCount: customer._count.signals,
        influencedThemeCount: influencedThemeIds.size,
        influencedRoadmapCount: roadmapItems.length,
      },
      influencedThemes,
      influencedRoadmapItems: roadmapItems,
    };
  }

  // ─── Customer signals breakdown ────────────────────────────────────────────

  async getSignals(workspaceId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, workspaceId },
      select: {
        id: true,
        name: true,
        ciqInfluenceScore: true,
        featureDemandScore: true,
        supportIntensityScore: true,
        healthScore: true,
        lastActivityAt: true,
        churnRisk: true,
        signals: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            signalType: true,
            strength: true,
            createdAt: true,
            themeId: true,
            theme: { select: { id: true, title: true } },
          },
        },
        feedbacks: {
          where: { mergedIntoId: null },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            title: true,
            sentiment: true,
            impactScore: true,
            createdAt: true,
          },
        },
      },
    });

    if (!customer) throw new NotFoundException('Customer not found');

    // Sentiment distribution from feedback
    const feedbacks = customer.feedbacks;
    const sentimentValues = feedbacks.map((f) => f.sentiment ?? 0);
    const avgSentiment =
      sentimentValues.length > 0
        ? sentimentValues.reduce((a, b) => a + b, 0) / sentimentValues.length
        : 0;

    const positive = sentimentValues.filter((s) => s >= 0.3).length;
    const negative = sentimentValues.filter((s) => s <= -0.3).length;
    const neutral = sentimentValues.length - positive - negative;

    return {
      customerId: id,
      scores: {
        ciqInfluenceScore: customer.ciqInfluenceScore ?? 0,
        featureDemandScore: customer.featureDemandScore ?? 0,
        supportIntensityScore: customer.supportIntensityScore ?? 0,
        healthScore: customer.healthScore ?? 0,
        churnRisk: customer.churnRisk ?? 0,
      },
      sentiment: {
        avg: avgSentiment,
        positive,
        neutral,
        negative,
        total: feedbacks.length,
      },
      signals: customer.signals,
      lastActivityAt: customer.lastActivityAt,
    };
  }

  // ─── Workspace analytics ───────────────────────────────────────────────────

  async getAnalytics(workspaceId: string) {
    const customers = await this.prisma.customer.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        segment: true,
        arrValue: true,
        lifecycleStage: true,
        churnRisk: true,
        ciqInfluenceScore: true,
        featureDemandScore: true,
        supportIntensityScore: true,
        healthScore: true,
        _count: { select: { feedbacks: true, deals: true } },
      },
    });

    // ── Segment breakdown ────────────────────────────────────────────────────
    const segmentMap: Record<
      string,
      { count: number; totalARR: number; avgCIQ: number; ciqSum: number }
    > = {};
    for (const c of customers) {
      const seg = c.segment ?? 'UNKNOWN';
      if (!segmentMap[seg])
        segmentMap[seg] = { count: 0, totalARR: 0, avgCIQ: 0, ciqSum: 0 };
      segmentMap[seg].count++;
      segmentMap[seg].totalARR += c.arrValue ?? 0;
      segmentMap[seg].ciqSum += c.ciqInfluenceScore ?? 0;
    }
    const segmentBreakdown = Object.entries(segmentMap).map(([segment, v]) => ({
      segment,
      count: v.count,
      totalARR: v.totalARR,
      avgCIQ: v.count > 0 ? Math.round(v.ciqSum / v.count) : 0,
    }));

    // ── Lifecycle distribution ───────────────────────────────────────────────
    const lifecycleMap: Record<string, number> = {};
    for (const c of customers) {
      lifecycleMap[c.lifecycleStage] =
        (lifecycleMap[c.lifecycleStage] ?? 0) + 1;
    }

    // ── ARR-weighted feature demand ──────────────────────────────────────────
    const arrWeightedDemand = customers
      .filter((c) => (c.featureDemandScore ?? 0) > 0)
      .sort(
        (a, b) =>
          (b.featureDemandScore ?? 0) * (b.arrValue ?? 0) -
          (a.featureDemandScore ?? 0) * (a.arrValue ?? 0),
      )
      .slice(0, 10)
      .map((c) => ({
        customerId: c.id,
        name: c.name,
        arrValue: c.arrValue ?? 0,
        featureDemandScore: c.featureDemandScore ?? 0,
        weightedScore: Math.round(
          (c.featureDemandScore ?? 0) * ((c.arrValue ?? 0) / 10_000),
        ),
      }));

    // ── Churn risk distribution ──────────────────────────────────────────────
    const churnBuckets = { low: 0, medium: 0, high: 0, critical: 0 };
    let atRiskARR = 0;
    for (const c of customers) {
      const risk = c.churnRisk ?? 0;
      if (risk >= 75) {
        churnBuckets.critical++;
        atRiskARR += c.arrValue ?? 0;
      } else if (risk >= 50) {
        churnBuckets.high++;
        atRiskARR += c.arrValue ?? 0;
      } else if (risk >= 25) churnBuckets.medium++;
      else churnBuckets.low++;
    }

    // ── Top customers by CIQ influence ──────────────────────────────────────
    const topByCIQ = customers
      .sort((a, b) => (b.ciqInfluenceScore ?? 0) - (a.ciqInfluenceScore ?? 0))
      .slice(0, 10)
      .map((c) => ({
        id: c.id,
        name: c.name,
        segment: c.segment,
        arrValue: c.arrValue ?? 0,
        ciqInfluenceScore: c.ciqInfluenceScore ?? 0,
        healthScore: c.healthScore ?? 0,
        lifecycleStage: c.lifecycleStage,
        feedbackCount: c._count.feedbacks,
      }));

    return {
      totalCustomers: customers.length,
      totalARR: customers.reduce((s, c) => s + (c.arrValue ?? 0), 0),
      atRiskARR,
      segmentBreakdown,
      lifecycleDistribution: lifecycleMap,
      arrWeightedDemand,
      churnRiskDistribution: churnBuckets,
      topByCIQ,
    };
  }

  // ─── Trigger signal re-aggregation ────────────────────────────────────────

  async triggerAggregation(workspaceId: string, customerId?: string) {
    if (customerId) {
      try {
        await this.signalAggregationQueue.add(
          { type: 'AGGREGATE_CUSTOMER', workspaceId, customerId },
          { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
        );
      } catch (queueErr) {
        console.warn(
          '[Queue] Redis unavailable — job skipped:',
          (queueErr as Error).message,
        );
      }
      return { queued: true, scope: 'customer', customerId };
    }
    try {
      await this.signalAggregationQueue.add(
        { type: 'AGGREGATE_WORKSPACE', workspaceId },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      );
    } catch (queueErr) {
      console.warn(
        '[Queue] Redis unavailable — job skipped:',
        (queueErr as Error).message,
      );
    }
    return { queued: true, scope: 'workspace' };
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(workspaceId: string, id: string, dto: UpdateCustomerDto) {
    await this.findOne(workspaceId, id);
    const customer = await this.prisma.customer.update({
      where: { id },
      data: dto,
    });
    // If ARR/MRR changed, recompute revenue influence for all themes in workspace
    if (dto.arrValue !== undefined || dto.mrrValue !== undefined) {
      await this.revenueSignalQueue
        .add(
          { type: 'RECOMPUTE_WORKSPACE', workspaceId },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            delay: 3000,
          },
        )
        .catch(() => {
          /* non-critical */
        });
    }
    // Re-aggregate this customer's signals
    await this.signalAggregationQueue
      .add(
        { type: 'AGGREGATE_CUSTOMER', workspaceId, customerId: id },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          delay: 2000,
        },
      )
      .catch(() => {
        /* non-critical */
      });
    return customer;
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async remove(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id);
    await this.prisma.customer.delete({ where: { id } });
    return { success: true };
  }

  // ─── Revenue summary for workspace ────────────────────────────────────────

  async getRevenueSummary(workspaceId: string) {
    const [customers, openDeals] = await this.prisma.$transaction([
      this.prisma.customer.aggregate({
        where: { workspaceId },
        _sum: { arrValue: true },
        _count: { id: true },
      }),
      this.prisma.deal.aggregate({
        where: { workspaceId, status: 'OPEN' },
        _sum: { annualValue: true },
        _count: { id: true },
      }),
    ]);

    return {
      totalCustomers: customers._count.id,
      totalARR: customers._sum.arrValue ?? 0,
      openDealCount: openDeals._count.id,
      openDealValue: openDeals._sum.annualValue ?? 0,
    };
  }
}

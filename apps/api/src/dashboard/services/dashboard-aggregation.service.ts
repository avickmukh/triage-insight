/**
 * DashboardAggregationService
 *
 * Aggregates data from Feedback, Theme, Customer, RoadmapItem, SupportTicket,
 * IssueSpikeEvent, CustomerSignal, and CIQ engine to power the 5 executive
 * dashboard intelligence surfaces.
 *
 * All methods are workspace-scoped and return typed output interfaces.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ThemeStatus, RoadmapStatus, AccountPriority } from '@prisma/client';

// ─── Output interfaces ────────────────────────────────────────────────────────

export interface ProductDirectionSummary {
  topFeatures: {
    feedbackId: string;
    title: string;
    ciqScore: number;
    confidenceScore: number;
    revenueInfluence: number;
    voteCount: number;
    themeTitle: string | null;
    rationale: string;
  }[];
  totalFeedbackCount: number;
  scoredFeedbackCount: number;
  lastComputedAt: string;
}

export interface EmergingThemeRadar {
  emergingThemes: {
    themeId: string;
    title: string;
    velocityScore: number;
    feedbackDelta7d: number;
    feedbackDelta30d: number;
    totalFeedback: number;
    isNew: boolean;
    urgencyScore: number;
    signal: string;
    // Stage-2 AI Narration fields
    aiSummary: string | null;
    aiExplanation: string | null;
    aiRecommendation: string | null;
    aiConfidence: number | null;
  }[];
  spikeEvents: {
    clusterId: string;
    clusterTitle: string;
    ticketCount: number;
    zScore: number;
    windowStart: string;
  }[];
  totalActiveThemes: number;
}

export interface RevenueRiskIndicator {
  totalArrAtRisk: number;
  criticalCustomers: {
    customerId: string;
    name: string;
    arrValue: number;
    churnRisk: number;
    topFeatureRequest: string | null;
    accountPriority: string;
    signalCount: number;
  }[];
  featuresLinkedToChurn: {
    feedbackId: string;
    title: string;
    churnLinkedArr: number;
    customerCount: number;
    urgencySignal: number;
  }[];
  arrExposureBySegment: {
    segment: string;
    arrAtRisk: number;
    customerCount: number;
  }[];
  totalCustomersAtRisk: number;
}

export interface VoiceSentimentSignal {
  overallSentimentScore: number;
  sentimentTrend: 'improving' | 'declining' | 'stable';
  negativeTrendIndicator: boolean;
  unresolvedPainSummary: string;
  sentimentByTheme: {
    themeId: string;
    title: string;
    avgSentiment: number;
    negativeFraction: number;
    feedbackCount: number;
  }[];
  recentNegativeSignals: {
    feedbackId: string;
    title: string;
    sentiment: number;
    urgency: number;
    customerName: string | null;
    createdAt: string;
  }[];
  voiceCallCount: number;
  negativeFraction: number;
}

export interface SupportPressureIndicator {
  openTicketCount: number;
  ticketTrend: 'increasing' | 'stable' | 'decreasing';
  ticketDelta7d: number;
  activeSpikeCount: number;
  topPressureClusters: {
    clusterId: string;
    title: string;
    ticketCount: number;
    arrExposure: number;
    themeTitle: string | null;
    isSpike: boolean;
  }[];
  estimatedArrAtRisk: number;
}

export interface RoadmapHealthPanel {
  shippedCount: number;
  plannedCount: number;
  committedCount: number;
  backlogCount: number;
  shippedRatio: number;
  delayedCriticalItems: {
    roadmapItemId: string;
    title: string;
    status: string;
    themeTitle: string | null;
    priorityScore: number;
    daysInStatus: number;
    recommendation: string;
  }[];
  opportunityGaps: {
    themeId: string;
    title: string;
    priorityScore: number;
    revenueScore: number;
    hasRoadmapItem: boolean;
    gap: string;
  }[];
  healthScore: number;
  healthLabel: 'healthy' | 'at_risk' | 'critical';
}

export interface ExecutiveSummary {
  generatedAt: string;
  weekSummary: string;
  keyInsights: string[];
  topAction: string;
  riskAlert: string | null;
  momentumSignal: string;
  productDirectionNote: string;
}

export interface ExecutiveDashboard {
  productDirection: ProductDirectionSummary;
  emergingThemes: EmergingThemeRadar;
  revenueRisk: RevenueRiskIndicator;
  voiceSentiment: VoiceSentimentSignal;
  supportPressure: SupportPressureIndicator;
  roadmapHealth: RoadmapHealthPanel;
  executiveSummary: ExecutiveSummary;
  refreshedAt: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────
@Injectable()
export class DashboardAggregationService {
  private readonly logger = new Logger(DashboardAggregationService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── 1. Product Direction Summary ─────────────────────────────────────────
  async getProductDirection(
    workspaceId: string,
  ): Promise<ProductDirectionSummary> {
    const [feedbacks, totalCount] = await Promise.all([
      this.prisma.feedback.findMany({
        where: { workspaceId, status: { not: 'MERGED' }, ciqScore: { gt: 0 } },
        select: {
          id: true,
          title: true,
          ciqScore: true,
          urgencySignal: true,
          voteVelocity: true,
          sentiment: true,
          createdAt: true,
          customer: {
            select: { arrValue: true, accountPriority: true, churnRisk: true },
          },
          votes: { select: { id: true } },
          themes: {
            select: {
              theme: {
                select: { id: true, title: true, revenueInfluence: true },
              },
            },
            take: 1,
          },
          mergedFrom: { select: { id: true } },
        },
        orderBy: { ciqScore: { sort: 'desc', nulls: 'last' } },
        take: 20,
      }),
      this.prisma.feedback.count({
        where: { workspaceId, status: { not: 'MERGED' } },
      }),
    ]);

    const scoredCount = feedbacks.length;
    const top3 = feedbacks.slice(0, 3).map((fb) => {
      const ciqScore = parseFloat((fb.ciqScore ?? 0).toFixed(1));
      const voteCount = fb.votes.length + fb.mergedFrom.length;
      const arrValue = fb.customer?.arrValue ?? 0;
      const firstTheme = fb.themes[0]?.theme ?? null;
      const revenueInfluence = firstTheme?.revenueInfluence ?? arrValue;

      // Confidence: based on vote count, cluster size, and ciqScore
      const confidenceScore = Math.min(
        100,
        Math.round(
          (Math.min(voteCount, 20) / 20) * 40 +
            (ciqScore / 100) * 40 +
            (fb.mergedFrom.length > 0 ? 20 : 0),
        ),
      );

      const rationale = this.buildFeatureRationale(
        fb,
        voteCount,
        arrValue,
        ciqScore,
      );

      return {
        feedbackId: fb.id,
        title: fb.title,
        ciqScore,
        confidenceScore,
        revenueInfluence: parseFloat(revenueInfluence.toFixed(0)),
        voteCount,
        themeTitle: firstTheme?.title ?? null,
        rationale,
      };
    });

    return {
      topFeatures: top3,
      totalFeedbackCount: totalCount,
      scoredFeedbackCount: scoredCount,
      lastComputedAt: new Date().toISOString(),
    };
  }

  private buildFeatureRationale(
    fb: {
      ciqScore: number | null;
      urgencySignal: number | null;
      sentiment: number | null;
      customer?: { churnRisk: number | null } | null;
    },
    voteCount: number,
    arrValue: number,
    ciqScore: number,
  ): string {
    const parts: string[] = [];
    if (voteCount >= 5) parts.push(`${voteCount} votes`);
    if (arrValue > 10000) parts.push(`$${Math.round(arrValue / 1000)}k ARR`);
    if ((fb.urgencySignal ?? 0) > 0.5) parts.push('high urgency');
    if ((fb.sentiment ?? 0) < -0.3) parts.push('negative sentiment');
    if ((fb.customer?.churnRisk ?? 0) > 0.6) parts.push('churn risk');
    if (ciqScore >= 70) parts.push('top CIQ score');
    return parts.length > 0
      ? `Driven by ${parts.join(', ')}.`
      : 'Emerging demand signal.';
  }

  // ─── 2. Emerging Theme Radar ───────────────────────────────────────────────
  async getEmergingThemes(workspaceId: string): Promise<EmergingThemeRadar> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [themes, spikeEvents, totalActive] = await Promise.all([
      this.prisma.theme.findMany({
        where: { workspaceId, status: { not: ThemeStatus.ARCHIVED } },
        select: {
          id: true,
          title: true,
          urgencyScore: true,
          ciqScore: true,
          createdAt: true,
          aiSummary: true,
          aiExplanation: true,
          aiRecommendation: true,
          aiConfidence: true,
          feedbacks: {
            select: {
              feedback: { select: { createdAt: true, ciqScore: true } },
            },
          },
        },
        orderBy: { ciqScore: { sort: 'desc', nulls: 'last' } },
        take: 50,
      }),
      this.prisma.issueSpikeEvent.findMany({
        where: { workspaceId, windowStart: { gte: sevenDaysAgo } },
        select: {
          id: true,
          ticketCount: true,
          zScore: true,
          windowStart: true,
          cluster: { select: { id: true, title: true } },
        },
        orderBy: { zScore: 'desc' },
        take: 10,
      }),
      this.prisma.theme.count({
        where: { workspaceId, status: { not: ThemeStatus.ARCHIVED } },
      }),
    ]);

    const emerging = themes
      .map((t) => {
        const allFeedback = t.feedbacks.map((tf) => tf.feedback);
        const recent7d = allFeedback.filter(
          (f) => f.createdAt >= sevenDaysAgo,
        ).length;
        const recent30d = allFeedback.filter(
          (f) => f.createdAt >= thirtyDaysAgo,
        ).length;
        const prev30d = allFeedback.filter(
          (f) => f.createdAt >= ninetyDaysAgo && f.createdAt < thirtyDaysAgo,
        ).length;
        const delta7d = recent7d;
        const delta30d = recent30d - prev30d;
        const isNew = t.createdAt >= thirtyDaysAgo;

        // Velocity: weighted by recency and volume
        const velocityScore = Math.min(
          100,
          Math.round(
            delta7d * 10 +
              (delta30d > 0 ? Math.min(delta30d * 3, 40) : 0) +
              (isNew ? 20 : 0),
          ),
        );

        let signal = 'Steady demand';
        if (isNew && recent7d > 0) signal = 'New theme with early traction';
        else if (delta7d >= 5) signal = 'Rapid acceleration this week';
        else if (delta30d >= 10) signal = 'Strong monthly growth';
        else if ((t.urgencyScore ?? 0) > 60) signal = 'High urgency signal';

        return {
          themeId: t.id,
          title: t.title,
          velocityScore,
          feedbackDelta7d: delta7d,
          feedbackDelta30d: delta30d,
          totalFeedback: allFeedback.length,
          isNew,
          urgencyScore: parseFloat((t.urgencyScore ?? 0).toFixed(1)),
          signal,
          aiSummary: t.aiSummary ?? null,
          aiExplanation: t.aiExplanation ?? null,
          aiRecommendation: t.aiRecommendation ?? null,
          aiConfidence: t.aiConfidence ?? null,
        };
      })
      .filter((t) => t.velocityScore > 0 || t.isNew)
      .sort((a, b) => b.velocityScore - a.velocityScore)
      .slice(0, 8);

    const spikes = spikeEvents.map((s) => ({
      clusterId: s.cluster.id,
      clusterTitle: s.cluster.title,
      ticketCount: s.ticketCount,
      zScore: parseFloat(s.zScore.toFixed(2)),
      windowStart: s.windowStart.toISOString(),
    }));

    return {
      emergingThemes: emerging,
      spikeEvents: spikes,
      totalActiveThemes: totalActive,
    };
  }

  // ─── 3. Revenue Risk Indicator ─────────────────────────────────────────────
  async getRevenueRisk(workspaceId: string): Promise<RevenueRiskIndicator> {
    const [atRiskCustomers, churnLinkedFeedback, segments] = await Promise.all([
      this.prisma.customer.findMany({
        where: { workspaceId, churnRisk: { gte: 0.5 } },
        select: {
          id: true,
          name: true,
          arrValue: true,
          churnRisk: true,
          accountPriority: true,
          segment: true,
          feedbacks: {
            select: { title: true, ciqScore: true },
            orderBy: { ciqScore: { sort: 'desc', nulls: 'last' } },
            take: 1,
          },
          signals: { select: { id: true } },
        },
        orderBy: [
          { churnRisk: 'desc' },
          { arrValue: { sort: 'desc', nulls: 'last' } },
        ],
        take: 20,
      }),
      this.prisma.feedback.findMany({
        where: {
          workspaceId,
          urgencySignal: { gte: 0.4 },
          status: { not: 'MERGED' },
        },
        select: {
          id: true,
          title: true,
          urgencySignal: true,
          customer: {
            select: { arrValue: true, churnRisk: true, segment: true },
          },
          themes: { select: { theme: { select: { id: true } } } },
        },
        orderBy: { urgencySignal: { sort: 'desc', nulls: 'last' } },
        take: 30,
      }),
      this.prisma.customer.groupBy({
        by: ['segment'],
        where: { workspaceId, churnRisk: { gte: 0.5 } },
        _sum: { arrValue: true },
        _count: { id: true },
      }),
    ]);

    const totalArrAtRisk = atRiskCustomers.reduce(
      (s, c) => s + (c.arrValue ?? 0),
      0,
    );

    const critical = atRiskCustomers.slice(0, 10).map((c) => ({
      customerId: c.id,
      name: c.name,
      arrValue: c.arrValue ?? 0,
      churnRisk: parseFloat((c.churnRisk ?? 0).toFixed(2)),
      topFeatureRequest: c.feedbacks[0]?.title ?? null,
      accountPriority: c.accountPriority ?? AccountPriority.MEDIUM,
      signalCount: c.signals.length,
    }));

    // Group churn-linked feedback by customer ARR
    const churnLinked = churnLinkedFeedback
      .filter((fb) => (fb.customer?.churnRisk ?? 0) >= 0.5)
      .slice(0, 8)
      .map((fb) => ({
        feedbackId: fb.id,
        title: fb.title,
        churnLinkedArr: fb.customer?.arrValue ?? 0,
        customerCount: 1,
        urgencySignal: parseFloat((fb.urgencySignal ?? 0).toFixed(2)),
      }));

    const arrBySegment = segments.map((s) => ({
      segment: s.segment ?? 'Unknown',
      arrAtRisk: s._sum.arrValue ?? 0,
      customerCount: s._count.id,
    }));

    return {
      totalArrAtRisk: parseFloat(totalArrAtRisk.toFixed(0)),
      criticalCustomers: critical,
      featuresLinkedToChurn: churnLinked,
      arrExposureBySegment: arrBySegment,
      totalCustomersAtRisk: atRiskCustomers.length,
    };
  }

  // ─── 4. Voice Sentiment Signal ─────────────────────────────────────────────
  async getVoiceSentiment(workspaceId: string): Promise<VoiceSentimentSignal> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const [recentFeedback, prevFeedback, themes, voiceCount] =
      await Promise.all([
        this.prisma.feedback.findMany({
          where: {
            workspaceId,
            sentiment: { not: null },
            createdAt: { gte: thirtyDaysAgo },
          },
          select: {
            id: true,
            title: true,
            sentiment: true,
            urgencySignal: true,
            createdAt: true,
            customer: { select: { name: true } },
          },
          orderBy: { sentiment: 'asc' },
          take: 100,
        }),
        this.prisma.feedback.findMany({
          where: {
            workspaceId,
            sentiment: { not: null },
            createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
          },
          select: { sentiment: true },
        }),
        this.prisma.theme.findMany({
          where: { workspaceId, status: { not: ThemeStatus.ARCHIVED } },
          select: {
            id: true,
            title: true,
            feedbacks: {
              select: { feedback: { select: { sentiment: true } } },
            },
          },
          take: 20,
        }),
        this.prisma.uploadAsset.count({ where: { workspaceId } }),
      ]);

    const avgRecent =
      recentFeedback.length > 0
        ? recentFeedback.reduce((s, f) => s + (f.sentiment ?? 0), 0) /
          recentFeedback.length
        : 0;
    const avgPrev =
      prevFeedback.length > 0
        ? prevFeedback.reduce((s, f) => s + (f.sentiment ?? 0), 0) /
          prevFeedback.length
        : 0;

    const sentimentTrend: VoiceSentimentSignal['sentimentTrend'] =
      avgRecent > avgPrev + 0.05
        ? 'improving'
        : avgRecent < avgPrev - 0.05
          ? 'declining'
          : 'stable';

    const negativeFraction =
      recentFeedback.length > 0
        ? recentFeedback.filter((f) => (f.sentiment ?? 0) < -0.2).length /
          recentFeedback.length
        : 0;

    const negativeTrend =
      negativeFraction > 0.3 || sentimentTrend === 'declining';

    // Build unresolved pain summary
    const topNegative = recentFeedback
      .filter((f) => (f.sentiment ?? 0) < -0.3)
      .slice(0, 3);
    const unresolvedPain =
      topNegative.length > 0
        ? `${topNegative.length} high-urgency negative signals detected. Key themes: ${topNegative.map((f) => f.title).join('; ')}.`
        : 'No critical negative signals in the last 30 days.';

    const sentimentByTheme = themes
      .map((t) => {
        const sentiments = t.feedbacks
          .map((tf) => tf.feedback.sentiment)
          .filter((s): s is number => s !== null);
        if (sentiments.length === 0) return null;
        const avg = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
        const negFrac =
          sentiments.filter((s) => s < -0.2).length / sentiments.length;
        return {
          themeId: t.id,
          title: t.title,
          avgSentiment: parseFloat(avg.toFixed(2)),
          negativeFraction: parseFloat(negFrac.toFixed(2)),
          feedbackCount: sentiments.length,
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .sort((a, b) => a.avgSentiment - b.avgSentiment)
      .slice(0, 6);

    const recentNegative = recentFeedback
      .filter((f) => (f.sentiment ?? 0) < -0.2)
      .slice(0, 5)
      .map((f) => ({
        feedbackId: f.id,
        title: f.title,
        sentiment: parseFloat((f.sentiment ?? 0).toFixed(2)),
        urgency: parseFloat((f.urgencySignal ?? 0).toFixed(2)),
        customerName: f.customer?.name ?? null,
        createdAt: f.createdAt.toISOString(),
      }));

    return {
      overallSentimentScore: parseFloat(((avgRecent + 1) * 50).toFixed(1)),
      sentimentTrend,
      negativeTrendIndicator: negativeTrend,
      unresolvedPainSummary: unresolvedPain,
      sentimentByTheme,
      recentNegativeSignals: recentNegative,
      voiceCallCount: voiceCount,
      negativeFraction: parseFloat(negativeFraction.toFixed(2)),
    };
  }

  // ─── 5. Support Pressure Indicator ────────────────────────────────────────
  async getSupportPressure(
    workspaceId: string,
  ): Promise<SupportPressureIndicator> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const [openTickets, recent7d, prev7d, clusters, spikeEvents] =
      await Promise.all([
        this.prisma.supportTicket.count({
          where: { workspaceId, status: 'OPEN' },
        }),
        this.prisma.supportTicket.count({
          where: { workspaceId, createdAt: { gte: sevenDaysAgo } },
        }),
        this.prisma.supportTicket.count({
          where: {
            workspaceId,
            createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
          },
        }),
        this.prisma.supportIssueCluster.findMany({
          where: { workspaceId },
          select: {
            id: true,
            title: true,
            ticketCount: true,
            arrExposure: true,
            theme: { select: { title: true } },
            spikeEvents: { select: { id: true }, take: 1 },
          },
          orderBy: [{ arrExposure: 'desc' }, { ticketCount: 'desc' }],
          take: 8,
        }),
        this.prisma.issueSpikeEvent.count({
          where: { workspaceId, windowStart: { gte: sevenDaysAgo } },
        }),
      ]);

    const delta7d = recent7d - prev7d;
    const trend: SupportPressureIndicator['ticketTrend'] =
      delta7d > 3 ? 'increasing' : delta7d < -3 ? 'decreasing' : 'stable';

    const topClusters = clusters.map((c) => ({
      clusterId: c.id,
      title: c.title,
      ticketCount: c.ticketCount,
      arrExposure: c.arrExposure,
      themeTitle: c.theme?.title ?? null,
      isSpike: c.spikeEvents.length > 0,
    }));

    const estimatedArrAtRisk = clusters.reduce((s, c) => s + c.arrExposure, 0);

    return {
      openTicketCount: openTickets,
      ticketTrend: trend,
      ticketDelta7d: delta7d,
      activeSpikeCount: spikeEvents,
      topPressureClusters: topClusters,
      estimatedArrAtRisk: parseFloat(estimatedArrAtRisk.toFixed(0)),
    };
  }

  // ─── 6. Roadmap Health Panel ───────────────────────────────────────────────
  async getRoadmapHealth(workspaceId: string): Promise<RoadmapHealthPanel> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [roadmapItems, highPriorityThemes] = await Promise.all([
      this.prisma.roadmapItem.findMany({
        where: { workspaceId },
        select: {
          id: true,
          title: true,
          status: true,
          updatedAt: true,
          createdAt: true,
          theme: {
            select: {
              id: true,
              title: true,
              priorityScore: true,
              revenueScore: true,
            },
          },
          priorityScore: true,
        },
        orderBy: { priorityScore: { sort: 'desc', nulls: 'last' } },
      }),
      this.prisma.theme.findMany({
        where: {
          workspaceId,
          status: { not: ThemeStatus.ARCHIVED },
          priorityScore: { gte: 0.5 },
        },
        select: {
          id: true,
          title: true,
          priorityScore: true,
          revenueScore: true,
          roadmapItems: { select: { id: true }, take: 1 },
        },
        orderBy: { priorityScore: { sort: 'desc', nulls: 'last' } },
        take: 20,
      }),
    ]);

    const counts = {
      [RoadmapStatus.SHIPPED]: 0,
      [RoadmapStatus.PLANNED]: 0,
      [RoadmapStatus.COMMITTED]: 0,
      [RoadmapStatus.BACKLOG]: 0,
      [RoadmapStatus.EXPLORING]: 0,
    };
    for (const item of roadmapItems) {
      counts[item.status] = (counts[item.status] ?? 0) + 1;
    }

    const total = roadmapItems.length;
    const shippedRatio =
      total > 0
        ? parseFloat((counts[RoadmapStatus.SHIPPED] / total).toFixed(2))
        : 0;

    // Delayed critical items: PLANNED or COMMITTED items not updated in 30+ days with high priority
    const delayed = roadmapItems
      .filter(
        (r) =>
          (r.status === RoadmapStatus.PLANNED ||
            r.status === RoadmapStatus.COMMITTED) &&
          r.updatedAt < thirtyDaysAgo &&
          (r.priorityScore ?? 0) > 0.5,
      )
      .slice(0, 5)
      .map((r) => ({
        roadmapItemId: r.id,
        title: r.title,
        status: r.status,
        themeTitle: r.theme?.title ?? null,
        priorityScore: parseFloat(((r.priorityScore ?? 0) * 100).toFixed(1)),
        daysInStatus: Math.floor(
          (Date.now() - r.updatedAt.getTime()) / (1000 * 60 * 60 * 24),
        ),
        recommendation: 'Review and update status or reassign priority.',
      }));

    // Opportunity gaps: high-priority themes with no roadmap item
    const gaps = highPriorityThemes
      .filter((t) => t.roadmapItems.length === 0)
      .slice(0, 5)
      .map((t) => ({
        themeId: t.id,
        title: t.title,
        priorityScore: parseFloat(((t.priorityScore ?? 0) * 100).toFixed(1)),
        revenueScore: parseFloat((t.revenueScore ?? 0).toFixed(1)),
        hasRoadmapItem: false,
        gap: 'High-priority theme with no roadmap commitment.',
      }));

    // Health score: 0–100
    const healthScore = Math.round(
      shippedRatio * 40 +
        (delayed.length === 0 ? 30 : Math.max(0, 30 - delayed.length * 6)) +
        (gaps.length === 0 ? 30 : Math.max(0, 30 - gaps.length * 6)),
    );
    const healthLabel: RoadmapHealthPanel['healthLabel'] =
      healthScore >= 70
        ? 'healthy'
        : healthScore >= 40
          ? 'at_risk'
          : 'critical';

    return {
      shippedCount: counts[RoadmapStatus.SHIPPED],
      plannedCount: counts[RoadmapStatus.PLANNED],
      committedCount: counts[RoadmapStatus.COMMITTED],
      backlogCount: counts[RoadmapStatus.BACKLOG],
      shippedRatio,
      delayedCriticalItems: delayed,
      opportunityGaps: gaps,
      healthScore,
      healthLabel,
    };
  }
}

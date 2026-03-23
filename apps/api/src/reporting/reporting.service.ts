/**
 * ReportingService
 *
 * Aggregates data from Feedback, Theme, RoadmapItem, Customer, Deal, and CIQ
 * scoring outputs to power the enterprise reporting layer.
 *
 * All methods are workspace-scoped and use indexed fields.
 * No new tables are created — all data is derived from existing models.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RoadmapStatus, ThemeStatus, FeedbackSourceType } from '@prisma/client';

// ─── Output interfaces ────────────────────────────────────────────────────────

export interface ThemeTrendPoint {
  themeId: string;
  title: string;
  feedbackCount: number;
  ciqScore: number | null;
  revenueScore: number | null;
  urgencyScore: number | null;
  priorityScore: number | null;
  createdAt: string;
}

export interface ThemeTrendsReport {
  themes: ThemeTrendPoint[];
  totalActiveThemes: number;
  generatedAt: string;
}

export interface PriorityBucket {
  label: string;
  min: number;
  max: number;
  count: number;
  avgCiqScore: number;
  totalFeedback: number;
}

export interface PriorityDistributionReport {
  buckets: PriorityBucket[];
  totalScored: number;
  totalUnscored: number;
  avgCiqScore: number;
  generatedAt: string;
}

export interface RevenueImpactTheme {
  themeId: string;
  title: string;
  revenueInfluence: number;
  revenueScore: number | null;
  ciqScore: number | null;
  feedbackCount: number;
  customerCount: number;
  dealCount: number;
  totalDealValue: number;
}

export interface RevenueImpactReport {
  topThemes: RevenueImpactTheme[];
  totalArrInfluenced: number;
  totalDealValue: number;
  generatedAt: string;
}

export interface RoadmapProgressBucket {
  status: string;
  count: number;
  avgPriorityScore: number | null;
  avgRevenueImpact: number | null;
  totalSignalCount: number;
}

export interface RoadmapProgressReport {
  byStatus: RoadmapProgressBucket[];
  totalItems: number;
  shippedCount: number;
  committedCount: number;
  shippedFraction: number;
  generatedAt: string;
}

export interface FeedbackVolumePoint {
  date: string;
  total: number;
  bySource: Record<string, number>;
}

export interface FeedbackVolumeReport {
  series: FeedbackVolumePoint[];
  totalFeedback: number;
  avgPerDay: number;
  topSource: string | null;
  generatedAt: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ReportingService {
  private readonly logger = new Logger(ReportingService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private dateRange(from?: string, to?: string): { gte?: Date; lte?: Date } {
    const filter: { gte?: Date; lte?: Date } = {};
    if (from) filter.gte = new Date(from);
    if (to) {
      const d = new Date(to);
      d.setHours(23, 59, 59, 999);
      filter.lte = d;
    }
    return filter;
  }

  // ─── 1. Theme Trends ──────────────────────────────────────────────────────

  /**
   * Returns active themes with their CIQ scores and feedback counts.
   * Ordered by priorityScore descending (highest priority first).
   * Optionally filtered by creation date range.
   */
  async getThemeTrends(
    workspaceId: string,
    from?: string,
    to?: string,
    limit = 20,
  ): Promise<ThemeTrendsReport> {
    const dateFilter = this.dateRange(from, to);

    const themes = await this.prisma.theme.findMany({
      where: {
        workspaceId,
        status: ThemeStatus.ACTIVE,
        ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
      },
      select: {
        id: true,
        title: true,
        ciqScore: true,
        revenueScore: true,
        urgencyScore: true,
        priorityScore: true,
        createdAt: true,
        _count: { select: { feedbacks: true } },
      },
      orderBy: { priorityScore: 'desc' },
      take: limit,
    });

    const totalActiveThemes = await this.prisma.theme.count({
      where: { workspaceId, status: ThemeStatus.ACTIVE },
    });

    return {
      themes: themes.map((t) => ({
        themeId: t.id,
        title: t.title,
        feedbackCount: t._count.feedbacks,
        ciqScore: t.ciqScore,
        revenueScore: t.revenueScore,
        urgencyScore: t.urgencyScore,
        priorityScore: t.priorityScore,
        createdAt: t.createdAt.toISOString(),
      })),
      totalActiveThemes,
      generatedAt: new Date().toISOString(),
    };
  }

  // ─── 2. Priority Distribution ─────────────────────────────────────────────

  /**
   * Buckets feedback items by CIQ score into 5 priority tiers.
   * Uses the ciqScore field set by the CIQ scoring pipeline.
   */
  async getPriorityDistribution(
    workspaceId: string,
    from?: string,
    to?: string,
  ): Promise<PriorityDistributionReport> {
    const dateFilter = this.dateRange(from, to);

    const feedbacks = await this.prisma.feedback.findMany({
      where: {
        workspaceId,
        ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
      },
      select: { ciqScore: true },
    });

    const scored = feedbacks.filter((f) => f.ciqScore != null && f.ciqScore > 0);
    const unscored = feedbacks.length - scored.length;

    const bucketDefs = [
      { label: 'Critical (80–100)', min: 80, max: 100 },
      { label: 'High (60–79)',      min: 60, max: 79 },
      { label: 'Medium (40–59)',    min: 40, max: 59 },
      { label: 'Low (20–39)',       min: 20, max: 39 },
      { label: 'Minimal (0–19)',    min: 0,  max: 19 },
    ];

    const buckets: PriorityBucket[] = bucketDefs.map((b) => {
      const items = scored.filter(
        (f) => (f.ciqScore ?? 0) >= b.min && (f.ciqScore ?? 0) <= b.max,
      );
      const avg =
        items.length > 0
          ? items.reduce((s, f) => s + (f.ciqScore ?? 0), 0) / items.length
          : 0;
      return {
        label: b.label,
        min: b.min,
        max: b.max,
        count: items.length,
        avgCiqScore: parseFloat(avg.toFixed(2)),
        totalFeedback: items.length,
      };
    });

    const avgCiqScore =
      scored.length > 0
        ? parseFloat(
            (
              scored.reduce((s, f) => s + (f.ciqScore ?? 0), 0) / scored.length
            ).toFixed(2),
          )
        : 0;

    return {
      buckets,
      totalScored: scored.length,
      totalUnscored: unscored,
      avgCiqScore,
      generatedAt: new Date().toISOString(),
    };
  }

  // ─── 3. Revenue Impact ────────────────────────────────────────────────────

  /**
   * Returns top themes ranked by revenue influence (ARR + deal value).
   * Reads ciqScore, revenueScore, and revenueInfluence from Theme model.
   * Joins DealThemeLink to aggregate deal values per theme.
   */
  async getRevenueImpact(
    workspaceId: string,
    from?: string,
    to?: string,
    limit = 10,
  ): Promise<RevenueImpactReport> {
    const dateFilter = this.dateRange(from, to);

    const themes = await this.prisma.theme.findMany({
      where: {
        workspaceId,
        status: ThemeStatus.ACTIVE,
        ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
      },
      select: {
        id: true,
        title: true,
        revenueInfluence: true,
        revenueScore: true,
        ciqScore: true,
        _count: { select: { feedbacks: true } },
        dealLinks: {
          select: {
            deal: {
              select: {
                annualValue: true,
                customerId: true,
              },
            },
          },
        },
        customerSignals: {
          select: { customerId: true },
          distinct: ['customerId'],
        },
      },
      orderBy: { revenueInfluence: 'desc' },
      take: limit,
    });

    const totalArrInfluenced = themes.reduce(
      (s, t) => s + (t.revenueInfluence ?? 0),
      0,
    );
    const totalDealValue = themes.reduce(
      (s, t) =>
        s + t.dealLinks.reduce((ds, dl) => ds + (dl.deal?.annualValue ?? 0), 0),
      0,
    );

    return {
      topThemes: themes.map((t) => ({
        themeId: t.id,
        title: t.title,
        revenueInfluence: t.revenueInfluence ?? 0,
        revenueScore: t.revenueScore,
        ciqScore: t.ciqScore,
        feedbackCount: t._count.feedbacks,
        customerCount: t.customerSignals.length,
        dealCount: t.dealLinks.length,
        totalDealValue: t.dealLinks.reduce(
          (s, dl) => s + (dl.deal?.annualValue ?? 0),
          0,
        ),
      })),
      totalArrInfluenced,
      totalDealValue,
      generatedAt: new Date().toISOString(),
    };
  }

  // ─── 4. Roadmap Progress ──────────────────────────────────────────────────

  /**
   * Aggregates roadmap items by status, returning counts and average scores.
   * Reads from RoadmapItem model using indexed status field.
   */
  async getRoadmapProgress(
    workspaceId: string,
    from?: string,
    to?: string,
  ): Promise<RoadmapProgressReport> {
    const dateFilter = this.dateRange(from, to);

    const items = await this.prisma.roadmapItem.findMany({
      where: {
        workspaceId,
        ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
      },
      select: {
        status: true,
        priorityScore: true,
        revenueImpactScore: true,
        signalCount: true,
      },
    });

    const statuses = Object.values(RoadmapStatus);
    const byStatus: RoadmapProgressBucket[] = statuses.map((s) => {
      const group = items.filter((i) => i.status === s);
      const scored = group.filter((i) => i.priorityScore != null);
      const avgPriority =
        scored.length > 0
          ? parseFloat(
              (
                scored.reduce((acc, i) => acc + (i.priorityScore ?? 0), 0) /
                scored.length
              ).toFixed(2),
            )
          : null;
      const revScored = group.filter((i) => i.revenueImpactScore != null);
      const avgRevenue =
        revScored.length > 0
          ? parseFloat(
              (
                revScored.reduce(
                  (acc, i) => acc + (i.revenueImpactScore ?? 0),
                  0,
                ) / revScored.length
              ).toFixed(2),
            )
          : null;
      return {
        status: s,
        count: group.length,
        avgPriorityScore: avgPriority,
        avgRevenueImpact: avgRevenue,
        totalSignalCount: group.reduce((acc, i) => acc + (i.signalCount ?? 0), 0),
      };
    });

    const shippedCount =
      byStatus.find((b) => b.status === RoadmapStatus.SHIPPED)?.count ?? 0;
    const committedCount =
      byStatus.find((b) => b.status === RoadmapStatus.COMMITTED)?.count ?? 0;
    const shippedFraction =
      items.length > 0
        ? parseFloat((shippedCount / items.length).toFixed(3))
        : 0;

    return {
      byStatus,
      totalItems: items.length,
      shippedCount,
      committedCount,
      shippedFraction,
      generatedAt: new Date().toISOString(),
    };
  }

  // ─── 5. Feedback Volume ───────────────────────────────────────────────────

  /**
   * Returns daily feedback volume grouped by source type.
   * Uses the indexed createdAt field for efficient date-range queries.
   */
  async getFeedbackVolume(
    workspaceId: string,
    from?: string,
    to?: string,
  ): Promise<FeedbackVolumeReport> {
    const dateFilter = this.dateRange(from, to);

    const feedbacks = await this.prisma.feedback.findMany({
      where: {
        workspaceId,
        ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
      },
      select: {
        createdAt: true,
        sourceType: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date (YYYY-MM-DD)
    const dayMap = new Map<string, { total: number; bySource: Record<string, number> }>();
    for (const f of feedbacks) {
      const day = f.createdAt.toISOString().slice(0, 10);
      if (!dayMap.has(day)) {
        dayMap.set(day, { total: 0, bySource: {} });
      }
      const entry = dayMap.get(day)!;
      entry.total += 1;
      entry.bySource[f.sourceType] = (entry.bySource[f.sourceType] ?? 0) + 1;
    }

    const series: FeedbackVolumePoint[] = Array.from(dayMap.entries()).map(
      ([date, data]) => ({ date, total: data.total, bySource: data.bySource }),
    );

    // Source frequency totals
    const sourceFreq: Record<string, number> = {};
    for (const f of feedbacks) {
      sourceFreq[f.sourceType] = (sourceFreq[f.sourceType] ?? 0) + 1;
    }
    const topSource =
      Object.keys(sourceFreq).length > 0
        ? Object.entries(sourceFreq).sort((a, b) => b[1] - a[1])[0][0]
        : null;

    const avgPerDay =
      series.length > 0
        ? parseFloat((feedbacks.length / series.length).toFixed(2))
        : 0;

    return {
      series,
      totalFeedback: feedbacks.length,
      avgPerDay,
      topSource,
      generatedAt: new Date().toISOString(),
    };
  }

  // ─── CSV Export ───────────────────────────────────────────────────────────

  /**
   * Generates a CSV string from a report payload.
   * Supports flat arrays of objects with consistent keys.
   */
  toCsv(rows: Record<string, unknown>[]): string {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const escape = (v: unknown): string => {
      const s = v == null ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const lines = [
      headers.join(','),
      ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
    ];
    return lines.join('\n');
  }
}

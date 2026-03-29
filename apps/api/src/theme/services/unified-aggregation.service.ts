/**
 * UnifiedAggregationService
 *
 * Computes and persists cross-source aggregation fields on the Theme model:
 *   - feedbackCount  (all sourceTypes via ThemeFeedback)
 *   - voiceCount     (VOICE sourceType only)
 *   - supportCount   (sum of ticketCount from linked SupportIssueClusters)
 *   - totalSignalCount
 *   - sentimentDistribution  { positive, neutral, negative }
 *   - crossSourceInsight     (AI-generated trend sentence)
 *   - lastAggregatedAt
 *
 * Called by:
 *   1. UnifiedAggregationProcessor (async, after theme clustering / support correlation)
 *   2. POST /themes/:id/aggregate  (on-demand, admin only)
 *   3. POST /themes/aggregate-all  (workspace-wide recompute)
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service';

export interface ThemeSourceBreakdown {
  themeId: string;
  feedbackCount: number;
  voiceCount: number;
  supportCount: number;
  totalSignalCount: number;
  sentimentDistribution: { positive: number; neutral: number; negative: number };
  crossSourceInsight: string | null;
  lastAggregatedAt: Date;
}

@Injectable()
export class UnifiedAggregationService {
  private readonly logger = new Logger(UnifiedAggregationService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY', ''),
    });
  }

  // ─── Single theme aggregation ─────────────────────────────────────────────

  async aggregateTheme(themeId: string): Promise<ThemeSourceBreakdown> {
    this.logger.log(`[Unified] Aggregating theme ${themeId}`);

    // 1. Fetch theme title for insight generation
    const theme = await this.prisma.theme.findUnique({
      where: { id: themeId },
      select: { title: true },
    });
    const themeTitle = theme?.title ?? null;

    // 2. Count all feedback linked to this theme (via ThemeFeedback junction)
    const feedbackRows = await this.prisma.themeFeedback.findMany({
      where: { themeId },
      include: {
        feedback: {
          select: { sourceType: true, sentiment: true },
        },
      },
    });

    const feedbackCount = feedbackRows.length;
    const voiceCount = feedbackRows.filter(
      (tf) => tf.feedback.sourceType === 'VOICE',
    ).length;

    // 3. Sentiment distribution from linked feedback
    const sentimentDistribution = { positive: 0, neutral: 0, negative: 0 };
    for (const tf of feedbackRows) {
      const s = tf.feedback.sentiment;
      if (s === null || s === undefined) {
        sentimentDistribution.neutral++;
      } else if (s > 0.1) {
        sentimentDistribution.positive++;
      } else if (s < -0.1) {
        sentimentDistribution.negative++;
      } else {
        sentimentDistribution.neutral++;
      }
    }

    // 4. Support ticket count via linked SupportIssueClusters
    const clusterAgg = await this.prisma.supportIssueCluster.aggregate({
      where: { themeId },
      _sum: { ticketCount: true },
    });
    const supportCount = clusterAgg._sum.ticketCount ?? 0;

    const totalSignalCount = feedbackCount + supportCount + voiceCount;

    // 5. Generate cross-source insight sentence (LLM if key available, fallback to rule-based)
    const crossSourceInsight = await this.generateInsightAsync({
      themeTitle,
      feedbackCount,
      voiceCount,
      supportCount,
      sentimentDistribution,
    });

    const lastAggregatedAt = new Date();

    // 6. Persist to Theme
    await this.prisma.theme.update({
      where: { id: themeId },
      data: {
        feedbackCount,
        voiceCount,
        supportCount,
        totalSignalCount,
        sentimentDistribution,
        crossSourceInsight,
        lastAggregatedAt,
      } as any, // new fields not yet in generated Prisma client
    });

    return {
      themeId,
      feedbackCount,
      voiceCount,
      supportCount,
      totalSignalCount,
      sentimentDistribution,
      crossSourceInsight,
      lastAggregatedAt,
    };
  }

  // ─── Workspace-wide aggregation ───────────────────────────────────────────

  async aggregateWorkspace(workspaceId: string): Promise<{
    processed: number;
    themes: ThemeSourceBreakdown[];
  }> {
    this.logger.log(`[Unified] Aggregating all themes for workspace ${workspaceId}`);

    const themes = await this.prisma.theme.findMany({
      where: { workspaceId },
      select: { id: true },
    });

    const results: ThemeSourceBreakdown[] = [];
    for (const theme of themes) {
      try {
        const result = await this.aggregateTheme(theme.id);
        results.push(result);
      } catch (err) {
        this.logger.warn(`[Unified] Failed to aggregate theme ${theme.id}: ${(err as Error).message}`);
      }
    }

    this.logger.log(`[Unified] Aggregated ${results.length}/${themes.length} themes`);
    return { processed: results.length, themes: results };
  }

  // ─── Unified top issues query ─────────────────────────────────────────────

  /**
   * Returns themes ranked by totalSignalCount (cross-source), enriched with
   * source breakdown, sentiment distribution, and CIQ score.
   */
  async getTopIssues(
    workspaceId: string,
    limit = 10,
  ): Promise<
    Array<{
      id: string;
      title: string;
      status: string;
      ciqScore: number | null;
      priorityScore: number | null;
      totalSignalCount: number;
      feedbackCount: number;
      voiceCount: number;
      supportCount: number;
      surveyCount: number;
      sentimentDistribution: { positive: number; neutral: number; negative: number } | null;
      crossSourceInsight: string | null;
      aiRecommendation: string | null;
      lastAggregatedAt: Date | null;
    }>
  > {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        status: string;
        ciqScore: number | null;
        priorityScore: number | null;
        totalSignalCount: number | null;
        feedbackCount: number | null;
        voiceCount: number | null;
        supportCount: number | null;
        surveyCount: number | null;
        sentimentDistribution: string | null;
        crossSourceInsight: string | null;
        aiRecommendation: string | null;
        lastAggregatedAt: Date | null;
      }>
    >`
      SELECT
        id,
        title,
        status,
        "ciqScore",
        "priorityScore",
        "totalSignalCount",
        "feedbackCount",
        "voiceCount",
        "supportCount",
        "surveyCount",
        "sentimentDistribution",
        "crossSourceInsight",
        "aiRecommendation",
        "lastAggregatedAt"
      FROM "Theme"
      WHERE "workspaceId" = ${workspaceId}
        AND status != 'ARCHIVED'
      ORDER BY COALESCE("totalSignalCount", 0) DESC,
               COALESCE("ciqScore", 0) DESC
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      ciqScore: r.ciqScore != null ? Number(r.ciqScore) : null,
      priorityScore: r.priorityScore != null ? Number(r.priorityScore) : null,
      totalSignalCount: Number(r.totalSignalCount ?? 0),
      feedbackCount: Number(r.feedbackCount ?? 0),
      voiceCount: Number(r.voiceCount ?? 0),
      supportCount: Number(r.supportCount ?? 0),
      surveyCount: Number(r.surveyCount ?? 0),
      sentimentDistribution: r.sentimentDistribution
        ? (typeof r.sentimentDistribution === 'string'
            ? JSON.parse(r.sentimentDistribution)
            : r.sentimentDistribution) as { positive: number; neutral: number; negative: number }
        : null,
      crossSourceInsight: r.crossSourceInsight,
      aiRecommendation: r.aiRecommendation,
      lastAggregatedAt: r.lastAggregatedAt,
    }));
  }

  // ─── Workspace source summary ─────────────────────────────────────────────

  /**
   * Returns a workspace-level summary of signal counts by source type,
   * plus the top theme title for each source.
   */
  async getWorkspaceSourceSummary(workspaceId: string): Promise<{
    feedbackCount: number;
    voiceCount: number;
    supportCount: number;
    surveyCount: number;
    totalSignals: number;
    feedbackPct: number;
    voicePct: number;
    supportPct: number;
    surveyPct: number;
    themeCount: number;
    scoredThemeCount: number;
    topThemeByFeedback: string | null;
    topThemeBySupport: string | null;
    topThemeByVoice: string | null;
    topThemeBySurvey: string | null;
  }> {
    const [feedbackBySource, supportAgg, themeStats, topByFeedback, topBySupport, topByVoice, topBySurvey] =
      await Promise.all([
        this.prisma.feedback.groupBy({
          by: ['sourceType'],
          where: { workspaceId },
          _count: { id: true },
        }),
        this.prisma.supportIssueCluster.aggregate({
          where: { workspaceId },
          _sum: { ticketCount: true },
        }),
        this.prisma.theme.aggregate({
          where: { workspaceId },
          _count: { id: true },
        }),
        // Top theme by feedback count (raw SQL for new field)
        this.prisma.$queryRaw<Array<{ title: string }>>`
          SELECT title FROM "Theme"
          WHERE "workspaceId" = ${workspaceId} AND status != 'ARCHIVED'
          ORDER BY COALESCE("feedbackCount", 0) DESC LIMIT 1
        `,
        this.prisma.$queryRaw<Array<{ title: string }>>`
          SELECT title FROM "Theme"
          WHERE "workspaceId" = ${workspaceId} AND status != 'ARCHIVED'
          ORDER BY COALESCE("supportCount", 0) DESC LIMIT 1
        `,
        this.prisma.$queryRaw<Array<{ title: string }>>`
          SELECT title FROM "Theme"
          WHERE "workspaceId" = ${workspaceId} AND status != 'ARCHIVED'
          ORDER BY COALESCE("voiceCount", 0) DESC LIMIT 1
        `,
        // Top theme by survey signal count
        this.prisma.$queryRaw<Array<{ title: string }>>`
          SELECT title FROM "Theme"
          WHERE "workspaceId" = ${workspaceId} AND status != 'ARCHIVED'
          ORDER BY COALESCE("surveyCount", 0) DESC LIMIT 1
        `,
      ]);

    const scoredThemeCount = await this.prisma.theme.count({
      where: { workspaceId, ciqScore: { not: null } },
    });

    const totalVoice =
      feedbackBySource.find((r) => r.sourceType === 'VOICE')?._count.id ?? 0;
    const totalSurvey =
      feedbackBySource.find((r) => r.sourceType === 'SURVEY')?._count.id ?? 0;
    // Feedback count excludes VOICE and SURVEY (those are shown as separate sources)
    const totalFeedback = feedbackBySource
      .filter((r) => r.sourceType !== 'VOICE' && r.sourceType !== 'SURVEY')
      .reduce((sum, r) => sum + r._count.id, 0);
    const totalSupport = supportAgg._sum.ticketCount ?? 0;
    const totalSignals = totalFeedback + totalVoice + totalSupport + totalSurvey;

    const pct = (n: number) =>
      totalSignals > 0 ? Math.round((n / totalSignals) * 100) : 0;

    return {
      feedbackCount: totalFeedback,
      voiceCount: totalVoice,
      supportCount: totalSupport,
      surveyCount: totalSurvey,
      totalSignals,
      feedbackPct: pct(totalFeedback),
      voicePct: pct(totalVoice),
      supportPct: pct(totalSupport),
      surveyPct: pct(totalSurvey),
      themeCount: themeStats._count.id,
      scoredThemeCount,
      topThemeByFeedback: topByFeedback[0]?.title ?? null,
      topThemeBySupport: topBySupport[0]?.title ?? null,
      topThemeByVoice: topByVoice[0]?.title ?? null,
      topThemeBySurvey: topBySurvey[0]?.title ?? null,
    };
  }

  // ─── AI Insight sentence generator ───────────────────────────────────────

  /**
   * Generates a concise cross-source insight sentence.
   *
   * If OPENAI_API_KEY is set, uses GPT-4.1-mini to produce a rich, contextual
   * sentence like "Checkout delay is rising across support and voice (+32% this week)".
   *
   * Falls back to a deterministic rule-based sentence when the key is absent
   * or the LLM call fails.
   */
  async generateInsightAsync(params: {
    themeTitle: string | null;
    feedbackCount: number;
    voiceCount: number;
    supportCount: number;
    sentimentDistribution: { positive: number; neutral: number; negative: number };
  }): Promise<string | null> {
    const { themeTitle, feedbackCount, voiceCount, supportCount, sentimentDistribution } = params;
    const total = feedbackCount + voiceCount + supportCount;
    if (total === 0) return null;

    const apiKey = this.configService.get<string>('OPENAI_API_KEY', '');

    if (apiKey && themeTitle) {
      try {
        const totalSentiment =
          sentimentDistribution.positive + sentimentDistribution.neutral + sentimentDistribution.negative;
        const negativePct =
          totalSentiment > 0
            ? Math.round((sentimentDistribution.negative / totalSentiment) * 100)
            : 0;
        const positivePct =
          totalSentiment > 0
            ? Math.round((sentimentDistribution.positive / totalSentiment) * 100)
            : 0;

        const activeSources: string[] = [];
        if (feedbackCount > 0) activeSources.push(`${feedbackCount} feedback entries`);
        if (supportCount > 0) activeSources.push(`${supportCount} support tickets`);
        if (voiceCount > 0) activeSources.push(`${voiceCount} voice reports`);

        const prompt = `You are a product intelligence analyst. Generate a single concise insight sentence (max 20 words) for a product theme.

Theme: "${themeTitle}"
Signal data:
- ${activeSources.join(', ')}
- Sentiment: ${negativePct}% negative, ${positivePct}% positive
- Total signals: ${total}

Write one sentence that highlights the most important pattern across these sources. Be specific and actionable. Do not use quotes or labels. Examples:
- "Rising across support and voice with 72% negative sentiment — needs urgent attention."
- "Reported in 3 sources: 12 feedback, 5 support tickets, 2 voice reports."
- "High negative sentiment (80%) across support tickets and voice reports."`;

        const response = await this.openai.chat.completions.create({
          model: 'gpt-4.1-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 60,
        });

        const sentence = response.choices[0]?.message?.content?.trim();
        if (sentence && sentence.length > 10) {
          return sentence;
        }
      } catch (err) {
        this.logger.warn(`[Unified] LLM insight generation failed, using rule-based fallback: ${(err as Error).message}`);
      }
    }

    // Rule-based fallback
    return this.generateInsight(params);
  }

  /**
   * Synchronous rule-based insight generator (used as fallback and in unit tests).
   */
  generateInsight(params: {
    feedbackCount: number;
    voiceCount: number;
    supportCount: number;
    sentimentDistribution: { positive: number; neutral: number; negative: number };
  }): string | null {
    const { feedbackCount, voiceCount, supportCount, sentimentDistribution } = params;
    const total = feedbackCount + voiceCount + supportCount;
    if (total === 0) return null;

    const activeSources: string[] = [];
    if (feedbackCount > 0) activeSources.push(`${feedbackCount} feedback`);
    if (supportCount > 0) activeSources.push(`${supportCount} support ticket${supportCount !== 1 ? 's' : ''}`);
    if (voiceCount > 0) activeSources.push(`${voiceCount} voice report${voiceCount !== 1 ? 's' : ''}`);

    const totalSentiment =
      sentimentDistribution.positive + sentimentDistribution.neutral + sentimentDistribution.negative;
    const negativePct =
      totalSentiment > 0
        ? Math.round((sentimentDistribution.negative / totalSentiment) * 100)
        : 0;

    const sourceStr =
      activeSources.length > 1
        ? activeSources.slice(0, -1).join(', ') + ' and ' + activeSources[activeSources.length - 1]
        : activeSources[0];

    const sourceCount = [feedbackCount > 0, supportCount > 0, voiceCount > 0].filter(Boolean).length;

    if (negativePct >= 60) {
      return `High negative sentiment (${negativePct}%) across ${sourceStr}.`;
    }
    if (sourceCount >= 2) {
      return `Reported across ${sourceCount} sources: ${sourceStr}.`;
    }
    return `${sourceStr.charAt(0).toUpperCase() + sourceStr.slice(1)} linked to this theme.`;
  }
}

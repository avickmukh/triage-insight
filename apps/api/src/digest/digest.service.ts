/**
 * DigestService — Stage-2 LLM-powered weekly digest
 *
 * Replaces the original rule-based digest with an LLM-generated narrative.
 *
 * Context fed to the LLM:
 *   - Top 5 themes by feedback volume with CIQ score, urgency score,
 *     cross-source signal counts (feedback / support / voice), AI narration
 *   - Average sentiment + WoW trend
 *   - Feedback volume delta vs prior period
 *   - Active spike events (z-score ranked)
 *
 * Estimated token usage per digest:
 *   ~400–700 prompt tokens + ~250–350 completion tokens ≈ 700–1050 total
 *   At gpt-4.1-mini pricing (~$0.15/1M input, $0.60/1M output):
 *   ≈ $0.0003–$0.0005 per digest run — negligible at any scale.
 *   Recommendation: run at most once per workspace per day; weekly is ideal.
 *
 * LLM output format:
 *   {
 *     topIssues:        string[],   // 3–5 bullet-point top issues
 *     emergingTrends:   string[],   // 1–3 emerging trends
 *     recommendations:  string[],   // 2–3 actionable recommendations
 *     narrativeSummary: string,     // 2–3 sentence executive summary
 *   }
 *
 * Failure behaviour:
 *   Falls back to the original rule-based summary if the LLM call fails.
 *   Never throws — all errors are caught and logged.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { DigestFrequency } from '@prisma/client';
import OpenAI from 'openai';

interface DigestNarration {
  topIssues: string[];
  emergingTrends: string[];
  recommendations: string[];
  narrativeSummary: string;
  // Index signature required for Prisma Json field compatibility
  [key: string]: unknown;
}

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY', ''),
    });
  }

  async generateDigest(
    workspaceId: string,
    frequency: DigestFrequency = DigestFrequency.WEEKLY,
  ) {
    this.logger.log(
      `Generating ${frequency} digest for workspace ${workspaceId}`,
    );

    const periodDays = frequency === DigestFrequency.WEEKLY ? 7 : 30;
    const since = new Date();
    since.setDate(since.getDate() - periodDays);
    const prevSince = new Date(since);
    prevSince.setDate(prevSince.getDate() - periodDays);

    // ── 1. Gather context ────────────────────────────────────────────────────
    const [
      topThemes,
      sentimentAgg,
      prevSentimentAgg,
      currentCount,
      prevCount,
      spikeEvents,
    ] = await Promise.all([
      // Top 5 themes by feedback volume in the period
      this.prisma.theme.findMany({
        where: {
          workspaceId,
          feedbacks: { some: { assignedAt: { gte: since } } },
        },
        select: {
          id: true,
          title: true,
          description: true,
          priorityScore: true,
          ciqScore: true,
          urgencyScore: true,
          revenueScore: true,
          totalSignalCount: true,
          feedbackCount: true,
          supportCount: true,
          voiceCount: true,
          crossSourceInsight: true,
          aiSummary: true,
          aiExplanation: true,
          aiRecommendation: true,
          aiConfidence: true,
          _count: { select: { feedbacks: true } },
        },
        orderBy: { feedbacks: { _count: 'desc' } },
        take: 5,
      }),
      // Sentiment this period
      this.prisma.feedback.aggregate({
        where: {
          workspaceId,
          createdAt: { gte: since },
          sentiment: { not: null },
        },
        _avg: { sentiment: true },
        _count: { id: true },
      }),
      // Sentiment previous period (for trend)
      this.prisma.feedback.aggregate({
        where: {
          workspaceId,
          createdAt: { gte: prevSince, lt: since },
          sentiment: { not: null },
        },
        _avg: { sentiment: true },
      }),
      // Feedback volume this period
      this.prisma.feedback.count({
        where: { workspaceId, createdAt: { gte: since } },
      }),
      // Feedback volume previous period
      this.prisma.feedback.count({
        where: { workspaceId, createdAt: { gte: prevSince, lt: since } },
      }),
      // Active spike events
      this.prisma.issueSpikeEvent.findMany({
        where: { workspaceId, windowStart: { gte: since } },
        select: {
          id: true,
          ticketCount: true,
          zScore: true,
          cluster: { select: { title: true } },
        },
        orderBy: { zScore: 'desc' },
        take: 3,
      }),
    ]);

    const avgSentiment = sentimentAgg._avg.sentiment;
    const prevAvgSentiment = prevSentimentAgg._avg.sentiment;
    const sentimentTrend =
      avgSentiment != null && prevAvgSentiment != null
        ? avgSentiment > prevAvgSentiment + 0.05
          ? 'improving'
          : avgSentiment < prevAvgSentiment - 0.05
            ? 'declining'
            : 'stable'
        : 'unknown';
    const volumeDelta = currentCount - prevCount;

    // ── 2. Generate LLM narration ────────────────────────────────────────────
    let narration: DigestNarration | null = null;
    try {
      narration = await this.callLlm({
        periodLabel:
          frequency === DigestFrequency.WEEKLY ? 'last 7 days' : 'last 30 days',
        topThemes,
        avgSentiment,
        sentimentTrend,
        currentCount,
        volumeDelta,
        spikeEvents,
      });
    } catch (err) {
      this.logger.warn(
        `LLM digest generation failed — using fallback: ${(err as Error).message}`,
      );
    }

    // ── 3. Fallback to rule-based if LLM failed ──────────────────────────────
    const summaryText =
      narration?.narrativeSummary ??
      this.buildFallbackSummary({
        topThemes,
        avgSentiment,
        sentimentTrend,
        currentCount,
        volumeDelta,
      });

    // ── 4. Persist digest run ────────────────────────────────────────────────

    const summaryPayload: any = {
      topThemes: topThemes.map((t) => ({
        id: t.id,
        title: t.title,
        feedbackCount: t._count.feedbacks,
        // Persisted CIQ/signal counts from the Theme model
        ciqScore: t.ciqScore,
        priorityScore: t.priorityScore,
        urgencyScore: t.urgencyScore,
        revenueScore: t.revenueScore,
        totalSignalCount: t.totalSignalCount,
        supportCount: t.supportCount,
        voiceCount: t.voiceCount,
        crossSourceInsight: t.crossSourceInsight,
        aiSummary: t.aiSummary,
        aiRecommendation: t.aiRecommendation,
      })),
      sentimentSummary: {
        _avg: { sentiment: avgSentiment },
        trend: sentimentTrend,
      },
      feedbackVolume: {
        current: currentCount,
        previous: prevCount,
        delta: volumeDelta,
      },
      spikeEvents: spikeEvents.map((s) => ({
        clusterTitle: s.cluster.title,
        ticketCount: s.ticketCount,
        zScore: s.zScore,
      })),
      // LLM-generated narration (null if fallback was used)
      narration,
      summaryText,
      generatedBy: narration ? 'llm' : 'rule-based',
    };

    const digestRun = await this.prisma.digestRun.create({
      data: {
        workspaceId,
        summary: summaryPayload,
      },
    });

    this.logger.log(
      `Digest ${digestRun.id} created for workspace ${workspaceId} (${narration ? 'LLM' : 'rule-based'})`,
    );

    await this.sendDigestEmail(digestRun.id);

    return digestRun;
  }

  /**
   * Returns the most recently generated digest for a workspace.
   * Returns null if no digest has been generated yet.
   */
  async getLatest(workspaceId: string) {
    return this.prisma.digestRun.findFirst({
      where: { workspaceId },
      orderBy: { sentAt: 'desc' },
    });
  }

  /**
   * Returns the last N digest runs for a workspace (newest first).
   * Used to power a digest history view.
   */
  async getHistory(workspaceId: string, limit = 10) {
    return this.prisma.digestRun.findMany({
      where: { workspaceId },
      orderBy: { sentAt: 'desc' },
      take: limit,
      select: {
        id: true,
        sentAt: true,
        summary: true,
      },
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async callLlm(context: {
    periodLabel: string;
    topThemes: Array<{
      title: string;
      description?: string | null;
      priorityScore?: number | null;
      ciqScore?: number | null;
      urgencyScore?: number | null;
      revenueScore?: number | null;
      totalSignalCount?: number | null;
      feedbackCount?: number | null;
      supportCount?: number | null;
      voiceCount?: number | null;
      crossSourceInsight?: string | null;
      aiSummary?: string | null;
      aiRecommendation?: string | null;
      _count: { feedbacks: number };
    }>;
    avgSentiment: number | null;
    sentimentTrend: string;
    currentCount: number;
    volumeDelta: number;
    spikeEvents: Array<{
      cluster: { title: string };
      ticketCount: number;
      zScore: number;
    }>;
  }): Promise<DigestNarration> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const themesBlock = context.topThemes
      .map((t, i) => {
        const ciq =
          t.ciqScore != null
            ? Math.round(t.ciqScore)
            : t.priorityScore != null
              ? Math.round(t.priorityScore * 100)
              : null;
        const urgency =
          t.urgencyScore != null ? Math.round(t.urgencyScore) : null;
        const revenue =
          t.revenueScore != null ? Math.round(t.revenueScore) : null;
        const sources: string[] = [];
        if ((t.feedbackCount ?? 0) > 0)
          sources.push(`${t.feedbackCount} feedback`);
        if ((t.supportCount ?? 0) > 0)
          sources.push(`${t.supportCount} support tickets`);
        if ((t.voiceCount ?? 0) > 0)
          sources.push(`${t.voiceCount} voice calls`);
        const sourceStr =
          sources.length > 0
            ? sources.join(' + ')
            : `${t._count.feedbacks} signals`;

        let line = `${i + 1}. "${t.title}" — ${sourceStr}`;
        if (ciq != null) line += `, CIQ: ${ciq}/100`;
        if (urgency != null && urgency > 30)
          line += `, Urgency: ${urgency}/100`;
        if (revenue != null && revenue > 10)
          line += `, Revenue impact: ${revenue}/100`;
        if (t.crossSourceInsight)
          line += `\n   Cross-source signal: ${t.crossSourceInsight}`;
        if (t.aiSummary) line += `\n   AI summary: ${t.aiSummary}`;
        if (t.aiRecommendation)
          line += `\n   Suggested action: ${t.aiRecommendation}`;
        return line;
      })
      .join('\n');

    const spikesBlock =
      context.spikeEvents.length > 0
        ? context.spikeEvents
            .map(
              (s) =>
                `- "${s.cluster.title}": ${s.ticketCount} tickets (z-score: ${s.zScore.toFixed(1)})`,
            )
            .join('\n')
        : 'None';

    const sentimentLabel =
      context.avgSentiment != null
        ? context.avgSentiment >= 0.3
          ? 'positive'
          : context.avgSentiment <= -0.3
            ? 'negative'
            : 'neutral'
        : 'unknown';
    const sentimentStr =
      context.avgSentiment != null
        ? `${sentimentLabel} (score: ${context.avgSentiment.toFixed(2)}, trend: ${context.sentimentTrend})`
        : 'unknown';

    const prompt = `
You are a senior product intelligence analyst preparing a ${context.periodLabel} digest for a VP of Product or founder.

Your job is to produce a concise, executive-ready intelligence briefing — not a data dump.
Write as if you are advising a product leader who has 90 seconds to read this.

RULES:
- Be specific. Use the theme names, signal counts, and scores provided.
- Do NOT repeat raw numbers without interpretation. Explain what they mean.
- Highlight what is NEW, WORSENING, or SURPRISING this period.
- Recommendations must be concrete product or process actions, not vague suggestions.
- Avoid phrases like "consider reviewing" or "it may be worth". Be direct.
- If sentiment is declining, say so clearly and link it to a theme if possible.
- If a spike is present, treat it as urgent.

WORKSPACE DATA (${context.periodLabel}):
- Feedback volume: ${context.currentCount} items (${context.volumeDelta >= 0 ? '+' : ''}${context.volumeDelta} vs prior period)
- Overall sentiment: ${sentimentStr}
- Active support spikes (anomalous ticket surges):
${spikesBlock}

TOP THEMES BY SIGNAL VOLUME:
${themesBlock}

Return ONLY a JSON object with exactly these keys:
{
  "topIssues": ["<3-5 specific, insight-driven bullet points — each must reference a theme name and explain the business impact>"],
  "emergingTrends": ["<1-3 trends that are new or accelerating this period — be specific about what changed>"],
  "recommendations": ["<2-3 direct, actionable product or process recommendations — each must be tied to a specific signal>"],
  "narrativeSummary": "<2-3 sentence executive summary. Start with the most important finding. End with the single most urgent action.>"
}
`.trim();

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a senior product intelligence analyst. Return ONLY a valid JSON object — no markdown fences, no explanation, no preamble.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 700,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0].message.content?.trim() ?? '{}';
    const parsed = JSON.parse(raw) as Partial<DigestNarration>;

    return {
      topIssues: Array.isArray(parsed.topIssues) ? parsed.topIssues : [],
      emergingTrends: Array.isArray(parsed.emergingTrends)
        ? parsed.emergingTrends
        : [],
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations
        : [],
      narrativeSummary:
        typeof parsed.narrativeSummary === 'string'
          ? parsed.narrativeSummary
          : '',
    };
  }

  private buildFallbackSummary(context: {
    topThemes: Array<{ title: string; _count: { feedbacks: number } }>;
    avgSentiment: number | null;
    sentimentTrend: string;
    currentCount: number;
    volumeDelta: number;
  }): string {
    const parts: string[] = [];
    parts.push(
      `${context.currentCount} feedback items received (${context.volumeDelta >= 0 ? '+' : ''}${context.volumeDelta} vs prior period).`,
    );
    if (context.topThemes.length > 0) {
      parts.push(
        `Top themes: ${context.topThemes.map((t) => `"${t.title}"`).join(', ')}.`,
      );
    }
    if (context.avgSentiment != null) {
      const label =
        context.avgSentiment >= 0.3
          ? 'positive'
          : context.avgSentiment <= -0.3
            ? 'negative'
            : 'neutral';
      parts.push(
        `Overall sentiment is ${label} (${context.avgSentiment.toFixed(2)}), trend: ${context.sentimentTrend}.`,
      );
    }
    return parts.join(' ');
  }

  private async sendDigestEmail(digestRunId: string) {
    const digestRun = await this.prisma.digestRun.findUnique({
      where: { id: digestRunId },
      include: {
        workspace: {
          include: { members: { include: { user: true } } },
        },
      },
    });

    if (!digestRun) {
      this.logger.error(
        `Digest run ${digestRunId} not found for sending email.`,
      );
      return;
    }

    const recipients = digestRun.workspace.members
      .filter((m) => m.user.email)
      .map((m) => m.user.email);

    if (recipients.length === 0) {
      this.logger.warn(
        `No recipients found for digest email for workspace ${digestRun.workspaceId}`,
      );
      return;
    }

    const summary = digestRun.summary as {
      topThemes: Array<{
        title: string;
        feedbackCount: number;
        aiSummary?: string | null;
        aiRecommendation?: string | null;
      }>;
      sentimentSummary: { _avg: { sentiment: number | null }; trend: string };
      feedbackVolume: { current: number; delta: number };
      narration: DigestNarration | null;
      summaryText: string;
    };

    const narration = summary.narration;

    const textBody = narration
      ? [
          `${digestRun.workspace.name} — Weekly Intelligence Digest`,
          '',
          summary.summaryText,
          '',
          'TOP ISSUES',
          ...narration.topIssues.map((i) => `• ${i}`),
          '',
          'EMERGING TRENDS',
          ...narration.emergingTrends.map((t) => `• ${t}`),
          '',
          'RECOMMENDATIONS',
          ...narration.recommendations.map((r) => `• ${r}`),
          '',
          'TOP THEMES',
          ...summary.topThemes.map(
            (t) => `• ${t.title} (${t.feedbackCount} signals)`,
          ),
        ].join('\n')
      : `Weekly Digest\n\n${summary.summaryText}\n\nTop Themes:\n${summary.topThemes.map((t) => `- ${t.title}`).join('\n')}`;

    const htmlBody = narration
      ? `
        <h1>${digestRun.workspace.name} — Weekly Intelligence Digest</h1>
        <p>${summary.summaryText}</p>
        <h2>Top Issues</h2>
        <ul>${narration.topIssues.map((i) => `<li>${i}</li>`).join('')}</ul>
        <h2>Emerging Trends</h2>
        <ul>${narration.emergingTrends.map((t) => `<li>${t}</li>`).join('')}</ul>
        <h2>Recommendations</h2>
        <ul>${narration.recommendations.map((r) => `<li>${r}</li>`).join('')}</ul>
        <h2>Top Themes</h2>
        <ul>${summary.topThemes.map((t) => `<li><strong>${t.title}</strong> — ${t.feedbackCount} signals${t.aiSummary ? `<br><small>${t.aiSummary}</small>` : ''}${t.aiRecommendation ? `<br><small><em>Action: ${t.aiRecommendation}</em></small>` : ''}</li>`).join('')}</ul>
        <p style="color:#6C757D;font-size:0.8em;">Average sentiment: ${summary.sentimentSummary._avg.sentiment?.toFixed(2) ?? 'n/a'} (${summary.sentimentSummary.trend})</p>
      `
      : `
        <h1>Weekly Digest</h1>
        <p>${summary.summaryText}</p>
        <h2>Top Themes</h2>
        <ul>${summary.topThemes.map((t) => `<li>${t.title}</li>`).join('')}</ul>
        <p>Average sentiment: ${summary.sentimentSummary._avg.sentiment?.toFixed(2) ?? 'n/a'}</p>
      `;

    for (const recipient of recipients) {
      await this.emailService.send({
        to: recipient,
        subject: `Your ${digestRun.workspace.name} Weekly Intelligence Digest`,
        text: textBody,
        html: htmlBody,
      });
    }

    this.logger.log(
      `Digest email sent for digest run ${digestRunId} to ${recipients.length} recipients.`,
    );
  }
}

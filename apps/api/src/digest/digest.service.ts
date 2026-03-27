/**
 * DigestService — Stage-2 LLM-powered weekly digest
 *
 * Replaces the original rule-based digest with an LLM-generated narrative.
 *
 * Context fed to the LLM:
 *   - Top 5 themes by feedback volume (with AI narration fields if available)
 *   - Average sentiment across the period
 *   - Feedback volume delta vs prior period
 *   - Spike events (if any)
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
  topIssues:        string[];
  emergingTrends:   string[];
  recommendations:  string[];
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

  async generateDigest(workspaceId: string, frequency: DigestFrequency = DigestFrequency.WEEKLY) {
    this.logger.log(`Generating ${frequency} digest for workspace ${workspaceId}`);

    const periodDays = frequency === DigestFrequency.WEEKLY ? 7 : 30;
    const since = new Date();
    since.setDate(since.getDate() - periodDays);
    const prevSince = new Date(since);
    prevSince.setDate(prevSince.getDate() - periodDays);

    // ── 1. Gather context ────────────────────────────────────────────────────
    const [topThemes, sentimentAgg, prevSentimentAgg, currentCount, prevCount, spikeEvents] =
      await Promise.all([
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
            urgencyScore: true,
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
          where: { workspaceId, createdAt: { gte: since }, sentiment: { not: null } },
          _avg: { sentiment: true },
          _count: { id: true },
        }),
        // Sentiment previous period (for trend)
        this.prisma.feedback.aggregate({
          where: { workspaceId, createdAt: { gte: prevSince, lt: since }, sentiment: { not: null } },
          _avg: { sentiment: true },
        }),
        // Feedback volume this period
        this.prisma.feedback.count({ where: { workspaceId, createdAt: { gte: since } } }),
        // Feedback volume previous period
        this.prisma.feedback.count({ where: { workspaceId, createdAt: { gte: prevSince, lt: since } } }),
        // Active spike events
        this.prisma.issueSpikeEvent.findMany({
          where: { workspaceId, windowStart: { gte: since } },
          select: { id: true, ticketCount: true, zScore: true, cluster: { select: { title: true } } },
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
        periodLabel: frequency === DigestFrequency.WEEKLY ? 'last 7 days' : 'last 30 days',
        topThemes,
        avgSentiment,
        sentimentTrend,
        currentCount,
        volumeDelta,
        spikeEvents,
      });
    } catch (err) {
      this.logger.warn(`LLM digest generation failed — using fallback: ${(err as Error).message}`);
    }

    // ── 3. Fallback to rule-based if LLM failed ──────────────────────────────
    const summaryText = narration?.narrativeSummary ?? this.buildFallbackSummary({
      topThemes,
      avgSentiment,
      sentimentTrend,
      currentCount,
      volumeDelta,
    });

    // ── 4. Persist digest run ────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const summaryPayload: any = {
      topThemes: topThemes.map((t) => ({
        id: t.id,
        title: t.title,
        feedbackCount: t._count.feedbacks,
        priorityScore: t.priorityScore,
        aiSummary: t.aiSummary,
        aiRecommendation: t.aiRecommendation,
      })),
      sentimentSummary: {
        _avg: { sentiment: avgSentiment },
        trend: sentimentTrend,
      },
      feedbackVolume: { current: currentCount, previous: prevCount, delta: volumeDelta },
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

    this.logger.log(`Digest ${digestRun.id} created for workspace ${workspaceId} (${narration ? 'LLM' : 'rule-based'})`);

    await this.sendDigestEmail(digestRun.id);

    return digestRun;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async callLlm(context: {
    periodLabel: string;
    topThemes: Array<{
      title: string;
      description?: string | null;
      priorityScore?: number | null;
      urgencyScore?: number | null;
      aiSummary?: string | null;
      aiRecommendation?: string | null;
      _count: { feedbacks: number };
    }>;
    avgSentiment: number | null;
    sentimentTrend: string;
    currentCount: number;
    volumeDelta: number;
    spikeEvents: Array<{ cluster: { title: string }; ticketCount: number; zScore: number }>;
  }): Promise<DigestNarration> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const themesBlock = context.topThemes
      .map(
        (t, i) =>
          `${i + 1}. "${t.title}" — ${t._count.feedbacks} signals` +
          (t.priorityScore != null ? `, CIQ: ${Math.round(t.priorityScore * 100)}%` : '') +
          (t.aiSummary ? `\n   Summary: ${t.aiSummary}` : '') +
          (t.aiRecommendation ? `\n   Suggested action: ${t.aiRecommendation}` : ''),
      )
      .join('\n');

    const spikesBlock =
      context.spikeEvents.length > 0
        ? context.spikeEvents
            .map((s) => `- "${s.cluster.title}": ${s.ticketCount} tickets (z-score: ${s.zScore.toFixed(1)})`)
            .join('\n')
        : 'None';

    const sentimentStr =
      context.avgSentiment != null
        ? `${context.avgSentiment >= 0.3 ? 'positive' : context.avgSentiment <= -0.3 ? 'negative' : 'neutral'} (${context.avgSentiment.toFixed(2)}), trend: ${context.sentimentTrend}`
        : 'unknown';

    const prompt = `
You are a product intelligence analyst writing a ${context.periodLabel} digest for a SaaS product team.

Data:
- Feedback volume: ${context.currentCount} items (${context.volumeDelta >= 0 ? '+' : ''}${context.volumeDelta} vs prior period)
- Overall sentiment: ${sentimentStr}
- Active support spikes:
${spikesBlock}

Top themes by signal volume:
${themesBlock}

Return ONLY a JSON object with exactly these keys:
{
  "topIssues": ["<3-5 concise bullet points describing the top customer issues>"],
  "emergingTrends": ["<1-3 emerging trends worth watching>"],
  "recommendations": ["<2-3 concrete recommended actions for the product team>"],
  "narrativeSummary": "<2-3 sentence executive summary suitable for a VP of Product>"
}
`.trim();

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a product intelligence analyst. Return ONLY a JSON object — no markdown, no explanation.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 600,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0].message.content?.trim() ?? '{}';
    const parsed = JSON.parse(raw) as Partial<DigestNarration>;

    return {
      topIssues:        Array.isArray(parsed.topIssues)        ? parsed.topIssues        : [],
      emergingTrends:   Array.isArray(parsed.emergingTrends)   ? parsed.emergingTrends   : [],
      recommendations:  Array.isArray(parsed.recommendations)  ? parsed.recommendations  : [],
      narrativeSummary: typeof parsed.narrativeSummary === 'string' ? parsed.narrativeSummary : '',
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
    parts.push(`${context.currentCount} feedback items received (${context.volumeDelta >= 0 ? '+' : ''}${context.volumeDelta} vs prior period).`);
    if (context.topThemes.length > 0) {
      parts.push(`Top themes: ${context.topThemes.map((t) => `"${t.title}"`).join(', ')}.`);
    }
    if (context.avgSentiment != null) {
      const label = context.avgSentiment >= 0.3 ? 'positive' : context.avgSentiment <= -0.3 ? 'negative' : 'neutral';
      parts.push(`Overall sentiment is ${label} (${context.avgSentiment.toFixed(2)}), trend: ${context.sentimentTrend}.`);
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
      this.logger.error(`Digest run ${digestRunId} not found for sending email.`);
      return;
    }

    const recipients = digestRun.workspace.members
      .filter((m) => m.user.email)
      .map((m) => m.user.email);

    if (recipients.length === 0) {
      this.logger.warn(`No recipients found for digest email for workspace ${digestRun.workspaceId}`);
      return;
    }

    const summary = digestRun.summary as {
      topThemes: Array<{ title: string; feedbackCount: number; aiSummary?: string | null; aiRecommendation?: string | null }>;
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
          ...summary.topThemes.map((t) => `• ${t.title} (${t.feedbackCount} signals)`),
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

    this.logger.log(`Digest email sent for digest run ${digestRunId} to ${recipients.length} recipients.`);
  }
}

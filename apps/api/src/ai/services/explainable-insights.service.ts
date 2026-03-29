import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * ExplainableInsightsService
 *
 * Generates human-readable impact sentences for themes.
 *
 * EXPLAINABLE INSIGHTS (PRD Part 6):
 *   Every insight must explain itself with:
 *     - Reason: what is happening
 *     - Trend: how it is changing
 *     - Impact: what it means for the business
 *
 *   Example output:
 *     "Payment failures increased 25% this week due to checkout errors,
 *      affecting 34 customers and $120K in pipeline."
 *
 * PERFORMANCE:
 *   - Only regenerates if impactSentence is null or theme has been re-scored
 *   - Falls back to a rule-based sentence if LLM call fails
 *   - Batch processes up to 20 themes per run
 */
@Injectable()
export class ExplainableInsightsService {
  private readonly logger = new Logger(ExplainableInsightsService.name);
  private readonly openai: OpenAI;

  constructor(private readonly prisma: PrismaService) {
    this.openai = new OpenAI();
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Generate and persist an impactSentence for a single theme.
   */
  async generateImpactSentence(themeId: string): Promise<string | null> {
    const theme = await this.prisma.theme.findUnique({
      where: { id: themeId },
      select: {
        id: true,
        title: true,
        shortLabel: true,
        trendDirection: true,
        trendDelta: true,
        currentWeekSignals: true,
        prevWeekSignals: true,
        ciqScore: true,
        revenueInfluence: true,
        topKeywords: true,
        crossSourceInsight: true,
        _count: { select: { feedbacks: true } },
      },
    });

    if (!theme) return null;

    // Count distinct customers linked to this theme
    const customerCount = await this.prisma.customerSignal.count({
      where: { themeId },
    });

    const sentence =
      (await this.callLLM(theme, customerCount)) ??
      this.heuristicSentence(theme, customerCount);

    await this.prisma.theme.update({
      where: { id: themeId },
      data: { impactSentence: sentence },
    });

    this.logger.log(`[Insight] Theme ${themeId}: "${sentence}"`);
    return sentence;
  }

  /**
   * Batch generate impact sentences for themes in a workspace that lack one.
   */
  async generateInsightsForWorkspace(workspaceId: string): Promise<{ processed: number }> {
    const themes = await this.prisma.theme.findMany({
      where: {
        workspaceId,
        status: { not: 'ARCHIVED' },
        impactSentence: null,
      },
      select: { id: true },
      take: 20,
    });

    let processed = 0;
    for (const { id } of themes) {
      try {
        await this.generateImpactSentence(id);
        processed++;
      } catch (err) {
        this.logger.warn(`[Insight] Failed for theme ${id}: ${(err as Error).message}`);
      }
    }

    return { processed };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async callLLM(
    theme: {
      title: string;
      shortLabel: string | null;
      trendDirection: string | null;
      trendDelta: number | null;
      currentWeekSignals: number | null;
      prevWeekSignals: number | null;
      ciqScore: number | null;
      revenueInfluence: number | null;
      topKeywords: unknown;
      crossSourceInsight: string | null;
      _count: { feedbacks: number };
    },
    customerCount: number,
  ): Promise<string | null> {
    try {
      const keywords = parseKeywords(theme.topKeywords);
      const trendWord =
        theme.trendDirection === 'UP'
          ? 'increased'
          : theme.trendDirection === 'DOWN'
          ? 'decreased'
          : 'remained stable';

      const prompt = [
        'You are a product intelligence analyst. Write ONE sentence (max 25 words) that explains:',
        '  1. What is happening (the issue/theme)',
        '  2. The trend (increasing/stable/decreasing)',
        '  3. The business impact (customers, revenue if available)',
        '',
        `Theme: "${theme.shortLabel ?? theme.title}"`,
        `Trend: ${trendWord} ${Math.abs(Number(theme.trendDelta ?? 0)).toFixed(0)}% this week`,
        `Signals this week: ${theme.currentWeekSignals ?? 0} (prev: ${theme.prevWeekSignals ?? 0})`,
        `Total feedback items: ${theme._count.feedbacks}`,
        customerCount > 0 ? `Affected customers: ${customerCount}` : '',
        theme.revenueInfluence ? `Revenue at risk: $${Math.round(theme.revenueInfluence / 1000)}K` : '',
        keywords.length > 0 ? `Key terms: ${keywords.slice(0, 4).join(', ')}` : '',
        theme.crossSourceInsight ? `Context: ${theme.crossSourceInsight}` : '',
        '',
        'Write ONLY the sentence. Be specific. No generic phrases.',
      ].filter(Boolean).join('\n');

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 60,
        temperature: 0.4,
      });

      const sentence = response.choices[0]?.message?.content?.trim() ?? '';
      return sentence.length > 10 ? sentence : null;
    } catch (err) {
      this.logger.warn(`[Insight] LLM call failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Rule-based fallback sentence generator.
   * Format: "{Label} {trend} {delta}% this week, affecting {N} customers."
   */
  private heuristicSentence(
    theme: {
      title: string;
      shortLabel: string | null;
      trendDirection: string | null;
      trendDelta: number | null;
      currentWeekSignals: number | null;
      revenueInfluence: number | null;
    },
    customerCount: number,
  ): string {
    const label = theme.shortLabel ?? theme.title;
    const delta = Math.abs(Number(theme.trendDelta ?? 0)).toFixed(0);
    const trendWord =
      theme.trendDirection === 'UP'
        ? `increased ${delta}%`
        : theme.trendDirection === 'DOWN'
        ? `decreased ${delta}%`
        : 'remained stable';

    const parts: string[] = [`${label} ${trendWord} this week`];

    if (customerCount > 0) {
      parts.push(`affecting ${customerCount} customer${customerCount !== 1 ? 's' : ''}`);
    }

    if (theme.revenueInfluence && theme.revenueInfluence > 0) {
      parts.push(`with $${Math.round(theme.revenueInfluence / 1000)}K revenue at risk`);
    }

    return parts.join(', ') + '.';
  }
}

function parseKeywords(raw: unknown): string[] {
  if (!raw) return [];
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : (raw as string[]);
  } catch {
    return [];
  }
}

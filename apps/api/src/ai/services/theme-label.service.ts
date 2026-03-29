import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * ThemeLabelService
 *
 * Generates short, specific, actionable labels for AI_GENERATED themes.
 *
 * LABEL GENERATION (PRD Part 4):
 *   - Produces a shortLabel of ≤ 6 words that is specific and actionable
 *   - Avoids generic labels like "User Feedback", "Product Issue", "Bug Report"
 *   - Uses the theme's top keywords and a sample of feedback titles as context
 *   - Falls back to a keyword-based heuristic if the LLM call fails
 *
 * PERFORMANCE:
 *   - Only regenerates if shortLabelAt is null or > 7 days old
 *   - Processes themes in batches of 10 to avoid rate limits
 *   - Single LLM call per theme (no loops)
 */
@Injectable()
export class ThemeLabelService {
  private readonly logger = new Logger(ThemeLabelService.name);
  private readonly openai: OpenAI;

  /** Regenerate label if older than this many days. */
  private readonly LABEL_TTL_DAYS = 7;

  /** Generic labels to reject and retry. */
  private readonly GENERIC_LABELS = new Set([
    'user feedback', 'product issue', 'bug report', 'feature request',
    'customer complaint', 'general feedback', 'misc issue', 'other',
    'unknown', 'untitled', 'new theme', 'theme', 'issue', 'problem',
    'request', 'feedback', 'complaint', 'suggestion',
  ]);

  constructor(private readonly prisma: PrismaService) {
    this.openai = new OpenAI();
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Generate or refresh the shortLabel for a single theme.
   * Returns the generated label string.
   */
  async generateLabel(themeId: string): Promise<string | null> {
    const theme = await this.prisma.theme.findUnique({
      where: { id: themeId },
      select: {
        id: true,
        title: true,
        topKeywords: true,
        shortLabel: true,
        shortLabelAt: true,
        feedbacks: {
          take: 5,
          select: { feedback: { select: { title: true } } },
          orderBy: { assignedAt: 'desc' },
        },
      },
    });

    if (!theme) return null;

    // Skip if label is fresh
    if (theme.shortLabel && theme.shortLabelAt) {
      const ageMs = Date.now() - new Date(theme.shortLabelAt).getTime();
      if (ageMs < this.LABEL_TTL_DAYS * 24 * 60 * 60 * 1000) {
        return theme.shortLabel;
      }
    }

    const keywords = parseKeywords(theme.topKeywords);
    const sampleTitles = theme.feedbacks.map((f) => f.feedback.title).filter(Boolean);

    const label = await this.callLLM(theme.title, keywords, sampleTitles)
      ?? this.heuristicLabel(theme.title, keywords);

    await this.prisma.theme.update({
      where: { id: themeId },
      data: { shortLabel: label, shortLabelAt: new Date() },
    });

    this.logger.log(`[Label] Theme ${themeId}: "${label}"`);
    return label;
  }

  /**
   * Batch generate labels for all AI_GENERATED themes in a workspace
   * that do not yet have a shortLabel or have a stale one.
   */
  async generateLabelsForWorkspace(workspaceId: string): Promise<{ processed: number }> {
    const cutoff = new Date(Date.now() - this.LABEL_TTL_DAYS * 24 * 60 * 60 * 1000);

    const themes = await this.prisma.theme.findMany({
      where: {
        workspaceId,
        status: 'AI_GENERATED',
        OR: [
          { shortLabel: null },
          { shortLabelAt: null },
          { shortLabelAt: { lt: cutoff } },
        ],
      },
      select: { id: true },
      take: 50, // process up to 50 per run
    });

    let processed = 0;
    for (const { id } of themes) {
      try {
        await this.generateLabel(id);
        processed++;
      } catch (err) {
        this.logger.warn(`[Label] Failed for theme ${id}: ${(err as Error).message}`);
      }
    }

    return { processed };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async callLLM(
    themeTitle: string,
    keywords: string[],
    sampleTitles: string[],
  ): Promise<string | null> {
    try {
      const prompt = [
        'You are a product manager labelling customer feedback themes.',
        'Generate a SHORT LABEL (maximum 6 words) for this theme.',
        'The label must be:',
        '  - Specific and actionable (e.g. "Payment Failures at Checkout")',
        '  - NOT generic (avoid: "User Feedback", "Product Issue", "Bug Report", "Feature Request")',
        '  - In title case',
        '  - Under 6 words',
        '',
        `Theme title: "${themeTitle}"`,
        keywords.length > 0 ? `Top keywords: ${keywords.slice(0, 5).join(', ')}` : '',
        sampleTitles.length > 0
          ? `Sample feedback:\n${sampleTitles.map((t) => `  - "${t}"`).join('\n')}`
          : '',
        '',
        'Respond with ONLY the label, nothing else.',
      ].filter(Boolean).join('\n');

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 20,
        temperature: 0.3,
      });

      const raw = response.choices[0]?.message?.content?.trim() ?? '';
      // Strip quotes if present
      const label = raw.replace(/^["']|["']$/g, '').trim();

      // Reject generic labels
      if (!label || this.GENERIC_LABELS.has(label.toLowerCase())) {
        return null;
      }

      // Truncate to 6 words if LLM exceeded the limit
      const words = label.split(/\s+/);
      return words.length > 6 ? words.slice(0, 6).join(' ') : label;
    } catch (err) {
      this.logger.warn(`[Label] LLM call failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Fallback: build a label from the top 3 keywords in title case.
   * Example: keywords ["payment", "failure", "checkout"] → "Payment Failure Checkout"
   */
  private heuristicLabel(themeTitle: string, keywords: string[]): string {
    if (keywords.length >= 2) {
      return keywords
        .slice(0, 3)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
    // Last resort: truncate the theme title to 6 words
    const words = themeTitle.split(/\s+/);
    return words.length > 6 ? `${words.slice(0, 6).join(' ')}…` : themeTitle;
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

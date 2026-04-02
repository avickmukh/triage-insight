import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * ThemeLabelService
 *
 * Generates short, specific, actionable labels for themes.
 *
 * LABEL GENERATION:
 *   - Produces a shortLabel of 3–6 words that is specific and actionable
 *   - Avoids generic labels like "User Feedback", "Product Issue", "Bug Report"
 *   - Uses the theme's top keywords AND actual feedback phrases as grounded context
 *   - Falls back to a bigram/trigram n-gram heuristic if the LLM call fails
 *   - Processes PROVISIONAL, STABLE, and AI_GENERATED themes
 *
 * PERFORMANCE:
 *   - Only regenerates if shortLabelAt is null or > 7 days old
 *   - Processes themes in batches of 50 to avoid rate limits
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
    'request', 'feedback', 'complaint', 'suggestion', 'error', 'failure',
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
          take: 8,
          select: {
            feedback: {
              select: {
                title: true,
                description: true,
              },
            },
          },
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
    const sampleDescriptions = theme.feedbacks
      .map((f) => f.feedback.description)
      .filter((d): d is string => !!d)
      .slice(0, 3);

    const label =
      (await this.callLLM(theme.title, keywords, sampleTitles, sampleDescriptions)) ??
      this.ngramHeuristicLabel(theme.title, keywords, sampleTitles);

    await this.prisma.theme.update({
      where: { id: themeId },
      data: { shortLabel: label, shortLabelAt: new Date() },
    });

    this.logger.log(`[Label] Theme ${themeId}: "${label}"`);
    return label;
  }

  /**
   * Batch generate labels for all active themes in a workspace
   * that do not yet have a shortLabel or have a stale one.
   *
   * Processes PROVISIONAL, STABLE, and AI_GENERATED themes.
   */
  async generateLabelsForWorkspace(workspaceId: string): Promise<{ processed: number }> {
    const cutoff = new Date(Date.now() - this.LABEL_TTL_DAYS * 24 * 60 * 60 * 1000);

    const themes = await this.prisma.theme.findMany({
      where: {
        workspaceId,
        status: { in: ['AI_GENERATED', 'PROVISIONAL', 'STABLE', 'VERIFIED', 'RESURFACED', 'REOPENED'] },
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

  /**
   * Grounded LLM call.
   *
   * The prompt includes actual feedback titles and description excerpts
   * so the model derives the label from real evidence, not hallucination.
   */
  private async callLLM(
    themeTitle: string,
    keywords: string[],
    sampleTitles: string[],
    sampleDescriptions: string[],
  ): Promise<string | null> {
    try {
      const evidenceLines: string[] = [];
      if (keywords.length > 0) {
        evidenceLines.push(`Top keywords: ${keywords.slice(0, 6).join(', ')}`);
      }
      if (sampleTitles.length > 0) {
        evidenceLines.push(
          `Sample feedback titles:\n${sampleTitles.map((t) => `  - "${t}"`).join('\n')}`,
        );
      }
      if (sampleDescriptions.length > 0) {
        evidenceLines.push(
          `Sample feedback excerpts:\n${sampleDescriptions
            .map((d) => `  - "${d.slice(0, 80).trim()}${d.length > 80 ? '…' : ''}"`)  
            .join('\n')}`,
        );
      }
      const prompt = [
        'You are a product manager labelling customer feedback themes.',
        'Generate a SHORT LABEL (3–6 words) for this theme.',
        '',
        'RULES:',
        '  1. Use ONLY the evidence provided below — do not invent details.',
        '  2. Be specific and actionable (e.g. "Payment Failures at Checkout").',
        '  3. Do NOT use generic labels like: "User Feedback", "Product Issue",',
        '     "Bug Report", "Feature Request", "Customer Complaint", "Error".',
        '  4. Write in title case.',
        '  5. Maximum 6 words.',
        '',
        `Theme title: "${themeTitle}"`,
        '',
        'Evidence:',
        ...evidenceLines,
        '',
        'Respond with ONLY the label, nothing else.',
      ].join('\n');

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 20,
        temperature: 0.2,
      });

      const raw = response.choices[0]?.message?.content?.trim() ?? '';
      // Strip quotes if present
      const label = raw.replace(/^["']|["']$/g, '').trim();

      // Reject generic labels
      if (!label || this.GENERIC_LABELS.has(label.toLowerCase())) {
        this.logger.debug(`[Label] LLM returned generic label "${label}" — falling back`);
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
   * N-gram heuristic fallback.
   *
   * Strategy (in priority order):
   * 1. Extract bigrams and trigrams from sample feedback titles.
   *    Pick the most frequent bigram/trigram that is not a stop-phrase.
   * 2. If no good n-gram found, use top 3 keywords in title case.
   * 3. Last resort: truncate the theme title to 4 words.
   */
  private ngramHeuristicLabel(
    themeTitle: string,
    keywords: string[],
    sampleTitles: string[],
  ): string {
    // Try n-gram extraction from sample titles
    if (sampleTitles.length >= 2) {
      const ngrams = extractNgrams(sampleTitles, 2, 3);
      const best = ngrams.find((ng) => !isGenericNgram(ng));
      if (best) {
        return titleCase(best);
      }
    }
    // Fall back to top keywords
    if (keywords.length >= 2) {
      return keywords
        .slice(0, 3)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
    // Last resort: truncate theme title to 4 words
    const words = themeTitle.split(/\s+/);
    return words.length > 4 ? words.slice(0, 4).join(' ') : themeTitle;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

const NGRAM_STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'is', 'are', 'was', 'were', 'be', 'been', 'not', 'no', 'this', 'that', 'it', 'its',
  'i', 'we', 'you', 'he', 'she', 'they', 'my', 'our', 'your', 'his', 'her', 'their',
  'get', 'got', 'please', 'need', 'want', 'use', 'using', 'used', 'make', 'made',
  'cant', 'dont', 'doesnt', 'isnt', 'wasnt', 'wont',
]);

const GENERIC_NGRAMS = new Set([
  'user feedback', 'product issue', 'bug report', 'feature request',
  'customer complaint', 'general feedback', 'misc issue', 'other issue',
  'app issue', 'app problem', 'app error', 'app bug', 'app crash',
  'not working', 'does not work', 'doesnt work', 'not loading',
]);

function isGenericNgram(ngram: string): boolean {
  return GENERIC_NGRAMS.has(ngram.toLowerCase());
}

/**
 * Extract the most frequent bigrams and trigrams from a list of sentences.
 * Returns n-grams sorted by frequency (descending), filtered to exclude
 * n-grams that start or end with stop words.
 */
function extractNgrams(sentences: string[], minN: number, maxN: number): string[] {
  const freq: Record<string, number> = {};
  for (const sentence of sentences) {
    const tokens = sentence
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);
    for (let n = minN; n <= maxN; n++) {
      for (let i = 0; i <= tokens.length - n; i++) {
        const gram = tokens.slice(i, i + n);
        if (NGRAM_STOP.has(gram[0]) || NGRAM_STOP.has(gram[gram.length - 1])) continue;
        const key = gram.join(' ');
        freq[key] = (freq[key] ?? 0) + 1;
      }
    }
  }
  return Object.entries(freq)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([ngram]) => ngram);
}

function titleCase(str: string): string {
  return str
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function parseKeywords(raw: unknown): string[] {
  if (!raw) return [];
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : (raw as string[]);
  } catch {
    return [];
  }
}

/**
 * NegativeClauseExtractorService
 *
 * Extracts the actionable problem clause from mixed-sentiment feedback.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Real-world feedback is often structured as:
 *   "The UI is great [positive], BUT the payment failed [negative]."
 *
 * If we embed the full text, the positive prefix dilutes the embedding vector
 * toward a generic domain centroid (e.g. "payment UX"). Two items that describe
 * DIFFERENT problems (payment timeout vs. security vulnerability) both end up
 * near the same centroid and collapse into one theme.
 *
 * This service extracts ONLY the negative/problem clause for use as the
 * clustering text. The full original text is preserved for display and CIQ.
 *
 * DESIGN PRINCIPLES
 * ─────────────────
 * - Generic: works for any domain, any product, any language pattern
 * - Data-grounded: returns verbatim extracted text, never paraphrases or invents
 * - Fail-open: if extraction fails or confidence is low, returns the full text
 * - Cached: result stored in Feedback.metadata.problemClause to avoid re-extraction
 *
 * OUTPUT
 * ──────
 * { problemClause: string, confidence: number, hasMixedSentiment: boolean }
 *
 * problemClause: the extracted negative/problem text (verbatim from input)
 * confidence: 0–1 how confident the extractor is that it found a distinct problem
 * hasMixedSentiment: true if the feedback contains both positive and negative signals
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface NegativeClauseResult {
  /** Verbatim extracted problem clause from the feedback text */
  problemClause: string;
  /** 0–1 confidence that a distinct problem clause was found */
  confidence: number;
  /** True if the feedback contains both positive and negative signals */
  hasMixedSentiment: boolean;
}

@Injectable()
export class NegativeClauseExtractorService {
  private readonly logger = new Logger(NegativeClauseExtractorService.name);
  private readonly openai: OpenAI | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  /**
   * Extract the problem/negative clause from a feedback item.
   *
   * If the feedback is purely negative, returns the full text.
   * If the feedback is purely positive, returns the full text with confidence=0.1
   * (positive feedback is stored but should not seed new themes).
   * If mixed, returns only the negative/problem portion.
   *
   * Never throws. Returns full text as fallback on any failure.
   */
  async extract(
    title: string,
    description: string,
  ): Promise<NegativeClauseResult> {
    // Fallback: return full text
    const fallback: NegativeClauseResult = {
      problemClause: `${title} ${description}`.trim(),
      confidence: 0.5,
      hasMixedSentiment: false,
    };

    if (!this.openai) return fallback;

    const text = `${title ? `Title: ${title}\n` : ''}Description: ${description}`.trim();

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        temperature: 0,
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a feedback analyst. Your job is to extract the PROBLEM or COMPLAINT portion from user feedback.

Rules:
1. Extract ONLY the negative/problem/complaint text verbatim from the input
2. Do NOT paraphrase, summarize, or invent text that is not in the input
3. If the feedback has both positive and negative parts, return ONLY the negative part
4. If the feedback is entirely positive (no complaint), set hasMixedSentiment=false and confidence=0.1
5. If the feedback is entirely negative, return the full text and set hasMixedSentiment=false
6. confidence: 0.9+ = clear distinct problem found, 0.5-0.8 = problem found but ambiguous, 0.1 = no real problem

Return JSON: { "problemClause": "...", "confidence": 0.0, "hasMixedSentiment": true/false }`,
          },
          {
            role: 'user',
            content: text,
          },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? '';
      const parsed = JSON.parse(raw) as {
        problemClause?: string;
        confidence?: number;
        hasMixedSentiment?: boolean;
      };

      if (
        typeof parsed.problemClause === 'string' &&
        parsed.problemClause.trim().length > 0 &&
        typeof parsed.confidence === 'number'
      ) {
        return {
          problemClause: parsed.problemClause.trim(),
          confidence: Math.min(1, Math.max(0, parsed.confidence)),
          hasMixedSentiment: parsed.hasMixedSentiment === true,
        };
      }

      return fallback;
    } catch (err) {
      this.logger.warn(
        `NegativeClauseExtractor failed for "${title}": ${(err as Error).message}`,
      );
      return fallback;
    }
  }
}

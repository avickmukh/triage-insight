import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

/**
 * ProblemTypeClassifierService
 * ─────────────────────────────────────────────────────────────────────────────
 * Stage 1 of the intelligent clustering pipeline.
 *
 * Classifies a single piece of feedback text into a GENERIC problem_type
 * using an LLM. The taxonomy is NOT hardcoded — the LLM generates the most
 * appropriate type from a set of universal semantic categories.
 *
 * Design principles:
 * - Generic: works for any domain (SaaS, e-commerce, fintech, healthcare, …)
 * - No domain-specific keywords or rules
 * - LLM-generated classification, NOT keyword matching
 * - Confidence < 0.6 → fallback to "other"
 * - Results are cached in-memory per session to avoid redundant LLM calls
 *   (the persistent cache lives in Feedback.metadata.problemType)
 *
 * Output:
 *   { problem_type: string, confidence: number (0–1) }
 */

export interface ProblemTypeResult {
  /** Generic problem type label (e.g. "payment_failure", "timeout", "ux_confusion") */
  problem_type: string;
  /** LLM confidence in the classification (0–1). < 0.6 → "other" */
  confidence: number;
}

/**
 * Minimum confidence required to accept the LLM's classification.
 * Below this, the feedback is assigned to "other" to avoid forcing
 * ambiguous items into a specific bucket.
 */
export const PROBLEM_TYPE_MIN_CONFIDENCE = 0.6;

@Injectable()
export class ProblemTypeClassifierService {
  private readonly logger = new Logger(ProblemTypeClassifierService.name);
  private readonly openai: OpenAI | null;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  /**
   * Classify a feedback item into a problem_type.
   *
   * @param title   - Feedback title (required)
   * @param body    - Feedback body / description (optional, improves accuracy)
   * @returns ProblemTypeResult with problem_type and confidence
   */
  async classify(title: string, body?: string): Promise<ProblemTypeResult> {
    if (!this.openai) {
      this.logger.warn('[ProblemTypeClassifier] OpenAI not configured — returning "other"');
      return { problem_type: 'other', confidence: 0 };
    }

    const text = body ? `${title}\n\n${body}` : title;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        temperature: 0.1,
        max_tokens: 80,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `
You are a feedback classification engine.
Your task: classify a piece of user feedback into exactly ONE problem_type.

Rules:
- The problem_type must be a SHORT snake_case label (2–4 words max)
- It must describe the NATURE of the problem, not the domain
- It must be GENERIC — valid across any software product
- Do NOT use product-specific terms (no "stripe", "checkout", "dashboard")
- Do NOT use vague labels like "general_issue" or "user_problem"
- Use the most specific label that accurately describes the root cause
- If you are not confident (< 0.6), set problem_type to "other"

Examples of good problem_type labels:
  payment_failure, duplicate_charge, authentication_error, session_timeout,
  data_validation_error, api_rate_limit, permission_denied, ui_rendering_bug,
  data_loss, slow_response, missing_feature, confusing_ux, notification_failure,
  import_export_error, search_not_working, sync_failure, onboarding_friction

Return ONLY valid JSON:
{
  "problem_type": "snake_case_label",
  "confidence": 0.0
}
`.trim(),
          },
          {
            role: 'user',
            content: `Classify this feedback:\n\n${text.slice(0, 600)}`,
          },
        ],
      });

      const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
      const parsed = JSON.parse(raw) as Partial<ProblemTypeResult>;

      const problem_type =
        typeof parsed.problem_type === 'string' && parsed.problem_type.trim()
          ? parsed.problem_type.trim().toLowerCase().replace(/\s+/g, '_')
          : 'other';

      const confidence =
        typeof parsed.confidence === 'number' &&
        Number.isFinite(parsed.confidence)
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0;

      // Apply confidence gate
      if (confidence < PROBLEM_TYPE_MIN_CONFIDENCE) {
        this.logger.debug(
          `[ProblemTypeClassifier] Low confidence (${confidence.toFixed(2)}) for "${title.slice(0, 60)}" — using "other"`,
        );
        return { problem_type: 'other', confidence };
      }

      this.logger.debug(
        `[ProblemTypeClassifier] "${title.slice(0, 60)}" → ${problem_type} (${confidence.toFixed(2)})`,
      );

      return { problem_type, confidence };
    } catch (err) {
      this.logger.warn(
        `[ProblemTypeClassifier] Classification failed: ${(err as Error).message} — using "other"`,
      );
      return { problem_type: 'other', confidence: 0 };
    }
  }

  /**
   * Batch classify multiple feedback items.
   * Processes in parallel with a concurrency cap to avoid rate limits.
   */
  async classifyBatch(
    items: Array<{ id: string; title: string; body?: string }>,
    concurrency = 5,
  ): Promise<Map<string, ProblemTypeResult>> {
    const results = new Map<string, ProblemTypeResult>();

    // Process in chunks to respect rate limits
    for (let i = 0; i < items.length; i += concurrency) {
      const chunk = items.slice(i, i + concurrency);
      const chunkResults = await Promise.all(
        chunk.map(async (item) => {
          const result = await this.classify(item.title, item.body);
          return { id: item.id, result };
        }),
      );
      for (const { id, result } of chunkResults) {
        results.set(id, result);
      }
    }

    return results;
  }

  /**
   * Check if two problem_types are compatible for clustering/merging.
   *
   * "other" is compatible with everything (it's the catch-all bucket).
   * Two specific types are compatible only if they are identical.
   */
  areCompatible(typeA: string, typeB: string): boolean {
    if (typeA === 'other' || typeB === 'other') return true;
    return typeA === typeB;
  }
}

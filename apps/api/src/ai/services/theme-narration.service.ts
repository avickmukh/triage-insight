/**
 * ThemeNarrationService — Stage-2 AI Insight Narration
 *
 * Generates three LLM-powered narrative fields for a Theme:
 *
 *   aiSummary        — 2–3 sentence summary of what this theme is about
 *   aiExplanation    — why this theme matters to the business (impact framing)
 *   aiRecommendation — concrete recommended action for the product team
 *   aiConfidence     — 0–1 confidence score based on signal richness
 *
 * Context fed to the LLM:
 *   - Theme title and description
 *   - Up to 8 representative feedback samples (with sentiment)
 *   - Aggregate sentiment (mean across linked feedback)
 *   - Feedback frequency (count)
 *   - Spike signal (urgency score)
 *   - CIQ priority score
 *
 * Model: gpt-4.1-mini — good quality at low cost; narration requires
 * more reasoning than sentiment but does not need gpt-4.1 quality.
 *
 * Failure behaviour:
 *   Returns null so the caller can fall back to a simple rule-based summary.
 *   Never throws — all errors are caught and logged.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface ThemeNarrationInput {
  themeId: string;
  title: string;
  description?: string | null;
  feedbackSamples: Array<{ text: string; sentiment: number | null }>;
  feedbackCount: number;
  avgSentiment: number | null;
  priorityScore: number | null;
  urgencyScore: number | null;
}

export interface ThemeNarrationOutput {
  summary: string;
  explanation: string;
  recommendation: string;
  confidence: number;
}

@Injectable()
export class ThemeNarrationService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(ThemeNarrationService.name);

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY', ''),
    });
  }

  /**
   * Generate AI narration for a theme.
   * Returns null on any failure so the pipeline can apply a fallback.
   */
  async narrate(input: ThemeNarrationInput): Promise<ThemeNarrationOutput | null> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    if (!apiKey) {
      this.logger.warn(`[${input.themeId}] OPENAI_API_KEY not set — skipping narration`);
      return null;
    }

    try {
      const prompt = this.buildPrompt(input);
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a product intelligence analyst. You analyse customer feedback themes ' +
              'and produce concise, actionable insights for product teams. ' +
              'Return ONLY a JSON object — no markdown, no explanation, no extra text.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 400,
        response_format: { type: 'json_object' },
      });

      const raw = response.choices[0].message.content?.trim() ?? '{}';
      const parsed = JSON.parse(raw) as Partial<ThemeNarrationOutput>;

      const summary        = typeof parsed.summary        === 'string' ? parsed.summary.trim()        : '';
      const explanation    = typeof parsed.explanation    === 'string' ? parsed.explanation.trim()    : '';
      const recommendation = typeof parsed.recommendation === 'string' ? parsed.recommendation.trim() : '';
      const confidence     = typeof parsed.confidence     === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0;

      if (!summary || !explanation || !recommendation) {
        this.logger.warn(`[${input.themeId}] Narration response missing required fields — raw: ${raw.slice(0, 200)}`);
        return null;
      }

      return { summary, explanation, recommendation, confidence };
    } catch (err) {
      this.logger.warn(`[${input.themeId}] Narration failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Build the user-facing prompt from the theme context.
   * Kept under ~600 tokens to stay well within the model's context budget.
   */
  private buildPrompt(input: ThemeNarrationInput): string {
    const sentimentLabel =
      input.avgSentiment == null
        ? 'unknown'
        : input.avgSentiment >= 0.3
        ? 'positive'
        : input.avgSentiment <= -0.3
        ? 'negative'
        : 'neutral';

    const samples = input.feedbackSamples
      .slice(0, 8)
      .map((s, i) => `${i + 1}. "${s.text.slice(0, 200)}"`)
      .join('\n');

    return `
Theme: "${input.title}"
${input.description ? `Description: ${input.description}` : ''}

Signal summary:
- Feedback count: ${input.feedbackCount}
- Average sentiment: ${sentimentLabel} (${input.avgSentiment?.toFixed(2) ?? 'n/a'})
- CIQ priority score: ${input.priorityScore != null ? `${Math.round(input.priorityScore * 100)}%` : 'not scored'}
- Urgency score: ${input.urgencyScore != null ? `${Math.round(input.urgencyScore)}/100` : 'n/a'}

Representative feedback samples:
${samples || '(no feedback samples available)'}

Return a JSON object with exactly these keys:
{
  "summary": "2-3 sentence summary of what this theme is about",
  "explanation": "1-2 sentences explaining why this theme matters to the business (use the signal data)",
  "recommendation": "1 concrete recommended action for the product team",
  "confidence": <float 0-1 reflecting how confident you are given the signal richness>
}
`.trim();
  }

  /**
   * Fallback narration when the LLM call fails or returns incomplete data.
   * Rule-based, deterministic, never throws.
   */
  buildFallback(input: ThemeNarrationInput): ThemeNarrationOutput {
    const sentimentLabel =
      input.avgSentiment == null
        ? 'mixed'
        : input.avgSentiment >= 0.3
        ? 'positive'
        : input.avgSentiment <= -0.3
        ? 'negative'
        : 'neutral';

    const summary = `"${input.title}" has ${input.feedbackCount} signal${input.feedbackCount !== 1 ? 's' : ''} with ${sentimentLabel} sentiment.${input.description ? ` ${input.description}` : ''}`;

    const explanation =
      input.priorityScore != null && input.priorityScore >= 0.5
        ? `This is a high-priority theme (CIQ score: ${Math.round(input.priorityScore * 100)}%) that warrants immediate attention.`
        : `This theme is accumulating customer signals and may require product team review.`;

    const recommendation =
      input.urgencyScore != null && input.urgencyScore >= 60
        ? `Escalate to the product team immediately — urgency score is ${Math.round(input.urgencyScore)}/100.`
        : `Review the linked feedback and consider adding this theme to the roadmap.`;

    return {
      summary,
      explanation,
      recommendation,
      confidence: 0.3, // low confidence for rule-based fallback
    };
  }
}

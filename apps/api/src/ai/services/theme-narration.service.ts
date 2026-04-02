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
  private readonly logger = new Logger(ThemeNarrationService.name);
  private readonly openai: OpenAI | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey =  this.configService.get<string>('OPENAI_API_KEY', '');

    // Keep service alive even when AI is disabled.
    // This avoids boot failure in local/dev/test environments.
    this.openai = apiKey
      ? new OpenAI({ apiKey })
      : null;
  }

  /**
   * Generates AI narration for a feedback theme.
   *
   * Output fields:
   * - summary: what users are saying
   * - explanation: why it matters to the business
   * - recommendation: one concrete next step
   * - confidence: how trustworthy the narration is, based on signal quality
   *
   * Important behavior:
   * - Never throws
   * - Returns null on any failure
   * - Caller can use buildFallback() when AI is unavailable or response is invalid
   */
  async narrate(input: ThemeNarrationInput): Promise<ThemeNarrationOutput | null> {
    if (!this.openai) {
      this.logger.warn(`[${input.themeId}] OPENAI_API_KEY not set — skipping narration`);
      return null;
    }

    try {
      const messages = this.buildMessages(input);

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        temperature: 0.2, // lower temperature = better consistency, less creative drift
        max_tokens: 450,
        response_format: { type: 'json_object' },
        messages,
      });

      const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
      const parsed = JSON.parse(raw) as Partial<ThemeNarrationOutput>;

      const summary =
        typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
      const explanation =
        typeof parsed.explanation === 'string' ? parsed.explanation.trim() : '';
      const recommendation =
        typeof parsed.recommendation === 'string' ? parsed.recommendation.trim() : '';

      let confidence =
        typeof parsed.confidence === 'number' ? parsed.confidence : NaN;

      // Clamp confidence if the model returns a valid number outside range.
      if (Number.isFinite(confidence)) {
        confidence = Math.max(0, Math.min(1, confidence));
      }

      // Reject incomplete outputs so caller can use deterministic fallback.
      if (!summary || !explanation || !recommendation || !Number.isFinite(confidence)) {
        this.logger.warn(
          `[${input.themeId}] Narration response missing required fields — raw: ${raw.slice(0, 300)}`,
        );
        return null;
      }

      // Optional guardrail:
      // if the model returned an implausibly low confidence for a high-signal theme,
      // gently correct it upward to a reasonable minimum.
      confidence = this.applyConfidenceGuardrail(input, confidence);

      return {
        summary,
        explanation,
        recommendation,
        confidence,
      };
    } catch (err) {
      this.logger.warn(
        `[${input.themeId}] Narration failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Builds the chat messages sent to the LLM.
   *
   * Design goals:
   * - Reduce hallucination by explicitly prohibiting assumptions
   * - Increase consistency by forcing structure and signal-based reasoning
   * - Keep token usage reasonable
   */
  private buildMessages(input: ThemeNarrationInput): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const sentimentLabel = this.getSentimentLabel(input.avgSentiment);

    const samples = this.buildRepresentativeSamples(input.feedbackSamples);

    const systemPrompt = `
You are a senior product intelligence analyst.

Your job is to analyze a customer feedback theme STRICTLY using only the data provided.

Rules:
- Do NOT hallucinate, infer hidden causes, or assume facts not present in the input
- Ground every output in the provided signals: feedback count, sentiment, CIQ, urgency, and feedback samples
- Be concise, factual, and specific
- Avoid generic statements unless the data is weak
- If signal quality is weak or mixed, explicitly reflect that uncertainty
- Do NOT mention "the provided data" or "the input says" in the final answer
- Do NOT use markdown
- Return valid JSON only
`.trim();

    const userPrompt = `
Analyze this feedback theme.

Theme title: "${input.title}"
${input.description ? `Theme description: "${input.description}"` : 'Theme description: not available'}

Signal summary:
- Feedback count: ${input.feedbackCount}
- Average sentiment: ${sentimentLabel} (${input.avgSentiment?.toFixed(2) ?? 'n/a'})
- CIQ priority score: ${input.priorityScore != null ? `${Math.round(input.priorityScore * 100)}%` : 'not available'}
- Urgency score: ${input.urgencyScore != null ? `${Math.round(input.urgencyScore)}/100` : 'not available'}

Representative feedback samples:
${samples}

Instructions:

1. summary
- Write 2-3 sentences
- Explain the core issue or pattern users are reporting
- Mention scale only when justified by feedback count
- Use the samples as evidence, not imagination

2. explanation
- Write 1-2 sentences
- Explain why this matters to the business
- Reference the actual signals where useful:
  - CIQ high => stronger business importance
  - negative sentiment => dissatisfaction / trust / friction risk
  - urgency high => near-term attention needed
- Do not invent revenue or churn claims unless strongly implied by the theme itself

3. recommendation
- Write exactly one concrete action
- It must be practical for product/engineering
- Avoid vague advice like "improve experience" or "investigate the issue"

4. confidence
- Return a float from 0 to 1
- Base it ONLY on signal strength and consistency
- Use this guidance:
  - 0.80 to 1.00 => strong signal: high count and/or highly consistent samples and sentiment
  - 0.50 to 0.79 => moderate signal: enough evidence but some ambiguity or mixed signals
  - 0.00 to 0.49 => weak signal: low count, unclear samples, or sparse metadata

5. consistency rules
- summary, explanation, and recommendation must not repeat the same wording
- Keep language direct and product-facing
- Do not output anything except the JSON object

Return exactly this JSON shape:
{
  "summary": "string",
  "explanation": "string",
  "recommendation": "string",
  "confidence": 0.0
}
`.trim();

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
  }

  /**
   * Converts sentiment score into a simple label for readability in prompt.
   */
  private getSentimentLabel(avgSentiment: number | null): 'positive' | 'negative' | 'neutral' | 'unknown' {
    if (avgSentiment == null) return 'unknown';
    if (avgSentiment >= 0.3) return 'positive';
    if (avgSentiment <= -0.3) return 'negative';
    return 'neutral';
  }

  /**
   * Selects and truncates representative samples.
   *
   * Why only a few?
   * - Reduces token cost
   * - Keeps signal focused
   * - Prevents the model from drifting into long narrative behavior
   */
  private buildRepresentativeSamples(
    feedbackSamples: Array<{ text: string; sentiment: number | null }>,
  ): string {
    if (!feedbackSamples.length) {
      return '(no feedback samples available)';
    }

    return feedbackSamples
      .slice(0, 8)
      .map((sample, index) => {
        const sentiment =
          sample.sentiment == null
            ? 'unknown'
            : sample.sentiment >= 0.3
            ? 'positive'
            : sample.sentiment <= -0.3
            ? 'negative'
            : 'neutral';

        return `${index + 1}. [${sentiment}] "${sample.text.slice(0, 220)}"`;
      })
      .join('\n');
  }

  /**
   * Applies a light post-LLM correction to confidence.
   *
   * This is useful because LLM confidence can be noisy even with a good prompt.
   * We do NOT replace model confidence completely; we only correct obviously
   * inconsistent values for strong-signal cases.
   */
  private applyConfidenceGuardrail(
    input: ThemeNarrationInput,
    modelConfidence: number,
  ): number {
    const strongCount = input.feedbackCount >= 20;
    const hasSentiment = input.avgSentiment != null;
    const hasPriority = input.priorityScore != null;
    const hasUrgency = input.urgencyScore != null;

    const metadataRichness =
      Number(hasSentiment) + Number(hasPriority) + Number(hasUrgency);

    // Strong theme but model returned unusually low confidence.
    if (strongCount && metadataRichness >= 2 && modelConfidence < 0.45) {
      return 0.6;
    }

    // Very weak theme but model returned unrealistically high confidence.
    if (input.feedbackCount <= 2 && metadataRichness <= 1 && modelConfidence > 0.75) {
      return 0.45;
    }

    return modelConfidence;
  }

  /**
   * Deterministic fallback used when AI call fails or response is invalid.
   *
   * This is intentionally simple and reliable.
   * It ensures UI still has usable narration even when the LLM is unavailable.
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

    const summary =
      `"${input.title}" has ${input.feedbackCount} signal${input.feedbackCount !== 1 ? 's' : ''}` +
      ` with ${sentimentLabel} sentiment.` +
      `${input.description ? ` ${input.description}` : ''}`;

    const explanation =
      input.priorityScore != null && input.priorityScore >= 0.5
        ? `This theme has meaningful business importance based on its CIQ score of ${Math.round(input.priorityScore * 100)}% and should be reviewed promptly.`
        : `This theme is showing repeated customer signals and should be monitored by the product team.`;

    const recommendation =
      input.urgencyScore != null && input.urgencyScore >= 60
        ? `Escalate this theme for near-term product and engineering review because the urgency score is ${Math.round(input.urgencyScore)}/100.`
        : `Review the linked feedback, validate the pattern, and consider whether it should be promoted into roadmap planning.`;

    return {
      summary,
      explanation,
      recommendation,
      confidence: 0.3,
    };
  }
}
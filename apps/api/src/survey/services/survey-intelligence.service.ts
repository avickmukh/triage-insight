import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

// ─── Output types ─────────────────────────────────────────────────────────────

export interface TextAnswerIntelligence {
  /** One-sentence title for the derived feedback item */
  title: string;
  /** 2-3 sentence summary of the answer */
  summary: string;
  /** Sentiment in [-1, 1] */
  sentiment: number;
  /** Confidence in [0, 1] */
  confidenceScore: number;
  /** Key product topics extracted */
  keyTopics: string[];
  /** Pain points if any */
  painPoints: string[];
  /** Feature requests if any */
  featureRequests: string[];
}

export interface NumericSignal {
  /** Normalised value in [0, 1] — 1 = most positive */
  normalisedValue: number;
  /** Sentiment equivalent in [-1, 1] */
  sentimentEquivalent: number;
  /** Human-readable label, e.g. "NPS Promoter" */
  label: string;
  /** Raw numeric value */
  rawValue: number;
}

export interface SurveyResponseIntelligence {
  /** Per-text-answer intelligence */
  textInsights: TextAnswerIntelligence[];
  /** Per-numeric-answer signals (rating / NPS) */
  numericSignals: NumericSignal[];
  /** Aggregate sentiment across all signals in [-1, 1] */
  aggregateSentiment: number;
  /** Aggregate confidence in [0, 1] */
  aggregateConfidence: number;
  /** All key topics merged and deduplicated */
  keyTopics: string[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class SurveyIntelligenceService {
  private readonly logger = new Logger(SurveyIntelligenceService.name);
  private readonly openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
    });
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Extract intelligence from a set of survey answers.
   *
   * @param answers  Array of { questionLabel, questionType, textValue, numericValue, choiceValues }
   * @param surveyTitle  Used as context for the LLM prompt
   */
  async extractFromAnswers(
    answers: Array<{
      questionLabel: string;
      questionType: string;
      textValue?: string | null;
      numericValue?: number | null;
      choiceValues?: unknown;
    }>,
    surveyTitle: string,
  ): Promise<SurveyResponseIntelligence> {
    const textAnswers = answers.filter(
      (a) => (a.questionType === 'SHORT_TEXT' || a.questionType === 'LONG_TEXT') &&
              a.textValue && a.textValue.trim().length > 5,
    );
    const numericAnswers = answers.filter(
      (a) => (a.questionType === 'RATING' || a.questionType === 'NPS') &&
              a.numericValue != null,
    );

    // Process text and numeric answers in parallel
    const [textInsights, numericSignals] = await Promise.all([
      this.extractTextInsights(textAnswers, surveyTitle),
      Promise.resolve(numericAnswers.map((a) => this.numericToSignal(a.numericValue!, a.questionType, a.questionLabel))),
    ]);

    // Aggregate sentiment: weighted average of text sentiments and numeric signals
    const allSentiments = [
      ...textInsights.map((t) => ({ value: t.sentiment, weight: t.confidenceScore })),
      ...numericSignals.map((n) => ({ value: n.sentimentEquivalent, weight: 0.5 })),
    ];
    const aggregateSentiment = allSentiments.length > 0
      ? allSentiments.reduce((sum, s) => sum + s.value * s.weight, 0) /
        allSentiments.reduce((sum, s) => sum + s.weight, 0)
      : 0;

    const aggregateConfidence = textInsights.length > 0
      ? textInsights.reduce((sum, t) => sum + t.confidenceScore, 0) / textInsights.length
      : numericSignals.length > 0 ? 0.4 : 0.1;

    // Merge key topics
    const allTopics = textInsights.flatMap((t) => t.keyTopics);
    const keyTopics = [...new Set(allTopics)].slice(0, 8);

    return {
      textInsights,
      numericSignals,
      aggregateSentiment: this.clamp(aggregateSentiment, -1, 1),
      aggregateConfidence: this.clamp(aggregateConfidence, 0, 1),
      keyTopics,
    };
  }

  /**
   * Convert a numeric rating/NPS value to a normalised signal.
   * Deterministic — no LLM call needed.
   *
   * Rating scale: assumes 1–5 unless the value > 5 (then assumes 1–10 NPS-style).
   * NPS scale: 0–10.
   */
  numericToSignal(value: number, questionType: string, questionLabel: string): NumericSignal {
    if (questionType === 'NPS') {
      // NPS: 0–10. Detractors 0-6, Passives 7-8, Promoters 9-10
      const normalised = value / 10;
      const sentiment = value <= 6 ? -0.5 + (value / 6) * 0.3 :
                        value <= 8 ? 0.1 + ((value - 7) / 2) * 0.3 :
                                     0.5 + ((value - 9) / 1) * 0.5;
      const label = value <= 6 ? `NPS Detractor (${value})` :
                    value <= 8 ? `NPS Passive (${value})` :
                                 `NPS Promoter (${value})`;
      return { normalisedValue: normalised, sentimentEquivalent: this.clamp(sentiment, -1, 1), label, rawValue: value };
    }

    // RATING: assume 1–5 scale
    const maxRating = value > 5 ? 10 : 5;
    const normalised = (value - 1) / (maxRating - 1);
    const sentiment = (normalised - 0.5) * 2; // maps [0,1] → [-1,1]
    const label = `${questionLabel}: ${value}/${maxRating}`;
    return { normalisedValue: normalised, sentimentEquivalent: this.clamp(sentiment, -1, 1), label, rawValue: value };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async extractTextInsights(
    textAnswers: Array<{ questionLabel: string; textValue?: string | null }>,
    surveyTitle: string,
  ): Promise<TextAnswerIntelligence[]> {
    if (textAnswers.length === 0) return [];

    // Combine all text answers into a single prompt to reduce API calls
    const combined = textAnswers
      .map((a) => `Question: ${a.questionLabel}\nAnswer: ${a.textValue!.trim()}`)
      .join('\n\n---\n\n');

    const systemPrompt = `You are a product intelligence analyst. You receive customer survey responses.
Extract structured product intelligence from the answers.
Respond ONLY with a valid JSON array. Each element corresponds to one Q&A pair in order.
Each element must match this schema:
{
  "title": "<one-sentence title>",
  "summary": "<2-3 sentence summary>",
  "sentiment": <float -1.0 to 1.0>,
  "confidenceScore": <float 0.0 to 1.0>,
  "keyTopics": ["<topic>"],
  "painPoints": ["<pain point>"],
  "featureRequests": ["<feature request>"]
}
Rules:
- sentiment: -1 = very negative, 0 = neutral, +1 = very positive
- confidenceScore: 0 = vague/off-topic, 1 = clear and specific product feedback
- painPoints: max 3 per answer, empty array if none
- featureRequests: max 3 per answer, empty array if none
- keyTopics: max 4 per answer
- Do not invent information not present in the answer`;

    const userPrompt = `Survey: "${surveyTitle}"\n\n${combined}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
      });

      const raw = response.choices[0].message.content?.trim() ?? '{}';
      // The model may return { "results": [...] } or just [...]
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = {};
      }

      // Normalise to array
      let arr: unknown[];
      if (Array.isArray(parsed)) {
        arr = parsed;
      } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).results)) {
        arr = (parsed as any).results;
      } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).answers)) {
        arr = (parsed as any).answers;
      } else {
        // Single object — wrap it
        arr = [parsed];
      }

      return textAnswers.map((a, i) => this.normaliseTextResult(arr[i], a.questionLabel));
    } catch (err) {
      this.logger.error(`Survey text intelligence extraction failed: ${(err as Error).message}`);
      return textAnswers.map((a) => this.fallbackTextResult(a.questionLabel, a.textValue ?? ''));
    }
  }

  private normaliseTextResult(raw: unknown, questionLabel: string): TextAnswerIntelligence {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return {
      title: typeof r.title === 'string' && r.title.trim().length > 0 ? r.title.trim() : questionLabel,
      summary: typeof r.summary === 'string' && r.summary.trim().length > 0 ? r.summary.trim() : '',
      sentiment: this.clamp(typeof r.sentiment === 'number' ? r.sentiment : 0, -1, 1),
      confidenceScore: this.clamp(typeof r.confidenceScore === 'number' ? r.confidenceScore : 0.3, 0, 1),
      keyTopics: this.toStringArray(r.keyTopics, 4),
      painPoints: this.toStringArray(r.painPoints, 3),
      featureRequests: this.toStringArray(r.featureRequests, 3),
    };
  }

  private fallbackTextResult(questionLabel: string, text: string): TextAnswerIntelligence {
    return {
      title: questionLabel,
      summary: text.slice(0, 200),
      sentiment: 0,
      confidenceScore: 0.2,
      keyTopics: [],
      painPoints: [],
      featureRequests: [],
    };
  }

  private toStringArray(value: unknown, maxItems: number): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .slice(0, maxItems)
      .map((v) => v.trim());
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}

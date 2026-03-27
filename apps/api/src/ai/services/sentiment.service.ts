/**
 * SentimentService
 *
 * Analyses the sentiment of a piece of feedback text and returns a normalised
 * score in the range [-1, +1]:
 *
 *   -1.0  very negative (angry, frustrated, churning)
 *    0.0  neutral (factual, no emotional signal)
 *   +1.0  very positive (delighted, enthusiastic)
 *
 * The score is persisted on Feedback.sentiment and consumed by CiqService for:
 *   - sentimentPenalty  — reduces theme CIQ score when feedback is predominantly negative
 *   - sentimentUrgency  — increases urgency score for individual feedback items
 *   - confidence        — higher confidence when sentiment is available
 *
 * Implementation notes:
 *   - Uses gpt-4.1-nano (cheapest, fastest model) — sentiment is a simple
 *     classification task that does not require a large context window.
 *   - The model is instructed to return ONLY a JSON object so the response
 *     can be parsed without fragile string manipulation.
 *   - If the API call fails for any reason the caller should fall back to 0
 *     (neutral) so the rest of the pipeline is not interrupted.
 */
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/** Shape of the JSON the model is asked to return. */
interface SentimentResponse {
  score: number;
}

@Injectable()
export class SentimentService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(SentimentService.name);

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY', ''),
    });
  }

  /**
   * Analyse the sentiment of `text` and return a score in [-1, +1].
   *
   * Throws `ServiceUnavailableException` when `OPENAI_API_KEY` is not set
   * so the processor can catch it and fall back to neutral (0) without
   * breaking the rest of the pipeline.
   */
  async analyseSentiment(text: string): Promise<number> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'AI features are not configured. Set OPENAI_API_KEY to enable sentiment analysis.',
      );
    }

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4.1-nano',
      messages: [
        {
          role: 'system',
          content:
            'You are a sentiment analysis assistant. ' +
            'Analyse the sentiment of the user feedback provided and return ONLY a JSON object ' +
            'with a single key "score" whose value is a floating-point number between -1.0 (very negative) ' +
            'and +1.0 (very positive), where 0.0 is neutral. ' +
            'Do not include any explanation, markdown, or extra text — only the JSON object.',
        },
        {
          role: 'user',
          content: `Feedback:\n"""\n${text.slice(0, 2000)}\n"""`,
        },
      ],
      temperature: 0,
      max_tokens: 20,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0].message.content?.trim() ?? '{"score":0}';

    let parsed: SentimentResponse;
    try {
      parsed = JSON.parse(raw) as SentimentResponse;
    } catch {
      this.logger.warn(`Sentiment response could not be parsed: ${raw} — defaulting to 0`);
      return 0;
    }

    const score = parsed.score;
    if (typeof score !== 'number' || isNaN(score)) {
      this.logger.warn(`Sentiment score is not a number: ${String(score)} — defaulting to 0`);
      return 0;
    }

    // Clamp to [-1, +1] in case the model drifts slightly outside the range
    return Math.max(-1, Math.min(1, score));
  }
}

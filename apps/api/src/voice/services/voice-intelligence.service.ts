import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/**
 * Structured intelligence extracted from a voice transcript.
 * All fields are derived from the transcript text via GPT-4.1-mini.
 * No schema changes required — this is stored in Feedback.metadata and AiJobLog.output.
 */
export interface VoiceIntelligenceResult {
  /** 2–4 sentence summary of the call / recording. */
  summary: string;
  /** Key pain points mentioned by the speaker (max 5). */
  painPoints: string[];
  /** Feature requests or product improvements requested (max 5). */
  featureRequests: string[];
  /** Key topics / themes detected (max 5). */
  keyTopics: string[];
  /**
   * Sentiment score in [-1, 1].
   *   -1 = strongly negative, 0 = neutral, +1 = strongly positive.
   */
  sentiment: number;
  /**
   * Confidence score in [0, 1].
   * Reflects how much actionable product signal was detected.
   * Low confidence = vague or off-topic recording.
   */
  confidenceScore: number;
  /** One-sentence title suitable for use as the Feedback.title. */
  title: string;
}

@Injectable()
export class VoiceIntelligenceService {
  private readonly logger = new Logger(VoiceIntelligenceService.name);
  private readonly openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
    });
  }

  /**
   * Extract structured product intelligence from a voice transcript.
   *
   * Uses GPT-4.1-mini with a JSON-mode response to ensure parseable output.
   * Falls back to safe defaults if the model returns malformed JSON.
   */
  async extractIntelligence(
    transcript: string,
    label?: string,
  ): Promise<VoiceIntelligenceResult> {
    const systemPrompt = `You are a product intelligence analyst. You receive raw transcripts from customer calls, user interviews, or voice recordings.

Your job is to extract structured product intelligence from the transcript.

Respond ONLY with a valid JSON object matching this exact schema:
{
  "title": "<one-sentence title for this feedback item>",
  "summary": "<2-4 sentence summary of the main topics discussed>",
  "painPoints": ["<pain point 1>", "<pain point 2>"],
  "featureRequests": ["<feature request 1>", "<feature request 2>"],
  "keyTopics": ["<topic 1>", "<topic 2>"],
  "sentiment": <float between -1.0 and 1.0>,
  "confidenceScore": <float between 0.0 and 1.0>
}

Rules:
- painPoints: specific problems, frustrations, or blockers mentioned (max 5, empty array if none)
- featureRequests: explicit or implicit product improvement requests (max 5, empty array if none)
- keyTopics: high-level product areas or themes (max 5)
- sentiment: -1 = very negative, 0 = neutral, +1 = very positive
- confidenceScore: 0 = no actionable signal, 1 = very clear and specific product feedback
- Do not invent information not present in the transcript
- If the transcript is too short or unclear, set confidenceScore below 0.3`;

    const userPrompt = label
      ? `Label: ${label}\n\nTranscript:\n"""\n${transcript}\n"""`
      : `Transcript:\n"""\n${transcript}\n"""`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      });

      const raw = response.choices[0].message.content?.trim() ?? '{}';
      const parsed = JSON.parse(raw) as Partial<VoiceIntelligenceResult>;

      return this.normalizeResult(parsed, transcript, label);
    } catch (err) {
      this.logger.error(
        `Voice intelligence extraction failed: ${(err as Error).message}`,
      );
      // Return a safe fallback so the pipeline doesn't break
      return this.fallbackResult(transcript, label);
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private normalizeResult(
    parsed: Partial<VoiceIntelligenceResult>,
    transcript: string,
    label?: string,
  ): VoiceIntelligenceResult {
    return {
      title:
        typeof parsed.title === 'string' && parsed.title.trim().length > 0
          ? parsed.title.trim()
          : label ?? 'Voice Feedback',
      summary:
        typeof parsed.summary === 'string' && parsed.summary.trim().length > 0
          ? parsed.summary.trim()
          : `Voice recording: ${transcript.slice(0, 200)}…`,
      painPoints: this.toStringArray(parsed.painPoints, 5),
      featureRequests: this.toStringArray(parsed.featureRequests, 5),
      keyTopics: this.toStringArray(parsed.keyTopics, 5),
      sentiment: this.clamp(
        typeof parsed.sentiment === 'number' ? parsed.sentiment : 0,
        -1,
        1,
      ),
      confidenceScore: this.clamp(
        typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : 0.5,
        0,
        1,
      ),
    };
  }

  private fallbackResult(transcript: string, label?: string): VoiceIntelligenceResult {
    return {
      title: label ?? 'Voice Feedback',
      summary: `Voice recording transcript (${transcript.length} characters). Manual review recommended.`,
      painPoints: [],
      featureRequests: [],
      keyTopics: [],
      sentiment: 0,
      confidenceScore: 0.2,
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

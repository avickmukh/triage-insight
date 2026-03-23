import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
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

// ─── Revenue-weighted intelligence types ─────────────────────────────────────

export interface ResponseCluster {
  label: string;
  count: number;
  avgSentiment: number;
  totalArr: number;
  representativeTopics: string[];
  churnRiskSignal: boolean;
}

export interface RevenueWeightedInsight {
  validationScore: number;
  revenueWeightedScore: number;
  totalRespondentArr: number;
  promoterArr: number;
  detractorArr: number;
  churnRiskArr: number;
  churnRiskCount: number;
  clusters: ResponseCluster[];
  topFeatureRequests: Array<{ request: string; arrWeight: number; count: number }>;
  topPainPoints: Array<{ point: string; arrWeight: number; count: number }>;
  confidence: number;
  executiveSummary: string | null;
  churnSignals: Array<{
    customerId: string;
    customerName: string;
    arrValue: number;
    signal: string;
    severity: 'low' | 'medium' | 'high';
  }>;
}

export interface SurveyIntelligenceResult {
  surveyId: string;
  totalResponses: number;
  processedCount: number;
  avgSentiment: number | null;
  avgNps: number | null;
  avgRating: number | null;
  npsScore: number | null;
  linkedThemeIds: string[];
  keyTopics: string[];
  npsResponseCount: number;
  ratingResponseCount: number;
  textResponseCount: number;
  insightScore: number | null;
  sentimentDistribution: { positive: number; neutral: number; negative: number } | null;
  topFeatureRequests: string[];
  topPainPoints: string[];
  revenueWeighted: RevenueWeightedInsight | null;
  surveyType: string;
  validationScore: number | null;
  revenueWeightedScore: number | null;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class SurveyIntelligenceService {
  private readonly logger = new Logger(SurveyIntelligenceService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY', ''),
    });
  }

  // ─── Revenue-weighted survey intelligence ─────────────────────────────────

  async computeRevenueWeightedIntelligence(
    workspaceId: string,
    surveyId: string,
  ): Promise<RevenueWeightedInsight> {
    const responses = await this.prisma.surveyResponse.findMany({
      where: { surveyId, workspaceId },
      select: {
        id: true,
        customerId: true,
        sentimentScore: true,
        metadata: true,
        answers: {
          select: {
            numericValue: true,
            textValue: true,
            question: { select: { type: true, label: true } },
          },
        },
        customer: {
          select: { id: true, name: true, arrValue: true, segment: true, churnRisk: true },
        },
      },
    });

    if (responses.length === 0) return this.emptyRevenueWeightedInsight();

    const totalArr = responses.reduce((sum, r) => sum + (r.customer?.arrValue ?? 0), 0);
    const avgArr = totalArr / responses.length;

    const classified = responses.map((r) => {
      const npsAnswer = r.answers.find((a) => a.question.type === 'NPS');
      const npsVal = npsAnswer?.numericValue ?? null;
      const sentiment = r.sentimentScore ?? 0;
      const arr = r.customer?.arrValue ?? avgArr * 0.5;
      const isPromoter = npsVal != null ? npsVal >= 9 : sentiment > 0.3;
      const isDetractor = npsVal != null ? npsVal <= 6 : sentiment < -0.3;
      const churnRisk = isDetractor && arr > 0;
      const meta = (r.metadata ?? {}) as Record<string, any>;
      const intel = meta.intelligence ?? {};
      return {
        responseId: r.id,
        customerId: r.customerId,
        customerName: r.customer?.name ?? 'Anonymous',
        arr,
        sentiment,
        npsVal,
        isPromoter,
        isDetractor,
        churnRisk,
        churnRiskSeverity: this.churnSeverity(arr, sentiment),
        keyTopics: Array.isArray(intel.keyTopics) ? intel.keyTopics as string[] : [],
        featureRequests: Array.isArray(intel.featureRequests) ? intel.featureRequests as string[] : [],
        painPoints: Array.isArray(intel.painPoints) ? intel.painPoints as string[] : [],
        segment: r.customer?.segment ?? null,
      };
    });

    const promoterArr = classified.filter((r) => r.isPromoter).reduce((s, r) => s + r.arr, 0);
    const detractorArr = classified.filter((r) => r.isDetractor).reduce((s, r) => s + r.arr, 0);
    const churnRiskArr = classified.filter((r) => r.churnRisk).reduce((s, r) => s + r.arr, 0);
    const churnRiskCount = classified.filter((r) => r.churnRisk).length;
    const totalRespondentArr = classified.reduce((s, r) => s + r.arr, 0);

    const revenueWeightedScore = totalRespondentArr > 0
      ? Math.round(((promoterArr - detractorArr * 0.5) / totalRespondentArr) * 50 + 50)
      : 50;

    const avgSentiment = classified.reduce((s, r) => s + r.sentiment, 0) / classified.length;
    const volumeScore = Math.min(100, classified.length * 5);
    const sentimentScore = ((avgSentiment + 1) / 2) * 100;
    const validationScore = Math.round(
      volumeScore * 0.3 + sentimentScore * 0.4 + this.clamp(revenueWeightedScore, 0, 100) * 0.3,
    );

    const clusters = this.clusterResponses(classified);

    const featureMap = new Map<string, { arrWeight: number; count: number }>();
    const painMap = new Map<string, { arrWeight: number; count: number }>();
    for (const r of classified) {
      for (const fr of r.featureRequests) {
        const e = featureMap.get(fr) ?? { arrWeight: 0, count: 0 };
        featureMap.set(fr, { arrWeight: e.arrWeight + r.arr, count: e.count + 1 });
      }
      for (const pp of r.painPoints) {
        const e = painMap.get(pp) ?? { arrWeight: 0, count: 0 };
        painMap.set(pp, { arrWeight: e.arrWeight + r.arr, count: e.count + 1 });
      }
    }
    const topFeatureRequests = [...featureMap.entries()]
      .sort((a, b) => b[1].arrWeight - a[1].arrWeight).slice(0, 5)
      .map(([request, v]) => ({ request, arrWeight: Math.round(v.arrWeight), count: v.count }));
    const topPainPoints = [...painMap.entries()]
      .sort((a, b) => b[1].arrWeight - a[1].arrWeight).slice(0, 5)
      .map(([point, v]) => ({ point, arrWeight: Math.round(v.arrWeight), count: v.count }));

    const churnSignals = classified
      .filter((r) => r.churnRisk && r.customerId)
      .sort((a, b) => b.arr - a.arr).slice(0, 5)
      .map((r) => ({
        customerId: r.customerId!,
        customerName: r.customerName,
        arrValue: Math.round(r.arr),
        signal: r.npsVal != null ? `NPS ${r.npsVal} — detractor` : `Negative sentiment (${r.sentiment.toFixed(2)})`,
        severity: r.churnRiskSeverity,
      }));

    const confidence = this.clamp(
      (classified.length / 20) * 0.4 + (totalRespondentArr > 0 ? 0.4 : 0) + (clusters.length > 1 ? 0.2 : 0),
      0, 1,
    );

    let executiveSummary: string | null = null;
    try {
      executiveSummary = await this.generateExecutiveSummary({
        totalResponses: classified.length, avgSentiment, revenueWeightedScore, validationScore,
        churnRiskCount, churnRiskArr,
        topFeatureRequests: topFeatureRequests.map((f) => f.request),
        topPainPoints: topPainPoints.map((p) => p.point),
        clusters,
      });
    } catch (err) {
      this.logger.warn(`Executive summary generation failed: ${(err as Error).message}`);
    }

    return {
      validationScore, revenueWeightedScore: this.clamp(revenueWeightedScore, 0, 100),
      totalRespondentArr: Math.round(totalRespondentArr),
      promoterArr: Math.round(promoterArr), detractorArr: Math.round(detractorArr),
      churnRiskArr: Math.round(churnRiskArr), churnRiskCount,
      clusters, topFeatureRequests, topPainPoints, confidence, executiveSummary, churnSignals,
    };
  }

  async persistIntelligenceScores(surveyId: string, insight: RevenueWeightedInsight): Promise<void> {
    await this.prisma.survey.update({
      where: { id: surveyId },
      data: {
        revenueWeightedScore: insight.revenueWeightedScore,
        validationScore: insight.validationScore,
        responseClusterSummary: insight.clusters as any,
      },
    });
  }

  async updateResponseRevenueWeight(
    responseId: string, arrValue: number, totalSurveyArr: number, clusterLabel: string | null,
  ): Promise<void> {
    const revenueWeight = totalSurveyArr > 0 ? arrValue / totalSurveyArr : 0;
    await this.prisma.surveyResponse.update({
      where: { id: responseId },
      data: { revenueWeight, clusterLabel },
    }).catch((err: Error) => {
      this.logger.warn(`Failed to update response revenue weight: ${err.message}`);
    });
  }

  computeCiqWeight(params: {
    arrValue: number;
    maxArrInWorkspace: number;
    sentimentScore: number;
    surveyType: string;
  }): number {
    const { arrValue, maxArrInWorkspace, sentimentScore, surveyType } = params;
    const arrNorm = maxArrInWorkspace > 0
      ? Math.log1p(arrValue) / Math.log1p(maxArrInWorkspace) : 0.3;
    const sentimentNorm = (sentimentScore + 1) / 2;
    const typeMultiplier: Record<string, number> = {
      FEATURE_VALIDATION: 1.2, ROADMAP_VALIDATION: 1.1, CHURN_SIGNAL: 1.5,
      NPS: 1.0, CSAT: 0.9, OPEN_INSIGHT: 0.8, CUSTOM: 0.7,
    };
    const multiplier = typeMultiplier[surveyType] ?? 1.0;
    return this.clamp((arrNorm * 0.6 + sentimentNorm * 0.4) * multiplier, 0, 1);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private clusterResponses(
    responses: Array<{
      sentiment: number; arr: number; keyTopics: string[];
      isPromoter: boolean; isDetractor: boolean; segment: string | null;
    }>,
  ): ResponseCluster[] {
    const bands = [
      { label: 'Promoters',  filter: (r: typeof responses[0]) => r.isPromoter },
      { label: 'Neutrals',   filter: (r: typeof responses[0]) => !r.isPromoter && !r.isDetractor },
      { label: 'Detractors', filter: (r: typeof responses[0]) => r.isDetractor },
    ];
    return bands.map((band) => {
      const members = responses.filter(band.filter);
      if (members.length === 0) return null;
      const avgSentiment = members.reduce((s, r) => s + r.sentiment, 0) / members.length;
      const totalArr = members.reduce((s, r) => s + r.arr, 0);
      const topicCounts = new Map<string, number>();
      for (const r of members) for (const t of r.keyTopics) topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
      const representativeTopics = [...topicCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
      return {
        label: band.label, count: members.length,
        avgSentiment: parseFloat(avgSentiment.toFixed(3)),
        totalArr: Math.round(totalArr),
        representativeTopics,
        churnRiskSignal: band.label === 'Detractors' && totalArr > 0,
      };
    }).filter((c): c is ResponseCluster => c !== null);
  }

  private churnSeverity(arr: number, sentiment: number): 'low' | 'medium' | 'high' {
    if (arr > 50_000 && sentiment < -0.5) return 'high';
    if (arr > 10_000 && sentiment < -0.3) return 'medium';
    return 'low';
  }

  private emptyRevenueWeightedInsight(): RevenueWeightedInsight {
    return {
      validationScore: 0, revenueWeightedScore: 50, totalRespondentArr: 0,
      promoterArr: 0, detractorArr: 0, churnRiskArr: 0, churnRiskCount: 0,
      clusters: [], topFeatureRequests: [], topPainPoints: [],
      confidence: 0, executiveSummary: null, churnSignals: [],
    };
  }

  private async generateExecutiveSummary(params: {
    totalResponses: number; avgSentiment: number; revenueWeightedScore: number;
    validationScore: number; churnRiskCount: number; churnRiskArr: number;
    topFeatureRequests: string[]; topPainPoints: string[]; clusters: ResponseCluster[];
  }): Promise<string> {
    const { totalResponses, avgSentiment, revenueWeightedScore, validationScore,
            churnRiskCount, churnRiskArr, topFeatureRequests, topPainPoints, clusters } = params;
    const prompt = `You are a product intelligence analyst. Summarise this survey data in 2-3 executive sentences.

Data:
- ${totalResponses} responses
- Avg sentiment: ${avgSentiment.toFixed(2)} (-1 to +1)
- Revenue-weighted score: ${revenueWeightedScore}/100
- Validation score: ${validationScore}/100
- Churn risk: ${churnRiskCount} customers, $${Math.round(churnRiskArr / 1000)}k ARR at risk
- Clusters: ${clusters.map((c) => `${c.label} (${c.count}, $${Math.round(c.totalArr / 1000)}k ARR)`).join(', ')}
- Top feature requests: ${topFeatureRequests.slice(0, 3).join(', ') || 'none'}
- Top pain points: ${topPainPoints.slice(0, 3).join(', ') || 'none'}

Write 2-3 executive sentences. Be specific about revenue impact. No bullet points.`;
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2, max_tokens: 200,
    });
    return response.choices[0].message.content?.trim() ?? '';
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

  // ─── Per-response intelligence extraction ─────────────────────────────────

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

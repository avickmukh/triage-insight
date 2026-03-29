/**
 * CIQ (Customer Intelligence Quotient) Service
 *
 * Central deterministic scoring engine for TriageInsight.
 * Computes priority scores for feedback, themes, and roadmap items
 * using only data that actually exists in the database.
 *
 * Unified CIQ Formula (PRD Phase 2):
 *
 *   CIQ = normalise(
 *     feedbackCount   × feedbackWeight  +
 *     supportCount    × supportWeight   +   ← direct SupportIssueCluster.ticketCount
 *     voiceCount      × voiceWeight     +   ← ThemeFeedback where sourceType IN (VOICE, PUBLIC_PORTAL)
 *     sentimentScore  × sentimentWeight +
 *     recencyScore    × recencyWeight   +
 *     arrValue        × arrValueWeight  +
 *     dealInfluence   × dealValueWeight +
 *     customerCount   × customerCountWeight +
 *     accountPriority × accountPriorityWeight +
 *     signalStrength  × strategicWeight +
 *     voteCount       × voteWeight
 *   )
 *
 * Weights: supportWeight > feedbackWeight (default 1.5×), voiceWeight >= feedbackWeight (default 1.2×).
 * All weights are normalised so the sum always stays within 0–100.
 *
 * Source counts are persisted back to Theme.feedbackCount / voiceCount / supportCount
 * so the UI can show "Based on feedback, support, and voice" with real numbers.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountPriority, DealStage, DealStatus, FeedbackSourceType } from '@prisma/client';

// ─── Output types ─────────────────────────────────────────────────────────────

export interface CiqScoreComponent {
  /** Raw input value before weight is applied */
  value: number;
  /** Configured weight (0–1) from PrioritizationSettings */
  weight: number;
  /** Weighted contribution: value × weight */
  contribution: number;
  /** Human-readable label for explainability UI */
  label: string;
}

export interface CiqScoreOutput {
  /** Final normalised priority score (0–100) */
  priorityScore: number;
  /** Confidence in the score (0–1): rises with more data signals */
  confidenceScore: number;
  /** Normalised revenue impact (0–100) derived from ARR + deal pipeline */
  revenueImpactScore: number;
  /** Raw ARR sum from linked customers */
  revenueImpactValue: number;
  /** Raw deal influence value from linked deals */
  dealInfluenceValue: number;
  /** Count of non-MERGED feedback items linked to this theme (all sources) */
  feedbackCount: number;
  /** Count of voice feedback items (sourceType VOICE or PUBLIC_PORTAL) */
  voiceCount: number;
  /** Count of support tickets from linked SupportIssueCluster rows */
  supportCount: number;
  /** Count of survey responses linked to this theme */
  surveyCount: number;
  /** Total signal count across all sources */
  totalSignalCount: number;
  /** Count of CustomerSignal rows linked to this theme */
  signalCount: number;
  /** Number of distinct customers who submitted linked feedback */
  uniqueCustomerCount: number;
  /** Per-factor breakdown for explainability */
  scoreExplanation: Record<string, CiqScoreComponent>;
  /** Key of the highest-contributing factor (e.g. "requestFrequency") */
  dominantDriver?: string | null;
  /** Aggregated sentiment score across all linked feedback (-1 to +1) */
  sentimentScore?: number | null;
}

/** Lightweight feedback-level score (no theme aggregation needed) */
export interface CiqFeedbackScore {
  /** Normalised 0–100 impact estimate for a single feedback item */
  impactScore: number;
  /** Confidence 0–1 based on available signals */
  confidenceScore: number;
  /** ARR of the submitting customer (0 if unknown) */
  customerArrValue: number;
  /** Numeric account priority (1–4) */
  accountPriorityValue: number;
  /** Sentiment: negative values increase urgency */
  sentiment: number | null;
  scoreExplanation: Record<string, CiqScoreComponent>;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const ACCOUNT_PRIORITY_MAP: Record<AccountPriority, number> = {
  [AccountPriority.LOW]:      1,
  [AccountPriority.MEDIUM]:   2,
  [AccountPriority.HIGH]:     3,
  [AccountPriority.CRITICAL]: 4,
};

/** Map DealStage to a multiplier (mirrors PrioritizationSettings stage weights) */
const DEAL_STAGE_WEIGHT: Record<DealStage, number> = {
  [DealStage.PROSPECTING]: 0.1,
  [DealStage.QUALIFYING]:  0.3,
  [DealStage.PROPOSAL]:    0.6,
  [DealStage.NEGOTIATION]: 0.8,
  [DealStage.CLOSED_WON]:  1.0,
  [DealStage.CLOSED_LOST]: 0.0,
};

/** Voice source types — feedback from these channels is counted as voiceCount */
const VOICE_SOURCE_TYPES: FeedbackSourceType[] = [
  FeedbackSourceType.VOICE,
  FeedbackSourceType.PUBLIC_PORTAL,
];
/** Survey source type — feedback from SURVEY channel is counted separately as surveyCount */
const SURVEY_SOURCE_TYPES: FeedbackSourceType[] = [
  FeedbackSourceType.SURVEY,
];

/** Normalise a raw value to 0–100 using a log10 scale (handles wide ARR ranges) */
function logNorm(value: number, scale = 6): number {
  if (value <= 0) return 0;
  return Math.min(100, (Math.log10(value + 1) / scale) * 100);
}

/** Normalise a raw count to 0–100 using a soft cap at `cap` items */
function countNorm(value: number, cap = 50): number {
  return Math.min(100, (value / cap) * 100);
}

/** Confidence score: rises with data richness, asymptotically approaches 1 */
function deriveConfidence(
  feedbackCount: number,
  voiceCount: number,
  supportCount: number,
  signalCount: number,
  customerCount: number,
): number {
  // Voice and support signals are higher-quality signals → higher confidence boost
  const raw =
    feedbackCount * 0.04 +
    voiceCount    * 0.06 +
    supportCount  * 0.05 +
    signalCount   * 0.08 +
    customerCount * 0.03;
  return parseFloat(Math.min(1, raw).toFixed(3));
}

@Injectable()
export class CiqService {
  private readonly logger = new Logger(CiqService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Theme-level scoring ────────────────────────────────────────────────────

  /**
   * Compute a full CIQ score for a theme using the unified formula.
   *
   * Directly queries:
   *  - ThemeFeedback (all sourceTypes, including VOICE / PUBLIC_PORTAL)
   *  - SupportIssueCluster linked to this theme (for support ticket count)
   *  - CustomerSignal, DealThemeLink, FeedbackVote
   *
   * Uses workspace PrioritizationSettings for weights (falls back to defaults).
   */
  async scoreTheme(workspaceId: string, themeId: string): Promise<CiqScoreOutput> {
    const [settings, feedbackRows, signalRows, dealLinks, supportClusters, voteRows] =
      await Promise.all([
        this.getSettings(workspaceId),

        // ── All feedback linked to this theme (includes VOICE, PUBLIC_PORTAL) ──
        this.prisma.themeFeedback.findMany({
          where: { themeId },
          select: {
            feedback: {
              select: {
                customerId: true,
                sentiment: true,
                impactScore: true,
                status: true,
                sourceType: true,
                createdAt: true,
                customer: {
                  select: {
                    arrValue: true,
                    accountPriority: true,
                  },
                },
              },
            },
          },
        }),

        // ── CustomerSignal strength for this theme ──────────────────────────
        this.prisma.customerSignal.findMany({
          where: { themeId, workspaceId },
          select: { strength: true },
        }),

        // ── Deals linked to this theme via DealThemeLink ────────────────────
        this.prisma.dealThemeLink.findMany({
          where: { themeId },
          select: {
            deal: {
              select: {
                annualValue: true,
                stage: true,
                status: true,
              },
            },
          },
        }),

        // ── Support clusters directly linked to this theme ──────────────────
        // SupportIssueCluster.themeId is set by ClusteringService.correlateWithFeedback()
        this.prisma.supportIssueCluster.findMany({
          where: { themeId, workspaceId },
          select: {
            ticketCount:        true,
            avgSentiment:       true,
            hasActiveSpike:     true,
          },
        }),

        // ── Portal votes on linked feedback ─────────────────────────────────
        this.prisma.feedbackVote.findMany({
          where: {
            feedback: {
              themes:  { some: { themeId } },
              status:  { not: 'MERGED' },
            },
          },
          select: { id: true },
        }),
      ]);

    // ── Filter out MERGED feedback ──────────────────────────────────────────
    const activeFeedback = feedbackRows.filter((tf) => tf.feedback.status !== 'MERGED');

    // ── Source breakdown counts ─────────────────────────────────────────────
    const feedbackCount = activeFeedback.length;
    const voiceCount    = activeFeedback.filter((tf) =>
      VOICE_SOURCE_TYPES.includes(tf.feedback.sourceType as FeedbackSourceType),
    ).length;
    const surveyCount   = activeFeedback.filter((tf) =>
      SURVEY_SOURCE_TYPES.includes(tf.feedback.sourceType as FeedbackSourceType),
    ).length;
    // Pure text/manual feedback (everything that is NOT voice or survey)
    const textFeedbackCount = feedbackCount - voiceCount - surveyCount;

    // Support count: sum of ticketCount across all linked clusters
    const supportCount = supportClusters.reduce(
      (sum, c) => sum + (c.ticketCount ?? 0), 0,
    );
    const hasSupportSpike = supportClusters.some((c) => c.hasActiveSpike);

    const totalSignalCount = feedbackCount + supportCount + surveyCount;

    // ── Customer aggregates ─────────────────────────────────────────────────
    const customerIds = new Set(
      activeFeedback.map((tf) => tf.feedback.customerId).filter(Boolean),
    );
    const uniqueCustomerCount = customerIds.size;

    const arrValue = activeFeedback.reduce(
      (sum, tf) => sum + (tf.feedback.customer?.arrValue ?? 0), 0,
    );

    const priorityValues = activeFeedback
      .map((tf) => tf.feedback.customer?.accountPriority)
      .filter((p): p is AccountPriority => p != null)
      .map((p) => ACCOUNT_PRIORITY_MAP[p]);
    const accountPriorityValue =
      priorityValues.length > 0
        ? priorityValues.reduce((a, b) => a + b, 0) / priorityValues.length
        : 0;

    // ── Deal influence ──────────────────────────────────────────────────────
    const dealInfluenceValue = dealLinks.reduce((sum, dl) => {
      if (dl.deal.status === DealStatus.LOST) return sum;
      return sum + dl.deal.annualValue * (DEAL_STAGE_WEIGHT[dl.deal.stage] ?? 0);
    }, 0);

    // ── Signal strength ─────────────────────────────────────────────────────
    const signalCount    = signalRows.length;
    const signalStrength = signalRows.reduce((sum, s) => sum + (s.strength ?? 0), 0);

    // ── Sentiment ───────────────────────────────────────────────────────────
    // Combine feedback sentiment with support cluster avg sentiment
    const feedbackSentiments = activeFeedback
      .map((tf) => tf.feedback.sentiment)
      .filter((s): s is number => s != null);

    const supportSentiments = supportClusters
      .map((c) => c.avgSentiment)
      .filter((s): s is number => s != null);

    const allSentiments = [...feedbackSentiments, ...supportSentiments];
    const negativeSentiments = allSentiments.filter((s) => s < 0);
    const sentimentPenalty =
      negativeSentiments.length > 0
        ? Math.abs(negativeSentiments.reduce((a, b) => a + b, 0) / negativeSentiments.length)
        : 0;

    // Positive sentiment score (0–100): higher = more positive signal
    const positiveSentiments = allSentiments.filter((s) => s > 0);
    const avgPositiveSentiment =
      positiveSentiments.length > 0
        ? positiveSentiments.reduce((a, b) => a + b, 0) / positiveSentiments.length
        : 0;
    const normSentiment = avgPositiveSentiment * 100;

    // ── Recency ─────────────────────────────────────────────────────────────
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentFeedbackCount = activeFeedback.filter(
      (tf) => tf.feedback.createdAt != null && new Date(tf.feedback.createdAt) > thirtyDaysAgo,
    ).length;

    // ── Normalise each input to 0–100 ───────────────────────────────────────
    const normTextFeedback    = countNorm(textFeedbackCount, 50);
    const normVoice           = countNorm(voiceCount, 20);
    const normSupport         = countNorm(supportCount, 30);
    const normCustomerCount   = countNorm(uniqueCustomerCount, 20);
    const normArr             = logNorm(arrValue, 7);
    const normAccountPriority = (accountPriorityValue / 4) * 100;
    const normDealInfluence   = logNorm(dealInfluenceValue, 7);
    const normSignalStrength  = logNorm(signalStrength + signalCount, 4);
    const normVotes           = countNorm(voteRows.length, 100);
    const normRecency         = countNorm(recentFeedbackCount, 20);

    // ── Spike bonus: active support spike adds urgency ──────────────────────
    const spikeBonus = hasSupportSpike ? 10 : 0;

    // ── Build explanation with unified weights ──────────────────────────────
    // supportWeight and voiceWeight are multipliers on top of requestFrequencyWeight.
    // We apply them as separate breakdown entries so the UI can show the full picture.
    const effectiveSupportWeight = settings.requestFrequencyWeight * settings.supportWeight;
    const effectiveVoiceWeight   = settings.requestFrequencyWeight * settings.voiceWeight;

    const explanation: Record<string, CiqScoreComponent> = {
      feedbackFrequency: {
        value:        normTextFeedback,
        weight:       settings.requestFrequencyWeight,
        contribution: normTextFeedback * settings.requestFrequencyWeight,
        label:        'Feedback frequency',
      },
      voiceSignal: {
        value:        normVoice,
        weight:       effectiveVoiceWeight,
        contribution: normVoice * effectiveVoiceWeight,
        label:        'Voice feedback signal',
      },
      supportSignal: {
        value:        normSupport,
        weight:       effectiveSupportWeight,
        contribution: normSupport * effectiveSupportWeight,
        label:        'Support ticket signal',
      },
      customerCount: {
        value:        normCustomerCount,
        weight:       settings.customerCountWeight,
        contribution: normCustomerCount * settings.customerCountWeight,
        label:        'Unique customers',
      },
      arrValue: {
        value:        normArr,
        weight:       settings.arrValueWeight,
        contribution: normArr * settings.arrValueWeight,
        label:        'Customer ARR',
      },
      accountPriority: {
        value:        normAccountPriority,
        weight:       settings.accountPriorityWeight,
        contribution: normAccountPriority * settings.accountPriorityWeight,
        label:        'Account priority',
      },
      dealInfluence: {
        value:        normDealInfluence,
        weight:       settings.dealValueWeight,
        contribution: normDealInfluence * settings.dealValueWeight,
        label:        'Deal pipeline influence',
      },
      signalStrength: {
        value:        normSignalStrength,
        weight:       settings.strategicWeight,
        contribution: normSignalStrength * settings.strategicWeight,
        label:        'Customer signal strength',
      },
      sentimentSignal: {
        value:        normSentiment,
        weight:       settings.sentimentWeight,
        contribution: normSentiment * settings.sentimentWeight,
        label:        'Positive sentiment signal',
      },
      recencySignal: {
        value:        normRecency,
        weight:       settings.recencyWeight,
        contribution: normRecency * settings.recencyWeight,
        label:        'Recent activity (30d)',
      },
      voteSignal: {
        value:        normVotes,
        weight:       settings.voteWeight,
        contribution: normVotes * settings.voteWeight,
        label:        'Portal vote signal',
      },
    };

    // ── Normalise weights so the sum always stays within 0–100 ─────────────
    const totalWeight = Object.values(explanation).reduce((sum, c) => sum + c.weight, 0);
    const normFactor  = totalWeight > 0 ? 1 / totalWeight : 1;
    if (Math.abs(totalWeight - 1.0) > 0.001) {
      for (const key of Object.keys(explanation)) {
        explanation[key] = {
          ...explanation[key],
          weight:       explanation[key].weight * normFactor,
          contribution: explanation[key].contribution * normFactor,
        };
      }
    }

    // ── Compute final score ─────────────────────────────────────────────────
    const rawScore      = Object.values(explanation).reduce((sum, c) => sum + c.contribution, 0);
    // Sentiment penalty reduces total score slightly; spike bonus adds urgency
    const adjustedScore = rawScore * (1 - sentimentPenalty * 0.1) + spikeBonus;
    const priorityScore = parseFloat(Math.min(100, adjustedScore).toFixed(2));

    const revenueImpactValue = arrValue;
    const revenueImpactScore = parseFloat(
      Math.min(100, logNorm(arrValue, 7) * 0.6 + logNorm(dealInfluenceValue, 7) * 0.4).toFixed(2),
    );

    const confidenceScore = deriveConfidence(
      feedbackCount, voiceCount, supportCount, signalCount, uniqueCustomerCount,
    );

    return {
      priorityScore,
      confidenceScore,
      revenueImpactScore,
      revenueImpactValue,
      dealInfluenceValue,
      feedbackCount,
      voiceCount,
      supportCount,
      surveyCount,
      totalSignalCount,
      signalCount,
      uniqueCustomerCount,
      scoreExplanation: explanation,
    };
  }

  // ─── Feedback-level scoring ─────────────────────────────────────────────────

  /**
   * Compute a lightweight CIQ score for a single feedback item.
   * Used to set Feedback.impactScore after ingestion.
   */
  async scoreFeedback(workspaceId: string, feedbackId: string): Promise<CiqFeedbackScore> {
    const feedback = await this.prisma.feedback.findUnique({
      where: { id: feedbackId, workspaceId },
      select: {
        sentiment:  true,
        impactScore: true,
        status:     true,
        sourceType: true,
        customer: {
          select: {
            arrValue:        true,
            accountPriority: true,
          },
        },
        themes: {
          select: { themeId: true },
        },
      },
    });

    if (!feedback) {
      return {
        impactScore:          0,
        confidenceScore:      0,
        customerArrValue:     0,
        accountPriorityValue: 0,
        sentiment:            null,
        scoreExplanation:     {},
      };
    }

    const customerArrValue    = feedback.customer?.arrValue ?? 0;
    const accountPriorityRaw  = feedback.customer?.accountPriority ?? AccountPriority.MEDIUM;
    const accountPriorityValue = ACCOUNT_PRIORITY_MAP[accountPriorityRaw];
    const sentiment            = feedback.sentiment ?? null;

    // Voice feedback gets a small urgency bonus (higher signal quality)
    const isVoice      = VOICE_SOURCE_TYPES.includes(feedback.sourceType as FeedbackSourceType);
    const voiceBonus   = isVoice ? 8 : 0;

    const normArr      = logNorm(customerArrValue, 7);
    const normPriority = (accountPriorityValue / 4) * 100;
    const sentimentUrgency =
      sentiment != null && sentiment < 0 ? Math.abs(sentiment) * 100 : 0;
    const themeBonus = feedback.themes.length > 0 ? 10 : 0;

    const explanation: Record<string, CiqScoreComponent> = {
      customerArr: {
        value:        normArr,
        weight:       0.35,
        contribution: normArr * 0.35,
        label:        'Customer ARR',
      },
      accountPriority: {
        value:        normPriority,
        weight:       0.25,
        contribution: normPriority * 0.25,
        label:        'Account priority',
      },
      sentimentUrgency: {
        value:        sentimentUrgency,
        weight:       0.20,
        contribution: sentimentUrgency * 0.20,
        label:        'Sentiment urgency',
      },
      themeSignal: {
        value:        themeBonus,
        weight:       0.12,
        contribution: themeBonus * 0.12,
        label:        'Theme cluster signal',
      },
      voiceBonus: {
        value:        voiceBonus,
        weight:       0.08,
        contribution: voiceBonus * 0.08,
        label:        'Voice signal quality',
      },
    };

    const impactScore = parseFloat(
      Math.min(100, Object.values(explanation).reduce((s, c) => s + c.contribution, 0)).toFixed(2),
    );

    const hasCustomer  = feedback.customer != null ? 1 : 0;
    const hasSentiment = sentiment != null ? 1 : 0;
    const confidenceScore = parseFloat(
      Math.min(1, (
        hasCustomer  * 0.5 +
        hasSentiment * 0.3 +
        (feedback.themes.length > 0 ? 0.2 : 0)
      )).toFixed(3),
    );

    return {
      impactScore,
      confidenceScore,
      customerArrValue,
      accountPriorityValue,
      sentiment,
      scoreExplanation: explanation,
    };
  }

  // ─── Roadmap-level scoring ──────────────────────────────────────────────────

  /**
   * Compute CIQ scores for a roadmap item.
   * Delegates to scoreTheme if the item is linked to a theme,
   * otherwise returns a minimal score from the item's own stored values.
   */
  async scoreRoadmapItem(
    workspaceId: string,
    itemId: string,
  ): Promise<CiqScoreOutput & { themeScored: boolean }> {
    const item = await this.prisma.roadmapItem.findUnique({
      where: { id: itemId, workspaceId },
      select: { themeId: true, revenueImpactValue: true, dealInfluenceValue: true },
    });

    if (!item) {
      return {
        priorityScore:      0,
        confidenceScore:    0,
        revenueImpactScore: 0,
        revenueImpactValue: 0,
        dealInfluenceValue: 0,
        feedbackCount:      0,
        voiceCount:         0,
        supportCount:       0,
        surveyCount:        0,
        totalSignalCount:   0,
        signalCount:        0,
        uniqueCustomerCount: 0,
        scoreExplanation:   {},
        themeScored:        false,
      };
    }

    if (item.themeId) {
      const themeScore = await this.scoreTheme(workspaceId, item.themeId);
      return { ...themeScore, themeScored: true };
    }

    const revenueImpactValue = item.revenueImpactValue ?? 0;
    const dealInfluenceValue = item.dealInfluenceValue ?? 0;
    const revenueImpactScore = parseFloat(
      Math.min(100, logNorm(revenueImpactValue, 7) * 0.6 + logNorm(dealInfluenceValue, 7) * 0.4).toFixed(2),
    );

    return {
      priorityScore:      0,
      confidenceScore:    0,
      revenueImpactScore,
      revenueImpactValue,
      dealInfluenceValue,
      feedbackCount:      0,
      voiceCount:         0,
      supportCount:       0,
      surveyCount:        0,
      totalSignalCount:   0,
      signalCount:        0,
      uniqueCustomerCount: 0,
      scoreExplanation: {
        storedRevenue: {
          value:        revenueImpactValue,
          weight:       1,
          contribution: revenueImpactScore,
          label:        'Stored revenue impact (no theme linked)',
        },
      },
      themeScored: false,
    };
  }

  // ─── Persist theme score ────────────────────────────────────────────────────

  /**
   * Persist CIQ scores directly onto the Theme row.
   * Writes: priorityScore, lastScoredAt, revenueInfluence, signalBreakdown,
   *         feedbackCount, voiceCount, supportCount, totalSignalCount.
   * Safe to call fire-and-forget; errors are caught and logged.
   */
  async persistThemeScore(themeId: string, score: CiqScoreOutput): Promise<void> {
    try {
      await this.prisma.theme.update({
        where: { id: themeId },
        data: {
          priorityScore:    score.priorityScore,
          lastScoredAt:     new Date(),
          revenueInfluence: score.revenueImpactValue,
          signalBreakdown:  score.scoreExplanation as object,
          // Unified source counts (PRD Phase 3)
          feedbackCount:    score.feedbackCount,
          voiceCount:       score.voiceCount,
          supportCount:     score.supportCount,
          surveyCount:      score.surveyCount,
          totalSignalCount: score.totalSignalCount,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to persist CIQ score to Theme row: ${(err as Error).message}`);
    }
  }

  /**
   * Persist CIQ scores back to RoadmapItem rows linked to the given theme.
   * Safe to call fire-and-forget; errors are caught and logged.
   */
  async persistThemeScoreToRoadmap(workspaceId: string, themeId: string, score: CiqScoreOutput): Promise<void> {
    try {
      await this.prisma.roadmapItem.updateMany({
        where: { workspaceId, themeId },
        data: {
          priorityScore:      score.priorityScore,
          confidenceScore:    score.confidenceScore,
          revenueImpactScore: score.revenueImpactScore,
          revenueImpactValue: score.revenueImpactValue,
          dealInfluenceValue: score.dealInfluenceValue,
          signalCount:        score.signalCount,
          customerCount:      score.uniqueCustomerCount,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to persist theme score to roadmap items: ${(err as Error).message}`);
    }
  }

  /**
   * Persist CIQ impactScore back to a single Feedback row.
   * Safe to call fire-and-forget.
   */
  async persistFeedbackScore(feedbackId: string, score: CiqFeedbackScore): Promise<void> {
    try {
      await this.prisma.feedback.update({
        where: { id: feedbackId },
        data: { impactScore: score.impactScore },
      });
    } catch (err) {
      this.logger.warn(`Failed to persist feedback score: ${(err as Error).message}`);
    }
  }

  // ─── Settings helper ────────────────────────────────────────────────────────

  async getSettings(workspaceId: string) {
    let settings = await this.prisma.prioritizationSettings.findUnique({ where: { workspaceId } });
    if (!settings) {
      settings = await this.prisma.prioritizationSettings.create({ data: { workspaceId } });
    }
    return settings;
  }
}

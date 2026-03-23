/**
 * CIQ (Customer Intelligence Quotient) Service
 *
 * Central deterministic scoring engine for TriageInsight.
 * Computes priority scores for feedback, themes, and roadmap items
 * using only data that actually exists in the database.
 *
 * Scoring inputs (all real — no fabricated values):
 *  1. requestFrequency     — count of non-MERGED feedback linked to the theme
 *  2. uniqueCustomerCount  — distinct customers who submitted linked feedback
 *  3. arrValue             — sum of Customer.arrValue for linked customers (real CRM field)
 *  4. accountPriorityValue — numeric mapping of Customer.accountPriority (LOW=1…CRITICAL=4)
 *  5. dealInfluenceValue   — sum of Deal.annualValue × DealStage weight for deals linked
 *                            to the theme via DealThemeLink (real deal pipeline data)
 *  6. signalStrength       — sum of CustomerSignal.strength for signals linked to the theme
 *  7. sentimentPenalty     — mean negative sentiment across linked feedback (0 = neutral/positive)
 *
 * Intelligence gaps (schema fields exist but data not yet populated):
 *  - Feedback.impactScore  — never written by any service; kept as optional input
 *  - CustomerSignal.strength — populated by integrations; defaults to 0 if absent
 *
 * All methods return a CiqScoreOutput with a scoreExplanation map so the UI
 * can later show "why is this score high" without additional API calls.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountPriority, DealStage, DealStatus, PrioritizationSettings } from '@prisma/client';

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
  /** Count of non-MERGED feedback items linked to this theme */
  feedbackCount: number;
  /** Count of CustomerSignal rows linked to this theme */
  signalCount: number;
  /** Number of distinct customers who submitted linked feedback */
  uniqueCustomerCount: number;
  /** Per-factor breakdown for explainability */
  scoreExplanation: Record<string, CiqScoreComponent>;
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
function deriveConfidence(feedbackCount: number, signalCount: number, customerCount: number): number {
  const raw = feedbackCount * 0.05 + signalCount * 0.1 + customerCount * 0.03;
  return parseFloat(Math.min(1, raw).toFixed(3));
}

@Injectable()
export class CiqService {
  private readonly logger = new Logger(CiqService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Theme-level scoring ────────────────────────────────────────────────────

  /**
   * Compute a full CIQ score for a theme.
   * Uses workspace PrioritizationSettings for weights (falls back to defaults).
   */
  async scoreTheme(workspaceId: string, themeId: string): Promise<CiqScoreOutput> {
    const [settings, feedbackRows, signalRows, dealLinks] = await Promise.all([
      this.getSettings(workspaceId),
      // Linked non-MERGED feedback with customer data
      this.prisma.themeFeedback.findMany({
        where: { themeId },
        select: {
          feedback: {
            select: {
              customerId: true,
              sentiment: true,
              impactScore: true,
              status: true,
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
      // CustomerSignal strength for this theme
      this.prisma.customerSignal.findMany({
        where: { themeId, workspaceId },
        select: { strength: true },
      }),
      // Deals linked to this theme via DealThemeLink
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
    ]);

    // Filter out MERGED feedback
    const activeFeedback = feedbackRows.filter((tf) => tf.feedback.status !== 'MERGED');
    const feedbackCount = activeFeedback.length;

    // Unique customers
    const customerIds = new Set(
      activeFeedback.map((tf) => tf.feedback.customerId).filter(Boolean),
    );
    const uniqueCustomerCount = customerIds.size;

    // ARR: sum of Customer.arrValue for linked customers
    const arrValue = activeFeedback.reduce((sum, tf) => {
      return sum + (tf.feedback.customer?.arrValue ?? 0);
    }, 0);

    // Account priority: mean numeric priority across linked customers
    const priorityValues = activeFeedback
      .map((tf) => tf.feedback.customer?.accountPriority)
      .filter((p): p is AccountPriority => p != null)
      .map((p) => ACCOUNT_PRIORITY_MAP[p]);
    const accountPriorityValue =
      priorityValues.length > 0
        ? priorityValues.reduce((a, b) => a + b, 0) / priorityValues.length
        : 0;

    // Deal influence: sum of annualValue × stage weight for OPEN deals
    const dealInfluenceValue = dealLinks.reduce((sum, dl) => {
      if (dl.deal.status === DealStatus.LOST) return sum;
      const stageWeight = DEAL_STAGE_WEIGHT[dl.deal.stage] ?? 0;
      return sum + dl.deal.annualValue * stageWeight;
    }, 0);

    // Signal strength: sum of CustomerSignal.strength
    const signalCount = signalRows.length;
    const signalStrength = signalRows.reduce((sum, s) => sum + (s.strength ?? 0), 0);

    // Sentiment penalty: mean of negative sentiments (0 = no penalty)
    const sentiments = activeFeedback
      .map((tf) => tf.feedback.sentiment)
      .filter((s): s is number => s != null);
    const negativeSentiments = sentiments.filter((s) => s < 0);
    const sentimentPenalty =
      negativeSentiments.length > 0
        ? Math.abs(negativeSentiments.reduce((a, b) => a + b, 0) / negativeSentiments.length)
        : 0;

    // ── Normalise each input to 0–100 ──────────────────────────────────────────
    const normFrequency        = countNorm(feedbackCount, 50);
    const normCustomerCount    = countNorm(uniqueCustomerCount, 20);
    const normArr              = logNorm(arrValue, 7);          // $10M ARR → ~100
    const normAccountPriority  = (accountPriorityValue / 4) * 100;
    const normDealInfluence    = logNorm(dealInfluenceValue, 7);
    const normSignalStrength   = logNorm(signalStrength + signalCount, 4);
    const normSentimentPenalty = sentimentPenalty * 100;        // already 0–1

    // ── Weighted sum using PrioritizationSettings ──────────────────────────────
    const explanation: Record<string, CiqScoreComponent> = {
      requestFrequency: {
        value: normFrequency,
        weight: settings.requestFrequencyWeight,
        contribution: normFrequency * settings.requestFrequencyWeight,
        label: 'Feedback frequency',
      },
      customerCount: {
        value: normCustomerCount,
        weight: settings.customerCountWeight,
        contribution: normCustomerCount * settings.customerCountWeight,
        label: 'Unique customers',
      },
      arrValue: {
        value: normArr,
        weight: settings.arrValueWeight,
        contribution: normArr * settings.arrValueWeight,
        label: 'Customer ARR',
      },
      accountPriority: {
        value: normAccountPriority,
        weight: settings.accountPriorityWeight,
        contribution: normAccountPriority * settings.accountPriorityWeight,
        label: 'Account priority',
      },
      dealInfluence: {
        value: normDealInfluence,
        weight: settings.dealValueWeight,
        contribution: normDealInfluence * settings.dealValueWeight,
        label: 'Deal pipeline influence',
      },
      signalStrength: {
        value: normSignalStrength,
        weight: settings.strategicWeight,
        contribution: normSignalStrength * settings.strategicWeight,
        label: 'Customer signal strength',
      },
    };

    // ── Extended CIQ factors (vote weight, sentiment weight, recency weight) ──
    // Vote count: total votes on linked feedback (portal upvotes)
    const voteRows = await this.prisma.feedbackVote.findMany({
      where: { feedback: { themes: { some: { themeId } }, status: { not: 'MERGED' } } },
      select: { id: true },
    });
    const voteCount = voteRows.length;
    const normVotes = countNorm(voteCount, 100);
    explanation['voteSignal'] = {
      value: normVotes,
      weight: settings.voteWeight,
      contribution: normVotes * settings.voteWeight,
      label: 'Portal vote signal',
    };

    // Recency: boost themes with recent feedback (within last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentFeedbackCount = activeFeedback.filter(
      (tf) => tf.feedback.createdAt != null && new Date(tf.feedback.createdAt) > thirtyDaysAgo,
    ).length;
    const normRecency = countNorm(recentFeedbackCount, 20);
    explanation['recencySignal'] = {
      value: normRecency,
      weight: settings.recencyWeight,
      contribution: normRecency * settings.recencyWeight,
      label: 'Recent activity (30d)',
    };

    // Sentiment penalty reduces the total score slightly
    const rawScore = Object.values(explanation).reduce((sum, c) => sum + c.contribution, 0);
    const penalisedScore = rawScore * (1 - sentimentPenalty * 0.1);
    const priorityScore = parseFloat(Math.min(100, penalisedScore).toFixed(2));

    // Revenue impact: log-normalised ARR + deal influence
    const revenueImpactValue = arrValue;
    const revenueImpactScore = parseFloat(
      Math.min(100, (logNorm(arrValue, 7) * 0.6 + logNorm(dealInfluenceValue, 7) * 0.4)).toFixed(2),
    );

    const confidenceScore = deriveConfidence(feedbackCount, signalCount, uniqueCustomerCount);

    return {
      priorityScore,
      confidenceScore,
      revenueImpactScore,
      revenueImpactValue,
      dealInfluenceValue,
      feedbackCount,
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
        sentiment: true,
        impactScore: true,
        status: true,
        customer: {
          select: {
            arrValue: true,
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
        impactScore: 0,
        confidenceScore: 0,
        customerArrValue: 0,
        accountPriorityValue: 0,
        sentiment: null,
        scoreExplanation: {},
      };
    }

    const customerArrValue = feedback.customer?.arrValue ?? 0;
    const accountPriorityRaw = feedback.customer?.accountPriority ?? AccountPriority.MEDIUM;
    const accountPriorityValue = ACCOUNT_PRIORITY_MAP[accountPriorityRaw];
    const sentiment = feedback.sentiment ?? null;

    // Normalise
    const normArr      = logNorm(customerArrValue, 7);
    const normPriority = (accountPriorityValue / 4) * 100;
    // Negative sentiment increases urgency (0 = neutral, 1 = very negative)
    const sentimentUrgency = sentiment != null && sentiment < 0 ? Math.abs(sentiment) * 100 : 0;
    const themeBonus = feedback.themes.length > 0 ? 10 : 0; // linked to a theme = more signal

    const explanation: Record<string, CiqScoreComponent> = {
      customerArr: {
        value: normArr,
        weight: 0.4,
        contribution: normArr * 0.4,
        label: 'Customer ARR',
      },
      accountPriority: {
        value: normPriority,
        weight: 0.3,
        contribution: normPriority * 0.3,
        label: 'Account priority',
      },
      sentimentUrgency: {
        value: sentimentUrgency,
        weight: 0.2,
        contribution: sentimentUrgency * 0.2,
        label: 'Sentiment urgency',
      },
      themeSignal: {
        value: themeBonus,
        weight: 0.1,
        contribution: themeBonus * 0.1,
        label: 'Theme cluster signal',
      },
    };

    const impactScore = parseFloat(
      Math.min(100, Object.values(explanation).reduce((s, c) => s + c.contribution, 0)).toFixed(2),
    );

    // Confidence: higher if customer is known and sentiment is available
    const hasCustomer = feedback.customer != null ? 1 : 0;
    const hasSentiment = sentiment != null ? 1 : 0;
    const confidenceScore = parseFloat(
      Math.min(1, (hasCustomer * 0.5 + hasSentiment * 0.3 + (feedback.themes.length > 0 ? 0.2 : 0))).toFixed(3),
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
        priorityScore: 0,
        confidenceScore: 0,
        revenueImpactScore: 0,
        revenueImpactValue: 0,
        dealInfluenceValue: 0,
        feedbackCount: 0,
        signalCount: 0,
        uniqueCustomerCount: 0,
        scoreExplanation: {},
        themeScored: false,
      };
    }

    if (item.themeId) {
      const themeScore = await this.scoreTheme(workspaceId, item.themeId);
      return { ...themeScore, themeScored: true };
    }

    // No theme linked: use stored values only
    const revenueImpactValue = item.revenueImpactValue ?? 0;
    const dealInfluenceValue = item.dealInfluenceValue ?? 0;
    const revenueImpactScore = parseFloat(
      Math.min(100, logNorm(revenueImpactValue, 7) * 0.6 + logNorm(dealInfluenceValue, 7) * 0.4).toFixed(2),
    );

    return {
      priorityScore: 0,
      confidenceScore: 0,
      revenueImpactScore,
      revenueImpactValue,
      dealInfluenceValue,
      feedbackCount: 0,
      signalCount: 0,
      uniqueCustomerCount: 0,
      scoreExplanation: {
        storedRevenue: {
          value: revenueImpactValue,
          weight: 1,
          contribution: revenueImpactScore,
          label: 'Stored revenue impact (no theme linked)',
        },
      },
      themeScored: false,
    };
  }

  // ─── Persist theme score ────────────────────────────────────────────────────

  /**
   * Persist CIQ scores directly onto the Theme row.
   * Writes: priorityScore, lastScoredAt, revenueInfluence, signalBreakdown.
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

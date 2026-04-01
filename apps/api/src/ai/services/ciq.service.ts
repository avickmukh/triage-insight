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
 *     feedbackCount   × feedbackWeight  +   ← ThemeFeedback where primarySource = FEEDBACK (or legacy sourceType)
 *     supportCount    × supportWeight   +   ← SupportIssueCluster.ticketCount + primarySource=SUPPORT Feedback rows
 *     voiceCount      × voiceWeight     +   ← primarySource=VOICE (or legacy VOICE/PUBLIC_PORTAL sourceType)
 *     surveyCount     × feedbackWeight  +   ← primarySource=SURVEY Feedback rows (open-text, AI-analysed)
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
 * Source classification uses primarySource (unified attribution) with sourceType as legacy fallback.
 * Weights: supportWeight > feedbackWeight (default 1.5×), voiceWeight >= feedbackWeight (default 1.2×).
 * Survey signals use feedbackWeight (1.0×) — high-intent respondents, no discount.
 * All weights are normalised so the sum always stays within 0–100.
 *
 * Source counts are persisted back to Theme.feedbackCount / voiceCount / supportCount / surveyCount
 * so the UI can show "Based on feedback, support, voice, and survey" with real numbers.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountPriority, DealStage, DealStatus, FeedbackPrimarySource, FeedbackSourceType } from '@prisma/client';

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
  /**
   * Human-readable sentence explaining WHY this theme has its current priority score.
   * Generated deterministically from the dominant driver and top factors.
   * Example: "High priority driven by support ticket pressure (28 tickets) and ARR exposure ($1.2M)."
   */
  priorityReason?: string | null;
  /**
   * Human-readable sentence explaining the confidence level.
   * Example: "Medium confidence — 4 feedback items and 1 voice signal; add more signals to increase confidence."
   */
  confidenceExplanation?: string | null;
  /** Number of distinct source types that contributed at least 1 signal */
  sourceDiversityCount?: number;
  /** Signal velocity: percentage change in signal count vs. previous week (from TrendComputationService) */
  velocityDelta?: number | null;
  /**
   * Indicates whether the score was computed in signal-only mode (no CRM data available)
   * or in full mode (ARR + deal pipeline + customer data contributed).
   * The UI uses this to show a contextual explanation banner encouraging CRM integration.
   */
  scoringMode?: 'signal-only' | 'full';
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

/**
 * Determine the effective source category for a feedback row.
 *
 * Uses `primarySource` (the new unified attribution field) as the authoritative
 * classifier when present.  Falls back to the legacy `sourceType` enum for rows
 * that pre-date the unified attribution migration so backward-compatibility is
 * preserved without a data backfill.
 *
 * Categories:
 *   'voice'    — extracted from voice / audio transcripts
 *   'survey'   — collected via structured surveys (NPS, CSAT, custom)
 *   'support'  — created from customer support tickets
 *   'feedback' — everything else (direct, CSV, portal, email, Slack, API)
 */
function effectiveSourceCategory(
  row: { primarySource: FeedbackPrimarySource | null; sourceType: string },
): 'voice' | 'survey' | 'support' | 'feedback' {
  // Authoritative path: use primarySource when it has been set
  if (row.primarySource === FeedbackPrimarySource.VOICE)    return 'voice';
  if (row.primarySource === FeedbackPrimarySource.SURVEY)   return 'survey';
  if (row.primarySource === FeedbackPrimarySource.SUPPORT)  return 'support';
  if (row.primarySource === FeedbackPrimarySource.FEEDBACK) return 'feedback';
  // Legacy fallback: classify by sourceType for pre-migration rows
  if (VOICE_SOURCE_TYPES.includes(row.sourceType as FeedbackSourceType))  return 'voice';
  if (SURVEY_SOURCE_TYPES.includes(row.sourceType as FeedbackSourceType)) return 'survey';
  return 'feedback';
}

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
    const [settings, feedbackRows, signalRows, dealLinks, supportClusters, voteRows, themeRow] =
      await Promise.all([
        this.getSettings(workspaceId),

        // ── All feedback linked to this theme (all sources: FEEDBACK / VOICE / SURVEY / SUPPORT) ──
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
                // primarySource is the authoritative source classifier introduced by the
                // unified attribution model.  Nullable for legacy rows — effectiveSourceCategory()
                // falls back to sourceType so no data backfill is required.
                primarySource: true,
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

        // ── Resurfacing metadata ────────────────────────────────────────────
        // resurfaceCount > 0 means fresh evidence arrived after this theme was
        // linked to a SHIPPED roadmap item — a strong urgency signal.
        this.prisma.theme.findUnique({
          where: { id: themeId },
          select: {
            resurfaceCount:     true,
            resurfacedAt:       true,
            // Velocity: pre-computed by TrendComputationService; used to add a
            // velocitySignal component without re-querying all feedback timestamps.
            trendDelta:         true,
            currentWeekSignals: true,
            prevWeekSignals:    true,
          },
        }),
      ]);

    // ── Filter out MERGED feedback ──────────────────────────────────────────
    const activeFeedback = feedbackRows.filter((tf) => tf.feedback.status !== 'MERGED');

    // ── Source breakdown counts ─────────────────────────────────────────────
    // effectiveSourceCategory() uses primarySource as the authoritative classifier
    // and falls back to sourceType for legacy rows.  This means:
    //   - Survey open-text Feedback rows (primarySource=SURVEY) → surveyCount
    //   - Support-ticket Feedback rows (primarySource=SUPPORT)  → supportFeedbackCount
    //   - Voice Feedback rows (primarySource=VOICE)             → voiceCount
    //   - Everything else                                        → textFeedbackCount
    const feedbackCount = activeFeedback.length;
    const voiceCount    = activeFeedback.filter(
      (tf) => effectiveSourceCategory(tf.feedback) === 'voice',
    ).length;
    const surveyFeedbackCount  = activeFeedback.filter(
      (tf) => effectiveSourceCategory(tf.feedback) === 'survey',
    ).length;
    const supportFeedbackCount = activeFeedback.filter(
      (tf) => effectiveSourceCategory(tf.feedback) === 'support',
    ).length;
    // Pure text/manual feedback (everything that is NOT voice, survey, or support-sourced)
    const textFeedbackCount = feedbackCount - voiceCount - surveyFeedbackCount - supportFeedbackCount;

    // Support count: Feedback rows with primarySource=SUPPORT (unified pipeline).
    // SupportIssueCluster rows are kept for legacy analytics but no longer feed CIQ
    // to prevent double-counting tickets that also created Feedback records.
    const supportCount = supportFeedbackCount;
    const hasSupportSpike = supportClusters.some((c) => c.hasActiveSpike);

    // surveyCount = survey-sourced Feedback rows (open-text answers processed by AI pipeline)
    const surveyCount = surveyFeedbackCount;

    // totalSignalCount = all Feedback rows (support, survey, voice, text) — single source of truth
    const totalSignalCount = feedbackCount;

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
    // ── Time-based signal weighting (3-tier recency decay) ────────────────────────
    // Signals are weighted by age:
    //   ≤ 30 days  → 1.0× (full weight — fresh signal)
    //   31–90 days → 0.6× (medium weight — still relevant)
    //   > 90 days  → 0.2× (reduced weight — stale signal)
    // This replaces the previous binary 30d recency flag and ensures that
    // themes with recent activity score higher than themes with only old signals.
    const now30  = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const now90  = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    let weightedSignalCount = 0;
    let recentFeedbackCount = 0; // kept for backward-compat with normRecency
    for (const tf of activeFeedback) {
      const createdAt = tf.feedback.createdAt ? new Date(tf.feedback.createdAt) : null;
      if (!createdAt) {
        weightedSignalCount += 0.2; // treat missing date as stale
        continue;
      }
      if (createdAt > now30) {
        weightedSignalCount += 1.0;
        recentFeedbackCount++;
      } else if (createdAt > now90) {
        weightedSignalCount += 0.6;
      } else {
        weightedSignalCount += 0.2;
      }
    }
    // weightedSignalCount is used as the primary frequency input so that
    // themes with recent signals rank higher than themes with only old signals
    // of equal raw count.
    const effectiveSignalCount = weightedSignalCount;

    // ── Normalise each input to 0–100 ───────────────────────────────────────────
    // Use effectiveSignalCount (time-weighted) for frequency normalisation
    // instead of raw textFeedbackCount so recency is baked into the base score.
    const normTextFeedback    = countNorm(effectiveSignalCount, 50);
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

    // ── Resurfacing boost: shipped theme receiving fresh evidence ───────────
    // Each resurfacing event adds up to 15 points (capped), decaying over 90 days.
    // This ensures a shipped item that keeps getting complaints rises back up.
    const resurfaceCount = themeRow?.resurfaceCount ?? 0;
    const resurfacedAt   = themeRow?.resurfacedAt ? new Date(themeRow.resurfacedAt) : null;
    const daysSinceResurface = resurfacedAt
      ? (Date.now() - resurfacedAt.getTime()) / (1000 * 60 * 60 * 24)
      : 999;
    // Decay: full boost within 7 days, linear decay to 0 at 90 days
    const resurfaceDecay  = daysSinceResurface < 90
      ? Math.max(0, 1 - daysSinceResurface / 90)
      : 0;
    const resurfaceBonus  = resurfaceCount > 0
      ? Math.min(15, resurfaceCount * 5) * resurfaceDecay
      : 0;
    // ── Signal velocity ─────────────────────────────────────────────────────
    // trendDelta is the % change in signal count vs. the previous 7-day window,
    // pre-computed by TrendComputationService.  We convert it into a 0–100 score
    // capped at ±50% change (beyond that, the signal is already very strong).
    // Negative velocity (shrinking signal) is treated as 0 — we do not penalise
    // themes for declining interest; recency and resurfacing already handle that.
    const velocityDelta    = themeRow?.trendDelta ?? null;
    const rawVelocity      = velocityDelta != null ? Math.max(0, velocityDelta) : 0;
    const normVelocity     = Math.min(100, (rawVelocity / 50) * 100);
    // ── Source diversity ────────────────────────────────────────────────────
    // Count how many of the 4 primary sources have at least 1 signal.
    // A theme corroborated by multiple independent sources is more reliable
    // than one with many signals from a single channel.
    const activeSources = [
      textFeedbackCount > 0,
      voiceCount        > 0,
      supportCount      > 0,
      surveyCount       > 0,
    ].filter(Boolean).length;
    // Normalise: 1 source = 25, 2 = 50, 3 = 75, 4 = 100
    const normSourceDiversity = (activeSources / 4) * 100;

    // ── Build explanation with unified weights ──────────────────────────────
    // supportWeight and voiceWeight are multipliers on top of requestFrequencyWeight.
    // We apply them as separate breakdown entries so the UI can show the full picture.
    const effectiveSupportWeight = settings.requestFrequencyWeight * settings.supportWeight;
    const effectiveVoiceWeight   = settings.requestFrequencyWeight * settings.voiceWeight;
    // Survey signals use the same base weight as regular feedback (1.0×).
    // Survey respondents are high-intent (they opted in) so their signals are
    // at least as valuable as direct feedback.  No separate surveyWeight setting
    // is needed — the count is already separated into normSurvey.
    const normSurvey = countNorm(surveyCount, 20);
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
      // Survey signal: open-text survey responses that entered the AI pipeline.
      // Weight = requestFrequencyWeight (same as direct text feedback) because survey
      // responses are high-intent and should not be discounted relative to inbox items.
      // This component is visible in the scoreExplanation breakdown so the UI can
      // show "X survey responses contributed to this theme's priority".
      surveySignal: {
        value:        normSurvey,
        weight:       settings.requestFrequencyWeight,
        contribution: normSurvey * settings.requestFrequencyWeight,
        label:        'Survey response signal',
      },
      // Signal velocity: growing themes get an urgency boost proportional to their
      // week-over-week growth rate.  Weight is low (0.05) so a single fast-growing
      // theme doesn't dominate the ranking, but consistent growth is rewarded.
      velocitySignal: {
        value:        normVelocity,
        weight:       0.05,
        contribution: normVelocity * 0.05,
        label:        velocityDelta != null
          ? `Signal velocity (+${velocityDelta.toFixed(0)}% WoW)`
          : 'Signal velocity (no trend data yet)',
      },
      // Source diversity: themes corroborated by multiple independent sources are
      // more reliable.  Weight is low (0.04) — this is a confidence amplifier, not
      // a primary driver.  A theme with 4 active sources gets a small but visible
      // boost that reflects cross-source validation.
      sourceDiversitySignal: {
        value:        normSourceDiversity,
        weight:       0.04,
        contribution: normSourceDiversity * 0.04,
        label:        `Source diversity (${activeSources}/4 sources active)`,
      },
    };

    // ── Adaptive scoring: signal-only mode for workspaces without CRM data ────
    // When a workspace has no ARR, no linked customers, and no deal pipeline data,
    // the CRM-dependent factors (customerCount, arrValue, accountPriority,
    // dealInfluence, signalStrength) all contribute 0 to the score, but their
    // weights still consume ~60% of the total weight budget.  This causes every
    // theme to score below 10/100 regardless of signal volume, making the
    // Priority badge permanently show "Low" for new customers.
    //
    // Fix: if no CRM data is present, zero out the CRM factor weights so the
    // weight normalisation step redistributes the full budget to signal factors.
    // This preserves the relative ranking between themes while producing
    // meaningful absolute scores (e.g. 5 signals -> ~40-60/100 instead of ~3/100).
    const hasCrmData = arrValue > 0 || uniqueCustomerCount > 0 || dealInfluenceValue > 0;
    const scoringMode: 'signal-only' | 'full' = hasCrmData ? 'full' : 'signal-only';
    if (!hasCrmData) {
      // Zero out weights for factors that require CRM data.
      // The normalisation step below will redistribute these weights to the
      // active signal factors, so the total score stays in the 0-100 range.
      const CRM_FACTOR_KEYS = ['customerCount', 'arrValue', 'accountPriority', 'dealInfluence', 'signalStrength'];
      for (const key of CRM_FACTOR_KEYS) {
        if (explanation[key]) {
          explanation[key] = { ...explanation[key], weight: 0, contribution: 0 };
        }
      }
    }

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
    // Sentiment penalty reduces total score slightly; spike + resurfacing bonuses add urgency
    const adjustedScore = rawScore * (1 - sentimentPenalty * 0.1) + spikeBonus + resurfaceBonus;
    const priorityScore = parseFloat(Math.min(100, adjustedScore).toFixed(2));

    const revenueImpactValue = arrValue;
    const revenueImpactScore = parseFloat(
      Math.min(100, logNorm(arrValue, 7) * 0.6 + logNorm(dealInfluenceValue, 7) * 0.4).toFixed(2),
    );

    const confidenceScore = deriveConfidence(
      feedbackCount, voiceCount, supportCount, signalCount, uniqueCustomerCount,
    );

    // ── Add resurfacing to score explanation if active ─────────────────────
    if (resurfaceBonus > 0) {
      explanation['resurfacingSignal'] = {
        value:        resurfaceBonus,
        weight:       1,
        contribution: resurfaceBonus,
        label:        `Resurfaced after shipped (×${resurfaceCount})`,
      };
    }

    // ── Dominant driver ─────────────────────────────────────────────────────
    // Find the explanation key with the highest weighted contribution.
    // Excludes metadata-only keys (resurfacingSignal is a bonus, not a base factor).
    const BASE_FACTOR_KEYS = new Set([
      'feedbackFrequency', 'voiceSignal', 'supportSignal', 'customerCount',
      'arrValue', 'accountPriority', 'dealInfluence', 'signalStrength',
      'sentimentSignal', 'recencySignal', 'voteSignal', 'surveySignal',
      'velocitySignal', 'sourceDiversitySignal',
    ]);
    const dominantDriver = Object.entries(explanation)
      .filter(([k]) => BASE_FACTOR_KEYS.has(k))
      .sort((a, b) => b[1].contribution - a[1].contribution)[0]?.[0] ?? null;

    // ── Priority reason sentence ────────────────────────────────────────────
    // Generate a deterministic one-sentence explanation of why this theme has
    // its current priority score.  Uses the dominant driver and top-2 factors.
    const topFactors = Object.entries(explanation)
      .filter(([k]) => BASE_FACTOR_KEYS.has(k))
      .sort((a, b) => b[1].contribution - a[1].contribution)
      .slice(0, 2);
    const DRIVER_PHRASES: Record<string, (v: number) => string> = {
      feedbackFrequency:    (v) => `${Math.round(v)} direct feedback signal${Math.round(v) !== 1 ? 's' : ''}`,
      voiceSignal:          (v) => `${Math.round(v)} voice signal${Math.round(v) !== 1 ? 's' : ''}`,
      supportSignal:        (v) => `${Math.round(v)} support ticket${Math.round(v) !== 1 ? 's' : ''}`,
      surveySignal:         (v) => `${Math.round(v)} survey response${Math.round(v) !== 1 ? 's' : ''}`,
      arrValue:             (v) => `$${(v / 100 * 10).toFixed(1)}M ARR exposure`,
      customerCount:        (v) => `${Math.round(v)} unique customer${Math.round(v) !== 1 ? 's' : ''}`,
      accountPriority:      (_) => 'high-priority account signals',
      dealInfluence:        (_) => 'active deal pipeline exposure',
      signalStrength:       (_) => 'strong customer signal strength',
      sentimentSignal:      (_) => 'positive sentiment signal',
      recencySignal:        (v) => `${Math.round(v)} recent signal${Math.round(v) !== 1 ? 's' : ''} (30d)`,
      voteSignal:           (v) => `${Math.round(v)} portal vote${Math.round(v) !== 1 ? 's' : ''}`,
      velocitySignal:       (_) => `growing ${velocityDelta != null ? velocityDelta.toFixed(0) + '% WoW' : 'rapidly'}`,
      sourceDiversitySignal: (_) => `${activeSources} independent source${activeSources !== 1 ? 's' : ''} corroborating`,
    };
    const band = priorityScore >= 70 ? 'High' : priorityScore >= 40 ? 'Moderate' : 'Low';
    const driverPhrase = dominantDriver && DRIVER_PHRASES[dominantDriver]
      ? DRIVER_PHRASES[dominantDriver](topFactors[0]?.[1].value ?? 0)
      : 'multiple signals';
    const secondPhrase = topFactors[1] && DRIVER_PHRASES[topFactors[1][0]]
      ? ` and ${DRIVER_PHRASES[topFactors[1][0]](topFactors[1][1].value)}`
      : '';
    const signalOnlyNote = scoringMode === 'signal-only'
      ? ' Scored in signal-only mode (no CRM data). Connect your CRM to unlock revenue-weighted prioritization.'
      : '';
    const priorityReason =
      `${band} priority driven by ${driverPhrase}${secondPhrase}. ` +
      `Score: ${Math.round(priorityScore)}/100.${signalOnlyNote}`;

    // ── Confidence explanation sentence ────────────────────────────────────
    const confBand = confidenceScore >= 0.75 ? 'High' : confidenceScore >= 0.45 ? 'Medium' : 'Low';
    const signalSummaryParts: string[] = [];
    if (feedbackCount > 0)  signalSummaryParts.push(`${feedbackCount} feedback item${feedbackCount !== 1 ? 's' : ''}`);
    if (voiceCount > 0)     signalSummaryParts.push(`${voiceCount} voice signal${voiceCount !== 1 ? 's' : ''}`);
    if (supportCount > 0)   signalSummaryParts.push(`${supportCount} support ticket${supportCount !== 1 ? 's' : ''}`);
    if (surveyCount > 0)    signalSummaryParts.push(`${surveyCount} survey response${surveyCount !== 1 ? 's' : ''}`);
    const signalSummary = signalSummaryParts.length > 0
      ? signalSummaryParts.join(', ')
      : 'no signals yet';
    const confAdvice = confidenceScore < 0.45
      ? ' Add more signals from multiple sources to increase confidence.'
      : confidenceScore < 0.75
      ? ' More cross-source signals will raise confidence further.'
      : '';
    const confidenceExplanation =
      `${confBand} confidence — based on ${signalSummary}.${confAdvice}`;

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
      dominantDriver,
      sentimentScore: allSentiments.length > 0
        ? parseFloat((allSentiments.reduce((a, b) => a + b, 0) / allSentiments.length).toFixed(3))
        : null,
      priorityReason,
      confidenceExplanation,
      sourceDiversityCount: activeSources,
      velocityDelta,
      scoringMode,
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

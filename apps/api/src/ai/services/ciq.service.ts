/**
 * CIQ (Customer Intelligence Quotient) Service
 *
 * Central deterministic scoring engine for TriageInsight.
 * Computes priority scores for feedback, themes, and roadmap items
 * using only data that actually exists in the database.
 *
 * ── CIQ 5-Factor Formula (v2) ────────────────────────────────────────────────
 *
 * Base score = weighted sum of 5 independent signals:
 *
 *   Volume    (30%)  — how many signals exist (log-scaled, adaptive cap)
 *   Severity  (25%)  — keyword urgency in feedback text (critical/high/medium/low)
 *   Frequency (20%)  — how many distinct customers are affected
 *   Friction  (15%)  — theme impact type from topKeywords + dominantSignal
 *   Recency   (10%)  — 3-tier time-decay (≤30d=1.0, 31–90d=0.6, >90d=0.2)
 *
 * CRM Multiplier (1.0–1.5): when ARR / deal pipeline / account priority data is
 * present, the base score is amplified by up to 50%.  This means CRM-less
 * workspaces still get meaningful scores (40–80/100) while CRM-rich workspaces
 * can reach the full 100/100 ceiling.
 *
 * Adaptive countNorm cap: cap = max(totalSignals * 0.5, 10).  A theme with 5
 * signals gets a cap of 10 → 50% of max, not 10% (old fixed cap of 50).
 *
 * Source counts are persisted back to Theme.feedbackCount / voiceCount /
 * supportCount / surveyCount so the UI can show real numbers per channel.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AccountPriority,
  DealStage,
  DealStatus,
  FeedbackPrimarySource,
  FeedbackSourceType,
} from '@prisma/client';

// ─── Output types ─────────────────────────────────────────────────────────────

export interface CiqScoreComponent {
  /** Raw input value before weight is applied */
  value: number;
  /** Configured weight (0–1) */
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
  /** Key of the highest-contributing factor (e.g. "volume") */
  dominantDriver?: string | null;
  /** Aggregated sentiment score across all linked feedback (-1 to +1) */
  sentimentScore?: number | null;
  /**
   * Human-readable sentence explaining WHY this theme has its current priority score.
   * Generated deterministically from the dominant driver and top factors.
   */
  priorityReason?: string | null;
  /**
   * Human-readable sentence explaining the confidence level.
   */
  confidenceExplanation?: string | null;
  /** Number of distinct source types that contributed at least 1 signal */
  sourceDiversityCount?: number;
  /** Signal velocity: percentage change in signal count vs. previous week */
  velocityDelta?: number | null;
  /**
   * Indicates whether the score was computed in signal-only mode (no CRM data)
   * or in full mode (ARR + deal pipeline + customer data contributed).
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
/** Survey source type — feedback from SURVEY channel is counted separately */
const SURVEY_SOURCE_TYPES: FeedbackSourceType[] = [
  FeedbackSourceType.SURVEY,
];

/**
 * Determine the effective source category for a feedback row.
 *
 * Uses `primarySource` (unified attribution) as the authoritative classifier
 * when present. Falls back to legacy `sourceType` for pre-migration rows.
 */
function effectiveSourceCategory(
  row: { primarySource: FeedbackPrimarySource | null; sourceType: string },
): 'voice' | 'survey' | 'support' | 'feedback' {
  if (row.primarySource === FeedbackPrimarySource.VOICE)    return 'voice';
  if (row.primarySource === FeedbackPrimarySource.SURVEY)   return 'survey';
  if (row.primarySource === FeedbackPrimarySource.SUPPORT)  return 'support';
  if (row.primarySource === FeedbackPrimarySource.FEEDBACK) return 'feedback';
  if (VOICE_SOURCE_TYPES.includes(row.sourceType as FeedbackSourceType))  return 'voice';
  if (SURVEY_SOURCE_TYPES.includes(row.sourceType as FeedbackSourceType)) return 'survey';
  return 'feedback';
}

/** Normalise a raw value to 0–100 using a log10 scale (handles wide ARR ranges) */
function logNorm(value: number, scale = 6): number {
  if (value <= 0) return 0;
  return Math.min(100, (Math.log10(value + 1) / scale) * 100);
}

/**
 * Normalise a raw count to 0–100 using an adaptive cap.
 *
 * The cap is derived from the actual signal count so that small workspaces
 * (5–20 items) still get meaningful scores rather than flat 10–40/100.
 *
 * Formula: cap = max(totalSignals * 0.5, 10)
 *   - 5 signals  → cap=10  → 5/10 = 50% → 50 pts
 *   - 10 signals → cap=10  → 10/10 = 100% → 100 pts
 *   - 20 signals → cap=10  → 20/10 → capped at 100 pts
 *   - 100 signals → cap=50 → 100/50 → capped at 100 pts
 *
 * The old fixed cap of 50 caused 5 signals → 5/50 = 10% → 10 pts.
 */
function adaptiveCountNorm(value: number, totalSignals: number): number {
  const cap = Math.max(totalSignals * 0.5, 10);
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
  const raw =
    feedbackCount * 0.04 +
    voiceCount    * 0.06 +
    supportCount  * 0.05 +
    signalCount   * 0.08 +
    customerCount * 0.03;
  return parseFloat(Math.min(1, raw).toFixed(3));
}

// ─── Severity keyword scoring ─────────────────────────────────────────────────

/**
 * Severity tiers (matched against lowercased feedback text):
 *   CRITICAL (1.0): crash, data loss, security, outage, broken, blocker, urgent, critical, can't, cannot
 *   HIGH     (0.75): slow, error, fail, bug, missing, wrong, issue, problem, not working
 *   MEDIUM   (0.5):  difficult, confusing, annoying, frustrating, unclear, hard to
 *   LOW      (0.25): would be nice, suggestion, idea, improvement, feature request
 */
const SEVERITY_CRITICAL = [
  'crash', 'data loss', 'security', 'outage', 'broken', 'blocker', 'urgent',
  'critical', "can't", 'cannot', 'down', 'unavailable', 'corrupted', 'lost data',
  'not loading', 'stuck', 'blocked',
];
const SEVERITY_HIGH = [
  'slow', 'error', 'fail', 'failed', 'bug', 'missing', 'wrong', 'issue',
  'problem', 'not working', 'doesn\'t work', 'does not work', 'broken',
  'incorrect', 'unexpected', 'exception',
];
const SEVERITY_MEDIUM = [
  'difficult', 'confusing', 'annoying', 'frustrating', 'unclear', 'hard to',
  'takes too long', 'inefficient', 'clunky', 'awkward',
];
const SEVERITY_LOW = [
  'would be nice', 'suggestion', 'idea', 'improvement', 'feature request',
  'could be better', 'nice to have', 'consider adding',
];

/**
 * Compute a severity score (0–100) from feedback text.
 * Returns the highest tier matched across all keywords.
 */
function computeSeverityScore(texts: string[]): number {
  const combined = texts.join(' ').toLowerCase();
  if (SEVERITY_CRITICAL.some((kw) => combined.includes(kw))) return 100;
  if (SEVERITY_HIGH.some((kw) => combined.includes(kw)))     return 75;
  if (SEVERITY_MEDIUM.some((kw) => combined.includes(kw)))   return 50;
  if (SEVERITY_LOW.some((kw) => combined.includes(kw)))      return 25;
  // Default: neutral signal (no strong keywords found)
  return 40;
}

// ─── Friction scoring ─────────────────────────────────────────────────────────

/**
 * Friction tiers based on theme topKeywords and dominantSignal.
 * Higher friction = more impact on core workflow = higher priority.
 *
 *   CORE_WORKFLOW (1.0): login, auth, payment, data, export, import, api, sync
 *   NAVIGATION   (0.8):  navigation, search, filter, load, performance, speed
 *   FEATURE_LIMIT (0.6): limit, quota, plan, upgrade, missing feature, integration
 *   MINOR_UX     (0.4):  ui, design, color, layout, tooltip, label
 */
const FRICTION_CORE = [
  'login', 'auth', 'authentication', 'payment', 'billing', 'data', 'export',
  'import', 'api', 'sync', 'integration', 'webhook', 'security', 'access',
  'permission', 'crash', 'error', 'fail',
];
const FRICTION_NAVIGATION = [
  'navigation', 'search', 'filter', 'load', 'loading', 'performance', 'speed',
  'slow', 'timeout', 'latency', 'dashboard', 'report',
];
const FRICTION_FEATURE = [
  'limit', 'quota', 'plan', 'upgrade', 'missing', 'feature', 'integration',
  'connect', 'support', 'add', 'request',
];

/**
 * Compute a friction score (0–100) from theme topKeywords and dominantSignal.
 */
function computeFrictionScore(
  topKeywords: unknown,
  dominantSignal: string | null | undefined,
): number {
  const keywords: string[] = [];
  if (Array.isArray(topKeywords)) {
    keywords.push(...topKeywords.map((k) => String(k).toLowerCase()));
  }
  if (dominantSignal) {
    keywords.push(dominantSignal.toLowerCase());
  }
  const combined = keywords.join(' ');
  if (FRICTION_CORE.some((kw) => combined.includes(kw)))       return 100;
  if (FRICTION_NAVIGATION.some((kw) => combined.includes(kw))) return 80;
  if (FRICTION_FEATURE.some((kw) => combined.includes(kw)))    return 60;
  return 40; // minor UX / unknown
}

@Injectable()
export class CiqService {
  private readonly logger = new Logger(CiqService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Theme-level scoring ────────────────────────────────────────────────────

  /**
   * Compute a full CIQ score for a theme using the 5-factor formula.
   *
   * Factors:
   *   Volume    (30%) — adaptive log-scaled signal count
   *   Severity  (25%) — keyword urgency in feedback text
   *   Frequency (20%) — unique customer breadth
   *   Friction  (15%) — theme impact type from topKeywords
   *   Recency   (10%) — 3-tier time-decay
   *
   * CRM Multiplier (1.0–1.5) applied on top of base score when CRM data exists.
   */
  async scoreTheme(workspaceId: string, themeId: string): Promise<CiqScoreOutput> {
    const [feedbackRows, signalRows, dealLinks, supportClusters, voteRows, themeRow] =
      await Promise.all([
        // ── All feedback linked to this theme ──────────────────────────────
        this.prisma.themeFeedback.findMany({
          where: { themeId },
          select: {
            feedback: {
              select: {
                customerId:   true,
                sentiment:    true,
                impactScore:  true,
                status:       true,
                sourceType:   true,
                primarySource: true,
                createdAt:    true,
                title:        true,
                description:  true,
                rawText:      true,
                customer: {
                  select: {
                    arrValue:        true,
                    accountPriority: true,
                  },
                },
              },
            },
          },
        }),

        // ── CustomerSignal strength for this theme ─────────────────────────
        this.prisma.customerSignal.findMany({
          where: { themeId, workspaceId },
          select: { strength: true },
        }),

        // ── Deals linked to this theme via DealThemeLink ───────────────────
        this.prisma.dealThemeLink.findMany({
          where: { themeId },
          select: {
            deal: {
              select: {
                annualValue: true,
                stage:       true,
                status:      true,
              },
            },
          },
        }),

        // ── Support clusters directly linked to this theme ─────────────────
        this.prisma.supportIssueCluster.findMany({
          where: { themeId, workspaceId },
          select: {
            ticketCount:    true,
            avgSentiment:   true,
            hasActiveSpike: true,
          },
        }),

        // ── Portal votes on linked feedback ────────────────────────────────
        this.prisma.feedbackVote.findMany({
          where: {
            feedback: {
              themes: { some: { themeId } },
              status: { not: 'MERGED' },
            },
          },
          select: { id: true },
        }),

        // ── Theme metadata (topKeywords, dominantSignal, trend, resurfacing) ─
        this.prisma.theme.findUnique({
          where: { id: themeId },
          select: {
            topKeywords:        true,
            dominantSignal:     true,
            resurfaceCount:     true,
            resurfacedAt:       true,
            trendDelta:         true,
            currentWeekSignals: true,
            prevWeekSignals:    true,
          },
        }),
      ]);

    // ── Filter out MERGED feedback ─────────────────────────────────────────
    const activeFeedback = feedbackRows.filter((tf) => tf.feedback.status !== 'MERGED');

    // ── Source breakdown counts ────────────────────────────────────────────
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
    const textFeedbackCount = feedbackCount - voiceCount - surveyFeedbackCount - supportFeedbackCount;
    const supportCount  = supportFeedbackCount;
    const surveyCount   = surveyFeedbackCount;
    const hasSupportSpike = supportClusters.some((c) => c.hasActiveSpike);
    const totalSignalCount = feedbackCount;

    // ── Customer aggregates ────────────────────────────────────────────────
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

    // ── Deal influence ─────────────────────────────────────────────────────
    const dealInfluenceValue = dealLinks.reduce((sum, dl) => {
      if (dl.deal.status === DealStatus.LOST) return sum;
      return sum + dl.deal.annualValue * (DEAL_STAGE_WEIGHT[dl.deal.stage] ?? 0);
    }, 0);

    // ── Signal strength ────────────────────────────────────────────────────
    const signalCount    = signalRows.length;
    const signalStrength = signalRows.reduce((sum, s) => sum + (s.strength ?? 0), 0);

    // ── Sentiment ──────────────────────────────────────────────────────────
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

    // ── Resurfacing boost ──────────────────────────────────────────────────
    const resurfaceCount = themeRow?.resurfaceCount ?? 0;
    const resurfacedAt   = themeRow?.resurfacedAt ? new Date(themeRow.resurfacedAt) : null;
    const daysSinceResurface = resurfacedAt
      ? (Date.now() - resurfacedAt.getTime()) / (1000 * 60 * 60 * 24)
      : 999;
    const resurfaceDecay  = daysSinceResurface < 90
      ? Math.max(0, 1 - daysSinceResurface / 90)
      : 0;
    const resurfaceBonus  = resurfaceCount > 0
      ? Math.min(15, resurfaceCount * 5) * resurfaceDecay
      : 0;

    // ── Signal velocity ────────────────────────────────────────────────────
    const velocityDelta  = themeRow?.trendDelta ?? null;
    const rawVelocity    = velocityDelta != null ? Math.max(0, velocityDelta) : 0;
    const normVelocity   = Math.min(100, (rawVelocity / 50) * 100);

    // ── Source diversity ───────────────────────────────────────────────────
    const activeSources = [
      textFeedbackCount > 0,
      voiceCount        > 0,
      supportCount      > 0,
      surveyCount       > 0,
    ].filter(Boolean).length;

    // ──────────────────────────────────────────────────────────────────────
    // ── 5-FACTOR BASE SCORE ───────────────────────────────────────────────
    // ──────────────────────────────────────────────────────────────────────

    // ── Factor 1: Volume (30%) ─────────────────────────────────────────────
    // Adaptive cap: max(totalSignals * 0.5, 10)
    // A theme with 5 signals → cap=10 → 50% → 50 pts (not 10% with old cap=50)
    // Log-scale applied on top for diminishing returns at high volumes
    const adaptiveCap   = Math.max(totalSignalCount * 0.5, 10);
    const rawVolume     = Math.min(100, (totalSignalCount / adaptiveCap) * 100);
    // Apply mild log-dampening so 100 signals doesn't dwarf 10 signals
    const volumeScore   = rawVolume; // already 0–100 from adaptive cap

    // ── Factor 2: Severity (25%) ───────────────────────────────────────────
    // Keyword classification from feedback title + description + rawText
    const feedbackTexts = activeFeedback.map((tf) => [
      tf.feedback.title ?? '',
      tf.feedback.description ?? '',
      tf.feedback.rawText ?? '',
    ].join(' '));
    // Also include theme dominantSignal as a severity hint
    if (themeRow?.dominantSignal) feedbackTexts.push(themeRow.dominantSignal);
    const severityScore = computeSeverityScore(feedbackTexts);

    // ── Factor 3: Frequency (20%) ──────────────────────────────────────────
    // Ratio of unique customers to total signals (breadth of impact).
    // More distinct customers = higher frequency score.
    // Adaptive cap same as volume so small workspaces score well.
    const frequencyScore = adaptiveCountNorm(uniqueCustomerCount, totalSignalCount);

    // ── Factor 4: Friction (15%) ───────────────────────────────────────────
    // Theme impact type from topKeywords + dominantSignal
    const frictionScore = computeFrictionScore(
      themeRow?.topKeywords,
      themeRow?.dominantSignal,
    );

    // ── Factor 5: Recency (10%) ────────────────────────────────────────────
    // 3-tier time-decay: ≤30d=1.0, 31–90d=0.6, >90d=0.2
    const now30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const now90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    let weightedSignalCount = 0;
    let recentFeedbackCount = 0;
    for (const tf of activeFeedback) {
      const createdAt = tf.feedback.createdAt ? new Date(tf.feedback.createdAt) : null;
      if (!createdAt) { weightedSignalCount += 0.2; continue; }
      if (createdAt > now30) { weightedSignalCount += 1.0; recentFeedbackCount++; }
      else if (createdAt > now90) { weightedSignalCount += 0.6; }
      else { weightedSignalCount += 0.2; }
    }
    // Recency score: ratio of weighted signals to raw signals (0–100)
    const recencyScore = totalSignalCount > 0
      ? Math.min(100, (weightedSignalCount / totalSignalCount) * 100)
      : 0;

    // ── Compute weighted base score ────────────────────────────────────────
    const WEIGHT_VOLUME   = 0.30;
    const WEIGHT_SEVERITY = 0.25;
    const WEIGHT_FREQ     = 0.20;
    const WEIGHT_FRICTION = 0.15;
    const WEIGHT_RECENCY  = 0.10;

    const baseScore =
      volumeScore   * WEIGHT_VOLUME   +
      severityScore * WEIGHT_SEVERITY +
      frequencyScore * WEIGHT_FREQ    +
      frictionScore  * WEIGHT_FRICTION +
      recencyScore   * WEIGHT_RECENCY;

    // ──────────────────────────────────────────────────────────────────────
    // ── CRM MULTIPLIER (1.0–1.5) ──────────────────────────────────────────
    // ──────────────────────────────────────────────────────────────────────
    // CRM data amplifies the base score rather than replacing it.
    // This ensures CRM-less workspaces still get meaningful scores.
    //
    // Multiplier components:
    //   ARR bonus:      up to +0.20 (logNorm of total ARR)
    //   Deal bonus:     up to +0.15 (logNorm of deal influence)
    //   Priority bonus: up to +0.10 (avg account priority / 4)
    //   Signal bonus:   up to +0.05 (CustomerSignal strength)
    // hasCrmData requires actual monetary CRM data (ARR or deal pipeline).
    // Customer count alone does not indicate CRM integration — a customer record
    // can exist without any ARR value (e.g. free-tier users).
    const hasCrmData = arrValue > 0 || dealInfluenceValue > 0;
    const scoringMode: 'signal-only' | 'full' = hasCrmData ? 'full' : 'signal-only';

    const normArr             = logNorm(arrValue, 7);
    const normDealInfluence   = logNorm(dealInfluenceValue, 7);
    const normAccountPriority = (accountPriorityValue / 4) * 100;
    const normSignalStrength  = logNorm(signalStrength + signalCount, 4);

    const crmMultiplier = hasCrmData
      ? 1.0 +
        (normArr             / 100) * 0.20 +
        (normDealInfluence   / 100) * 0.15 +
        (normAccountPriority / 100) * 0.10 +
        (normSignalStrength  / 100) * 0.05
      : 1.0;

    // ── Spike and resurfacing bonuses ──────────────────────────────────────
    const spikeBonus = hasSupportSpike ? 8 : 0;

    // ── Compute final score ────────────────────────────────────────────────
    // Apply CRM multiplier, sentiment penalty, and additive bonuses
    const amplifiedScore  = baseScore * Math.min(1.5, crmMultiplier);
    const adjustedScore   = amplifiedScore * (1 - sentimentPenalty * 0.1) + spikeBonus + resurfaceBonus;
    const priorityScore   = parseFloat(Math.min(100, Math.max(0, adjustedScore)).toFixed(2));

    const revenueImpactValue = arrValue;
    const revenueImpactScore = parseFloat(
      Math.min(100, logNorm(arrValue, 7) * 0.6 + logNorm(dealInfluenceValue, 7) * 0.4).toFixed(2),
    );

    const confidenceScore = deriveConfidence(
      feedbackCount, voiceCount, supportCount, signalCount, uniqueCustomerCount,
    );

    // ── Build score explanation ────────────────────────────────────────────
    const explanation: Record<string, CiqScoreComponent> = {
      volume: {
        value:        volumeScore,
        weight:       WEIGHT_VOLUME,
        contribution: volumeScore * WEIGHT_VOLUME,
        label:        `Volume (${totalSignalCount} signal${totalSignalCount !== 1 ? 's' : ''}, adaptive cap ${adaptiveCap.toFixed(0)})`,
      },
      severity: {
        value:        severityScore,
        weight:       WEIGHT_SEVERITY,
        contribution: severityScore * WEIGHT_SEVERITY,
        label:        `Severity (${severityScore >= 100 ? 'Critical' : severityScore >= 75 ? 'High' : severityScore >= 50 ? 'Medium' : severityScore >= 25 ? 'Low' : 'Neutral'})`,
      },
      frequency: {
        value:        frequencyScore,
        weight:       WEIGHT_FREQ,
        contribution: frequencyScore * WEIGHT_FREQ,
        label:        `Frequency (${uniqueCustomerCount} unique customer${uniqueCustomerCount !== 1 ? 's' : ''})`,
      },
      friction: {
        value:        frictionScore,
        weight:       WEIGHT_FRICTION,
        contribution: frictionScore * WEIGHT_FRICTION,
        label:        `Friction (${frictionScore >= 100 ? 'Core workflow' : frictionScore >= 80 ? 'Navigation' : frictionScore >= 60 ? 'Feature limit' : 'Minor UX'})`,
      },
      recency: {
        value:        recencyScore,
        weight:       WEIGHT_RECENCY,
        contribution: recencyScore * WEIGHT_RECENCY,
        label:        `Recency (${recentFeedbackCount} signal${recentFeedbackCount !== 1 ? 's' : ''} in last 30d)`,
      },
    };

    // CRM multiplier as an informational entry (not a base factor)
    if (hasCrmData) {
      explanation['crmMultiplier'] = {
        value:        (crmMultiplier - 1) * 100,
        weight:       0,
        contribution: amplifiedScore - baseScore,
        label:        `CRM amplifier (×${crmMultiplier.toFixed(2)}: ARR, deal pipeline, account priority)`,
      };
    }

    // Velocity signal (informational bonus)
    if (normVelocity > 0) {
      explanation['velocitySignal'] = {
        value:        normVelocity,
        weight:       0,
        contribution: 0,
        label:        velocityDelta != null
          ? `Signal velocity (+${velocityDelta.toFixed(0)}% WoW)`
          : 'Signal velocity (no trend data yet)',
      };
    }

    // Source diversity (informational)
    explanation['sourceDiversitySignal'] = {
      value:        (activeSources / 4) * 100,
      weight:       0,
      contribution: 0,
      label:        `Source diversity (${activeSources}/4 sources active)`,
    };

    // Resurfacing bonus
    if (resurfaceBonus > 0) {
      explanation['resurfacingSignal'] = {
        value:        resurfaceBonus,
        weight:       1,
        contribution: resurfaceBonus,
        label:        `Resurfaced after shipped (×${resurfaceCount})`,
      };
    }

    // ── Dominant driver ────────────────────────────────────────────────────
    const BASE_FACTOR_KEYS = new Set(['volume', 'severity', 'frequency', 'friction', 'recency']);
    const dominantDriver = Object.entries(explanation)
      .filter(([k]) => BASE_FACTOR_KEYS.has(k))
      .sort((a, b) => b[1].contribution - a[1].contribution)[0]?.[0] ?? null;

    // ── Priority reason sentence ───────────────────────────────────────────
    const topFactors = Object.entries(explanation)
      .filter(([k]) => BASE_FACTOR_KEYS.has(k))
      .sort((a, b) => b[1].contribution - a[1].contribution)
      .slice(0, 2);

    const DRIVER_PHRASES: Record<string, (v: number) => string> = {
      volume:    (v) => `${totalSignalCount} signal${totalSignalCount !== 1 ? 's' : ''} (volume score ${Math.round(v)}/100)`,
      severity:  (v) => `${v >= 100 ? 'critical' : v >= 75 ? 'high' : v >= 50 ? 'medium' : 'low'} severity keywords`,
      frequency: (v) => `${uniqueCustomerCount} unique customer${uniqueCustomerCount !== 1 ? 's' : ''} affected (breadth ${Math.round(v)}/100)`,
      friction:  (v) => `${v >= 100 ? 'core workflow' : v >= 80 ? 'navigation' : v >= 60 ? 'feature limit' : 'minor UX'} friction`,
      recency:   (v) => `${recentFeedbackCount} recent signal${recentFeedbackCount !== 1 ? 's' : ''} in last 30 days`,
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
    const crmNote = hasCrmData
      ? ` CRM amplifier: ×${crmMultiplier.toFixed(2)}.`
      : '';
    const priorityReason =
      `${band} priority driven by ${driverPhrase}${secondPhrase}.` +
      ` Score: ${Math.round(priorityScore)}/100.${crmNote}${signalOnlyNote}`;

    // ── Confidence explanation sentence ───────────────────────────────────
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
   *
   * Uses a simplified 3-factor formula:
   *   Severity (50%): keyword urgency in title + description
   *   Sentiment (30%): negative sentiment → higher urgency
   *   CRM (20%): ARR + account priority (if available)
   */
  async scoreFeedback(workspaceId: string, feedbackId: string): Promise<CiqFeedbackScore> {
    const feedback = await this.prisma.feedback.findUnique({
      where: { id: feedbackId, workspaceId },
      select: {
        sentiment:   true,
        impactScore: true,
        status:      true,
        sourceType:  true,
        title:       true,
        description: true,
        rawText:     true,
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

    // Severity from text
    const texts = [
      feedback.title ?? '',
      feedback.description ?? '',
      feedback.rawText ?? '',
    ];
    const severityScore = computeSeverityScore(texts);

    // Sentiment urgency: negative sentiment → higher urgency
    const sentimentUrgency =
      sentiment != null && sentiment < 0 ? Math.abs(sentiment) * 100 : 30;

    // CRM score
    const normArr      = logNorm(customerArrValue, 7);
    const normPriority = (accountPriorityValue / 4) * 100;
    const crmScore     = normArr * 0.6 + normPriority * 0.4;

    // Voice feedback gets a small urgency bonus (higher signal quality)
    const isVoice    = VOICE_SOURCE_TYPES.includes(feedback.sourceType as FeedbackSourceType);
    const voiceBonus = isVoice ? 8 : 0;

    const explanation: Record<string, CiqScoreComponent> = {
      severity: {
        value:        severityScore,
        weight:       0.50,
        contribution: severityScore * 0.50,
        label:        `Severity (${severityScore >= 100 ? 'Critical' : severityScore >= 75 ? 'High' : severityScore >= 50 ? 'Medium' : 'Low'})`,
      },
      sentimentUrgency: {
        value:        sentimentUrgency,
        weight:       0.30,
        contribution: sentimentUrgency * 0.30,
        label:        'Sentiment urgency',
      },
      crmSignal: {
        value:        crmScore,
        weight:       0.20,
        contribution: crmScore * 0.20,
        label:        'CRM signal (ARR + account priority)',
      },
    };

    const baseImpact = Object.values(explanation).reduce((s, c) => s + c.contribution, 0);
    const impactScore = parseFloat(Math.min(100, baseImpact + voiceBonus).toFixed(2));

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

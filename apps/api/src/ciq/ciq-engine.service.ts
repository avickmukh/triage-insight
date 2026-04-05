/**
 * CiqEngineService
 *
 * Central CIQ (Customer Intelligence Quotient) scoring engine.
 * Produces all five CIQ output types:
 *   1. feature_priority_score  — per-feedback item CIQ (impactScore + ciqScore)
 *   2. theme_priority_score    — per-theme composite (stored as priorityScore + ciqScore)
 *   3. customer_influence_score — per-customer composite (ciqInfluenceScore)
 *   4. deal_influence_score    — per-deal composite (ciqScore)
 *   5. roadmap_recommendation_signal — derived from theme scores + roadmap status
 *
 * Scoring dimensions consumed:
 *   1. Feedback Signals   : vote count, sentiment, duplicate cluster size, frequency trend
 *   2. Revenue Signals    : ARR-weighted demand, deal influence linkage, segment weighting
 *   3. Strategic Signals  : admin strategic tag, roadmap linkage, theme priority override
 *   4. Support Signals    : issue spike signal, negative sentiment spike
 *   5. Voice Signals      : complaint intensity, urgency detection (from metadata.intelligence)
 *   6. Survey Signals     : demand validation strength, feature validation confidence (ciqWeight)
 *
 * Recompute triggers (called externally via CiqScoringProcessor):
 *   - new feedback / feedback merge
 *   - new deal / ARR update
 *   - survey submission
 *   - voice ingestion
 *
 * This service is stateless and safe to call concurrently.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccountPriority,
  DealStage,
  DealStatus,
  FeedbackStatus,
  ThemeStatus,
} from '@prisma/client';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Log10 normalisation to 0–100 (handles wide ARR / deal value ranges) */
function logNorm(value: number, scale = 6): number {
  if (value <= 0) return 0;
  return Math.min(100, (Math.log10(value + 1) / scale) * 100);
}

/** Linear normalisation to 0–100 with a soft cap */
function countNorm(value: number, cap = 50): number {
  return Math.min(100, (value / cap) * 100);
}

/** Clamp a value to [0, 100] */
function clamp100(v: number): number {
  return Math.max(0, Math.min(100, v));
}

// ─── Business-grade CIQ helpers (6-factor formula) ───────────────────────────

/** Velocity: how quickly is feedback accumulating? cap at 20 signals */
function velocityScore(feedbackCount: number): number {
  return Math.min(1, feedbackCount / 20);
}

/** Recency: how fresh is the most recent signal? decays over 30 days */
function recencyScore(daysSinceLast: number): number {
  return Math.max(0, 1 - daysSinceLast / 30);
}

/** Sentiment: negative sentiment ratio (0 = all positive, 1 = all negative) */
function sentimentScore(negativeCount: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(1, negativeCount / total);
}

/** Source diversity: how many distinct primary sources? cap at 4 */
function sourceMixScore(distinctSources: number): number {
  return Math.min(1, distinctSources / 4);
}

/** Resurfacing: repeated evidence after a shipped roadmap item */
function resurfacingScore(resurfaceCount: number): number {
  return Math.min(1, resurfaceCount / 5);
}

/** Confidence: log-based certainty from signal volume */
function confidenceScore(feedbackCount: number): number {
  return Math.min(1, Math.log(feedbackCount + 1) / Math.log(50));
}

/**
 * Compute the 6-factor CIQ score (0–100) and apply impact multipliers.
 *
 * Formula:
 *   raw = 0.30*velocity + 0.20*sentiment + 0.15*recency
 *       + 0.15*resurfacing + 0.10*sourceMix + 0.10*confidence
 *   finalCIQ = clamp(raw * 100 * impactMultiplier, 0, 100)
 */
function computeBusinessCiq(params: {
  feedbackCount: number;
  daysSinceLastFeedback: number;
  negativeCount: number;
  distinctSources: number;
  resurfaceCount: number;
  hasEnterpriseSignal: boolean;
  hasPaymentOrSecuritySignal: boolean;
  highNegativeSentiment: boolean;
  highVelocity: boolean;
}): { score: number; factors: Record<string, number>; multiplier: number } {
  const v = velocityScore(params.feedbackCount);
  const s = sentimentScore(params.negativeCount, params.feedbackCount);
  const r = recencyScore(params.daysSinceLastFeedback);
  const rs = resurfacingScore(params.resurfaceCount);
  const sm = sourceMixScore(params.distinctSources);
  const c = confidenceScore(params.feedbackCount);

  const raw = 0.30 * v + 0.20 * s + 0.15 * r + 0.15 * rs + 0.10 * sm + 0.10 * c;

  // Impact multipliers
  let multiplier = 1.0;
  if (params.hasEnterpriseSignal) multiplier += 0.15;
  if (params.hasPaymentOrSecuritySignal) multiplier += 0.20;
  if (params.highNegativeSentiment && params.highVelocity) multiplier += 0.10;

  const score = Math.min(100, Math.round(raw * 100 * multiplier));

  return {
    score,
    factors: { velocity: v, sentiment: s, recency: r, resurfacing: rs, sourceMix: sm, confidence: c },
    multiplier,
  };
}

/** Derive priority label from CIQ score */
function priorityLabel(ciqScore: number, negativeRatio: number, velocity: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  // Override: very negative AND high velocity → force HIGH
  if (negativeRatio >= 0.7 && velocity >= 0.5) return 'HIGH';
  if (ciqScore >= 75) return 'HIGH';
  if (ciqScore >= 50) return 'MEDIUM';
  return 'LOW';
}

/** Narration confidence: never 0 if feedback exists */
function narrationConfidence(feedbackCount: number, distinctSources: number, sentimentVariance: number): number {
  if (feedbackCount === 0) return 0;
  const base = Math.min(1,
    (feedbackCount / 20) * 0.5 +
    (distinctSources / 4) * 0.3 +
    sentimentVariance * 0.2,
  );
  // Ensure at least 0.05 if any feedback exists
  return Math.max(0.05, base);
}

const ENTERPRISE_KEYWORDS = ['enterprise', 'sales', 'escalation', 'vip', 'strategic'];
const PAYMENT_SECURITY_KEYWORDS = ['payment', 'billing', 'security', 'breach', 'fraud', 'pci', 'gdpr'];

function hasKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

const ACCOUNT_PRIORITY_MAP: Record<AccountPriority, number> = {
  [AccountPriority.LOW]: 1,
  [AccountPriority.MEDIUM]: 2,
  [AccountPriority.HIGH]: 3,
  [AccountPriority.CRITICAL]: 4,
};

const DEAL_STAGE_WEIGHT: Record<DealStage, number> = {
  [DealStage.PROSPECTING]: 0.1,
  [DealStage.QUALIFYING]: 0.3,
  [DealStage.PROPOSAL]: 0.6,
  [DealStage.NEGOTIATION]: 0.8,
  [DealStage.CLOSED_WON]: 1.0,
  [DealStage.CLOSED_LOST]: 0.0,
};

// ─── Output types ─────────────────────────────────────────────────────────────

export interface CiqScoreBreakdown {
  value: number;
  weight: number;
  contribution: number;
  label: string;
}

export interface FeatureRankingItem {
  feedbackId: string;
  title: string;
  ciqScore: number;
  impactScore: number | null;
  voteCount: number;
  sentiment: number | null;
  customerName: string | null;
  customerArr: number;
  themeCount: number;
  breakdown: Record<string, CiqScoreBreakdown>;
}

export interface ThemeRankingItem {
  themeId: string;
  title: string;
  status: string;
  ciqScore: number;
  priorityScore: number | null;
  revenueInfluence: number;
  feedbackCount: number;
  uniqueCustomerCount: number;
  dealInfluenceValue: number;
  voiceSignalScore: number;
  surveySignalScore: number;
  supportSignalScore: number;
  /** Actual voice feedback count from Theme.voiceCount (persisted by unified CIQ scorer) */
  voiceCount: number;
  /** Actual support ticket count from Theme.supportCount (persisted by unified CIQ scorer) */
  supportCount: number;
  /** Total signal count across all sources */
  totalSignalCount: number;
  lastScoredAt: Date | null;
  /** AI confidence score for the theme cluster (0–1) */
  aiConfidence: number | null;
  /** Whether this theme is flagged as a near-duplicate merge candidate */
  isNearDuplicate: boolean;
  /** Decision Ranking Score — unified composite score from ThemeRankingEngine */
  drs: number;
  /** Signal quality labels for UI explainability chips */
  signalLabels: string[];
  /** Rank eligibility status */
  eligibility: 'ELIGIBLE' | 'PENALISED' | 'INELIGIBLE';
  breakdown: Record<string, CiqScoreBreakdown>;
}

export interface CustomerRankingItem {
  customerId: string;
  name: string;
  companyName: string | null;
  segment: string | null;
  arrValue: number;
  ciqScore: number;
  ciqInfluenceScore: number;
  featureDemandScore: number;
  supportIntensityScore: number;
  healthScore: number;
  dealCount: number;
  feedbackCount: number;
  churnRisk: number;
  breakdown: Record<string, CiqScoreBreakdown>;
}

export interface DealRankingItem {
  dealId: string;
  title: string;
  stage: string;
  status: string;
  annualValue: number;
  ciqScore: number;
  influenceWeight: number;
  customerName: string;
  customerArr: number;
  linkedThemeCount: number;
  breakdown: Record<string, CiqScoreBreakdown>;
}

export interface StrategicSignal {
  type:
    | 'theme'
    | 'feedback'
    | 'deal'
    | 'customer'
    | 'voice'
    | 'survey'
    | 'support';
  entityId: string;
  entityTitle: string;
  signal: string;
  strength: number;
  detail: string;
  detectedAt: Date;
}

export interface StrategicSignalsOutput {
  topThemes: Array<{
    themeId: string;
    title: string;
    ciqScore: number;
    roadmapLinked: boolean;
  }>;
  roadmapRecommendations: Array<{
    themeId: string;
    title: string;
    ciqScore: number;
    currentStatus: string | null;
    recommendation:
      | 'promote_to_planned'
      | 'promote_to_committed'
      | 'already_committed'
      | 'monitor';
    rationale: string;
  }>;
  signals: StrategicSignal[];
  voiceSentimentSummary: {
    avgSentiment: number;
    urgentCount: number;
    complaintCount: number;
  };
  surveyDemandSummary: {
    avgCiqWeight: number;
    validationCount: number;
    featureValidationCount: number;
  };
  supportSpikeSummary: { spikeCount: number; negativeSentimentCount: number };
}

@Injectable()
export class CiqEngineService {
  private readonly logger = new Logger(CiqEngineService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── 1. Feature Ranking ────────────────────────────────────────────────────

  /**
   * Rank all non-MERGED feedback items in a workspace by their CIQ score.
   * Incorporates: ARR, account priority, sentiment, vote count, duplicate cluster size,
   * theme linkage, and recency.
   */
  async getFeatureRanking(
    workspaceId: string,
    limit = 50,
  ): Promise<FeatureRankingItem[]> {
    const feedbacks = await this.prisma.feedback.findMany({
      where: { workspaceId, status: { not: 'MERGED' } },
      select: {
        id: true,
        title: true,
        sentiment: true,
        impactScore: true,
        ciqScore: true,
        createdAt: true,
        customer: {
          select: {
            name: true,
            arrValue: true,
            accountPriority: true,
            segment: true,
          },
        },
        votes: { select: { id: true } },
        themes: { select: { themeId: true } },
        mergedFrom: { select: { id: true } },
      },
      orderBy: { ciqScore: { sort: 'desc', nulls: 'last' } },
      take: limit * 3, // fetch more to re-rank after live computation
    });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const ranked: FeatureRankingItem[] = feedbacks.map((fb) => {
      const arrValue = fb.customer?.arrValue ?? 0;
      const priorityRaw =
        fb.customer?.accountPriority ?? AccountPriority.MEDIUM;
      const priorityNum = ACCOUNT_PRIORITY_MAP[priorityRaw];
      const sentiment = fb.sentiment ?? 0;
      const voteCount = fb.votes.length;
      const duplicateClusterSize = fb.mergedFrom.length;
      const themeCount = fb.themes.length;
      const isRecent = fb.createdAt > thirtyDaysAgo;

      const normArr = logNorm(arrValue, 7);
      const normPriority = (priorityNum / 4) * 100;
      const normSentimentUrgency =
        sentiment < 0 ? Math.abs(sentiment) * 100 : 0;
      const normVotes = countNorm(voteCount, 50);
      const normCluster = countNorm(duplicateClusterSize, 10);
      const normTheme = themeCount > 0 ? 15 : 0;
      const normRecency = isRecent ? 10 : 0;

      const breakdown: Record<string, CiqScoreBreakdown> = {
        customerArr: {
          value: normArr,
          weight: 0.3,
          contribution: normArr * 0.3,
          label: 'Customer ARR',
        },
        accountPriority: {
          value: normPriority,
          weight: 0.2,
          contribution: normPriority * 0.2,
          label: 'Account priority',
        },
        sentimentUrgency: {
          value: normSentimentUrgency,
          weight: 0.15,
          contribution: normSentimentUrgency * 0.15,
          label: 'Sentiment urgency',
        },
        voteSignal: {
          value: normVotes,
          weight: 0.15,
          contribution: normVotes * 0.15,
          label: 'Portal votes',
        },
        duplicateCluster: {
          value: normCluster,
          weight: 0.1,
          contribution: normCluster * 0.1,
          label: 'Duplicate cluster size',
        },
        themeSignal: {
          value: normTheme,
          weight: 0.05,
          contribution: normTheme * 0.05,
          label: 'Theme cluster signal',
        },
        recencySignal: {
          value: normRecency,
          weight: 0.05,
          contribution: normRecency * 0.05,
          label: 'Recent activity (30d)',
        },
      };

      const ciqScore = clamp100(
        Object.values(breakdown).reduce((s, c) => s + c.contribution, 0),
      );

      return {
        feedbackId: fb.id,
        title: fb.title,
        ciqScore: parseFloat(ciqScore.toFixed(2)),
        impactScore: fb.impactScore,
        voteCount,
        sentiment: fb.sentiment,
        customerName: fb.customer?.name ?? null,
        customerArr: arrValue,
        themeCount,
        breakdown,
      };
    });

    // Sort by live ciqScore and return top N
    return ranked.sort((a, b) => b.ciqScore - a.ciqScore).slice(0, limit);
  }

  // ─── 2. Theme Ranking ──────────────────────────────────────────────────────

  /**
   * Rank all non-archived themes by their full CIQ score, enriched with voice,
   * survey, and support signals beyond the base CiqService.scoreTheme.
   * Includes both AI_GENERATED and VERIFIED themes.
   */
  async getThemeRanking(
    workspaceId: string,
    limit = 50,
  ): Promise<ThemeRankingItem[]> {
    const themes = await this.prisma.theme.findMany({
      where: { workspaceId, status: { not: ThemeStatus.ARCHIVED } },
      select: {
        id: true,
        title: true,
        status: true,
        priorityScore: true,
        ciqScore: true,
        revenueInfluence: true,
        lastScoredAt: true,
        signalBreakdown: true,
        // Unified source counts persisted by CiqService.persistThemeScore()
        feedbackCount: true,
        voiceCount: true,
        supportCount: true,
        totalSignalCount: true,
        aiConfidence: true,
        autoMergeCandidate: true,
        resurfaceCount: true,
        recentSignalCount: true,
        lastEvidenceAt: true,
        createdAt: true,
        feedbacks: {
          where: {
            feedback: {
              status: { notIn: [FeedbackStatus.ARCHIVED, FeedbackStatus.MERGED] },
            },
          },
          select: {
            feedback: {
              select: {
                id: true,
                customerId: true,
                sentiment: true,
                ciqScore: true,
                metadata: true,
                primarySource: true,
                sourceType: true,
                title: true,
                createdAt: true,
                customer: { select: { arrValue: true, accountPriority: true } },
              },
            },
          },
        },
        dealLinks: {
          select: {
            deal: { select: { annualValue: true, stage: true, status: true } },
          },
        },
        customerSignals: {
          select: { signalType: true, strength: true },
        },
      },
      orderBy: [
        { priorityScore: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
      take: limit,
    });

    return themes.map((theme) => {
      const activeFeedback = theme.feedbacks.filter(
        (tf) => tf.feedback != null,
      );

      // ── Signal extraction (Step 1: exclude ARCHIVED + MERGED feedback) ──────
      const feedbackCount = activeFeedback.length;
      const feedbackIds = activeFeedback.map((tf) => tf.feedback.id);

      // ── Source distribution ────────────────────────────────────────────────
      const sourceSet = new Set<string>();
      const sourceDist: Record<string, number> = {};
      for (const tf of activeFeedback) {
        const src = (tf.feedback.primarySource ?? tf.feedback.sourceType ?? 'FEEDBACK').toUpperCase();
        sourceSet.add(src);
        sourceDist[src] = (sourceDist[src] ?? 0) + 1;
      }
      const distinctSources = sourceSet.size;

      // ── Sentiment distribution ─────────────────────────────────────────────
      let negativeCount = 0;
      let positiveCount = 0;
      let neutralCount = 0;
      const sentiments: number[] = [];
      for (const tf of activeFeedback) {
        const s = tf.feedback.sentiment ?? 0;
        sentiments.push(s);
        if (s < -0.1) negativeCount++;
        else if (s > 0.1) positiveCount++;
        else neutralCount++;
      }
      const sentimentMean = sentiments.length > 0
        ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
        : 0;
      const sentimentVariance = sentiments.length > 0
        ? sentiments.reduce((s, v) => s + Math.pow(v - sentimentMean, 2), 0) / sentiments.length
        : 0;

      // ── Step 7 (early): WEAK theme guard — MUST come before recency to avoid null crash ──
      if (feedbackCount === 0) {
        return {
          themeId: theme.id,
          title: theme.title,
          status: theme.status,
          ciqScore: 0,
          priorityScore: theme.priorityScore,
          revenueInfluence: theme.revenueInfluence ?? 0,
          feedbackCount: 0,
          uniqueCustomerCount: 0,
          dealInfluenceValue: 0,
          voiceSignalScore: 0,
          surveySignalScore: 0,
          supportSignalScore: 0,
          voiceCount: 0,
          supportCount: 0,
          totalSignalCount: 0,
          lastScoredAt: theme.lastScoredAt,
          aiConfidence: theme.aiConfidence ?? null,
          isNearDuplicate: theme.autoMergeCandidate ?? false,
          drs: 0,
          signalLabels: ['No signals'],
          eligibility: 'INELIGIBLE' as const,
          breakdown: {},
        };
      }

      // ── Recency: days since most recent feedback ───────────────────────────
      // NOTE: feedbackCount > 0 is guaranteed here, so reduce will always find a date.
      // The ?? fallbacks guard against edge cases where createdAt may be null.
      const lastFeedbackAt = activeFeedback.reduce<Date | null>((latest, tf) => {
        const d = tf.feedback.createdAt;
        if (!d) return latest;
        return !latest || d > latest ? d : latest;
      }, null) ?? theme.lastEvidenceAt ?? theme.createdAt ?? new Date();
      const daysSinceLast = (Date.now() - lastFeedbackAt.getTime()) / (1000 * 60 * 60 * 24);

      // ── Resurfacing ────────────────────────────────────────────────────────
      const resurfaceCountVal = theme.resurfaceCount ?? 0;

      // ── Impact keyword detection ───────────────────────────────────────────
      const allText = activeFeedback
        .map((tf) => tf.feedback.title ?? '')
        .join(' ');
      const hasEnterpriseSignal =
        sourceSet.has('SUPPORT') ||
        hasKeyword(allText, ENTERPRISE_KEYWORDS);
      const hasPaymentOrSecuritySignal = hasKeyword(allText, PAYMENT_SECURITY_KEYWORDS);
      const negativeRatio = feedbackCount > 0 ? negativeCount / feedbackCount : 0;
      const velScore = velocityScore(feedbackCount);
      const highNegativeSentiment = negativeRatio >= 0.7;
      const highVelocityFlag = velScore >= 0.5;

      // ── CIQ_SIGNAL_SNAPSHOT debug log ──────────────────────────────────────
      this.logger.debug(JSON.stringify({
        event: 'CIQ_SIGNAL_SNAPSHOT',
        themeId: theme.id,
        feedbackCount,
        feedbackIds,
        sourceDistribution: sourceDist,
        sentimentDistribution: { positive: positiveCount, neutral: neutralCount, negative: negativeCount },
        daysSinceLast: parseFloat(daysSinceLast.toFixed(1)),
        resurfaceCount: resurfaceCountVal,
      }));


      // ── 6-factor business-grade CIQ ───────────────────────────────────────
      const { score: rawCiq, factors, multiplier } = computeBusinessCiq({
        feedbackCount,
        daysSinceLastFeedback: daysSinceLast,
        negativeCount,
        distinctSources,
        resurfaceCount: resurfaceCountVal,
        hasEnterpriseSignal,
        hasPaymentOrSecuritySignal,
        highNegativeSentiment,
        highVelocity: highVelocityFlag,
      });

      const breakdown: Record<string, CiqScoreBreakdown> = {
        velocity: {
          value: parseFloat((factors.velocity * 100).toFixed(1)),
          weight: 0.30,
          contribution: parseFloat((factors.velocity * 0.30 * 100).toFixed(2)),
          label: 'Feedback velocity',
        },
        sentiment: {
          value: parseFloat((factors.sentiment * 100).toFixed(1)),
          weight: 0.20,
          contribution: parseFloat((factors.sentiment * 0.20 * 100).toFixed(2)),
          label: 'Negative sentiment pressure',
        },
        recency: {
          value: parseFloat((factors.recency * 100).toFixed(1)),
          weight: 0.15,
          contribution: parseFloat((factors.recency * 0.15 * 100).toFixed(2)),
          label: 'Signal recency',
        },
        resurfacing: {
          value: parseFloat((factors.resurfacing * 100).toFixed(1)),
          weight: 0.15,
          contribution: parseFloat((factors.resurfacing * 0.15 * 100).toFixed(2)),
          label: 'Post-ship resurfacing',
        },
        sourceMix: {
          value: parseFloat((factors.sourceMix * 100).toFixed(1)),
          weight: 0.10,
          contribution: parseFloat((factors.sourceMix * 0.10 * 100).toFixed(2)),
          label: 'Source diversity',
        },
        confidence: {
          value: parseFloat((factors.confidence * 100).toFixed(1)),
          weight: 0.10,
          contribution: parseFloat((factors.confidence * 0.10 * 100).toFixed(2)),
          label: 'Signal confidence',
        },
      };

      // ── CIQ_FACTOR_BREAKDOWN debug log ─────────────────────────────────────
      this.logger.debug(JSON.stringify({
        event: 'CIQ_FACTOR_BREAKDOWN',
        themeId: theme.id,
        factors,
        multiplier,
        rawCiq,
      }));

      // ── Near-duplicate penalty (20% reduction for merge candidates) ────────
      const isNearDuplicate = theme.autoMergeCandidate ?? false;
      const effectiveCiqScore = isNearDuplicate
        ? Math.max(0, Math.round(rawCiq * 0.8))
        : rawCiq;

      // ── CIQ_FINAL_SCORE debug log ──────────────────────────────────────────
      this.logger.debug(JSON.stringify({
        event: 'CIQ_FINAL_SCORE',
        themeId: theme.id,
        title: theme.title,
        rawCiq,
        effectiveCiqScore,
        isNearDuplicate,
        priority: priorityLabel(effectiveCiqScore, negativeRatio, velScore),
      }));

      // ── Live source counts from active feedback rows ───────────────────────
      const liveVoiceCount = activeFeedback.filter(
        (tf) => (tf.feedback.primarySource ?? '').toUpperCase() === 'VOICE' ||
                 (tf.feedback.sourceType ?? '').toUpperCase() === 'VOICE',
      ).length;
      const liveSupportCount = activeFeedback.filter(
        (tf) => (tf.feedback.primarySource ?? '').toUpperCase() === 'SUPPORT' ||
                 (tf.feedback.sourceType ?? '').toUpperCase() === 'SUPPORT',
      ).length;

      // ── Narration confidence (Step 8) ──────────────────────────────────────
      const aiConf = narrationConfidence(feedbackCount, distinctSources, sentimentVariance);

      // ── Deal signals (kept for revenue intelligence display) ──────────────
      const dealInfluenceValue = theme.dealLinks.reduce((s, dl) => {
        if (dl.deal.status === DealStatus.LOST) return s;
        return s + dl.deal.annualValue * (DEAL_STAGE_WEIGHT[dl.deal.stage] ?? 0);
      }, 0);

      // ── Signal labels for UI explainability chips ─────────────────────────
      const signalLabels: string[] = [];
      if (isNearDuplicate) signalLabels.push('Near-duplicate');
      if (hasEnterpriseSignal) signalLabels.push('Enterprise signal');
      if (hasPaymentOrSecuritySignal) signalLabels.push('Payment/Security');
      if (highNegativeSentiment) signalLabels.push('High negativity');
      if (multiplier > 1.0) signalLabels.push(`+${Math.round((multiplier - 1) * 100)}% impact boost`);

      const uniqueCustomerIds = new Set(
        activeFeedback.map((tf) => tf.feedback.customerId).filter(Boolean),
      );
      const uniqueCustomerCount = uniqueCustomerIds.size;

      return {
        themeId: theme.id,
        title: theme.title,
        status: theme.status,
        ciqScore: effectiveCiqScore,
        priorityScore: theme.priorityScore,
        revenueInfluence: theme.revenueInfluence ?? 0,
        feedbackCount,
        uniqueCustomerCount,
        dealInfluenceValue,
        voiceSignalScore: parseFloat((factors.velocity * 100).toFixed(2)),
        surveySignalScore: parseFloat((factors.sourceMix * 100).toFixed(2)),
        supportSignalScore: parseFloat((liveSupportCount > 0 ? Math.min(100, liveSupportCount * 20) : 0).toFixed(2)),
        voiceCount: liveVoiceCount,
        supportCount: liveSupportCount,
        totalSignalCount: feedbackCount,
        lastScoredAt: theme.lastScoredAt,
        aiConfidence: aiConf,
        isNearDuplicate,
        drs: effectiveCiqScore,
        signalLabels,
        eligibility: isNearDuplicate ? 'PENALISED' : 'ELIGIBLE',
        breakdown,
      };
    });
    // All non-archived themes are returned regardless of signal count.
    // Themes with 0 signals are ranked last (priorityScore=null, ciqScore=0).
    // This ensures the ranking page is never empty when themes exist.
  }

  // ─── 3. Customer Ranking ──────────────────────────────────────────────────

  /**
   * Rank all customers in a workspace by their CIQ influence score.
   * Incorporates: ARR, segment, feedback volume, deal pipeline, support intensity,
   * and health score.
   */
  async getCustomerRanking(
    workspaceId: string,
    limit = 50,
  ): Promise<CustomerRankingItem[]> {
    const customers = await this.prisma.customer.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        companyName: true,
        segment: true,
        arrValue: true,
        accountPriority: true,
        lifecycleStage: true,
        churnRisk: true,
        ciqInfluenceScore: true,
        featureDemandScore: true,
        supportIntensityScore: true,
        healthScore: true,
        _count: {
          select: {
            feedbacks: true,
            deals: true,
          },
        },
      },
      orderBy: [
        { ciqInfluenceScore: { sort: 'desc', nulls: 'last' } },
        { arrValue: { sort: 'desc', nulls: 'last' } },
      ],
      take: limit * 2,
    });

    const ranked: CustomerRankingItem[] = customers.map((c) => {
      const arrValue = c.arrValue ?? 0;
      const priorityNum = ACCOUNT_PRIORITY_MAP[c.accountPriority];
      const churnRisk = c.churnRisk ?? 0;
      const feedbackCount = c._count.feedbacks;
      const dealCount = c._count.deals;

      // Segment multiplier
      const segmentMultiplier =
        c.segment === 'ENTERPRISE'
          ? 1.3
          : c.segment === 'MID_MARKET'
            ? 1.1
            : 1.0;

      const normArr = logNorm(arrValue, 7) * segmentMultiplier;
      const normPriority = (priorityNum / 4) * 100;
      const normFeedback = countNorm(feedbackCount, 20);
      const normDeals = countNorm(dealCount, 5);
      const normChurn = churnRisk; // already 0–100

      const breakdown: Record<string, CiqScoreBreakdown> = {
        customerArr: {
          value: clamp100(normArr),
          weight: 0.35,
          contribution: clamp100(normArr) * 0.35,
          label: 'ARR × segment weight',
        },
        accountPriority: {
          value: normPriority,
          weight: 0.2,
          contribution: normPriority * 0.2,
          label: 'Account priority',
        },
        feedbackVolume: {
          value: normFeedback,
          weight: 0.2,
          contribution: normFeedback * 0.2,
          label: 'Feedback volume',
        },
        dealPipeline: {
          value: normDeals,
          weight: 0.15,
          contribution: normDeals * 0.15,
          label: 'Deal pipeline activity',
        },
        churnRiskPenalty: {
          value: normChurn,
          weight: 0.1,
          contribution: normChurn * 0.1,
          label: 'Churn risk signal',
        },
      };

      const ciqScore = clamp100(
        Object.values(breakdown).reduce((s, c) => s + c.contribution, 0),
      );

      return {
        customerId: c.id,
        name: c.name,
        companyName: c.companyName,
        segment: c.segment,
        arrValue,
        ciqScore: parseFloat(ciqScore.toFixed(2)),
        ciqInfluenceScore: c.ciqInfluenceScore ?? 0,
        featureDemandScore: c.featureDemandScore ?? 0,
        supportIntensityScore: c.supportIntensityScore ?? 0,
        healthScore: c.healthScore ?? 0,
        dealCount,
        feedbackCount,
        churnRisk: churnRisk,
        breakdown,
      };
    });

    return ranked.sort((a, b) => b.ciqScore - a.ciqScore).slice(0, limit);
  }

  // ─── 4. Strategic Signals ─────────────────────────────────────────────────

  /**
   * Produce workspace-level strategic signals:
   *   - Top CIQ themes with roadmap recommendations
   *   - Voice complaint / urgency summary
   *   - Survey demand validation summary
   *   - Support spike summary
   *   - Composite signal list for the intelligence feed
   */
  async getStrategicSignals(
    workspaceId: string,
  ): Promise<StrategicSignalsOutput> {
    const [themes, surveyResponses, supportSpikes, customerSignals] =
      await Promise.all([
        // Top 20 non-archived themes with roadmap linkage (AI_GENERATED + VERIFIED)
        this.prisma.theme.findMany({
          where: { workspaceId, status: { not: ThemeStatus.ARCHIVED } },
          select: {
            id: true,
            title: true,
            priorityScore: true,
            ciqScore: true,
            pinned: true,
            roadmapItems: {
              select: { id: true, status: true },
              take: 1,
              orderBy: { createdAt: 'desc' },
            },
            feedbacks: {
              select: {
                feedback: {
                  select: {
                    metadata: true,
                    sentiment: true,
                    ciqScore: true,
                    createdAt: true,
                  },
                },
              },
            },
          },
          orderBy: [
            { priorityScore: { sort: 'desc', nulls: 'last' } },
            { pinned: 'desc' },
          ],
          take: 20,
        }),

        // Survey responses with ciqWeight for demand validation
        this.prisma.surveyResponse.findMany({
          where: { workspaceId, ciqWeight: { not: null } },
          select: {
            id: true,
            ciqWeight: true,
            sentimentScore: true,
            submittedAt: true,
            survey: { select: { title: true, surveyType: true } },
          },
          orderBy: { submittedAt: 'desc' },
          take: 100,
        }),

        // Support spike events
        this.prisma.issueSpikeEvent.findMany({
          where: { workspaceId },
          select: {
            id: true,
            windowStart: true,
            ticketCount: true,
            clusterId: true,
          },
          orderBy: { windowStart: 'desc' },
          take: 20,
        }),

        // Customer signals for voice/support types
        this.prisma.customerSignal.findMany({
          where: { workspaceId },
          select: {
            id: true,
            signalType: true,
            strength: true,
            createdAt: true,
            customer: { select: { name: true } },
            theme: { select: { title: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
      ]);

    // ── Top themes ────────────────────────────────────────────────────────────
    const topThemes = themes.slice(0, 10).map((t) => ({
      themeId: t.id,
      title: t.title,
      ciqScore: parseFloat((t.ciqScore ?? t.priorityScore ?? 0).toFixed(2)),
      roadmapLinked: t.roadmapItems.length > 0,
    }));

    // ── Roadmap recommendations ───────────────────────────────────────────────
    const roadmapRecommendations = themes.slice(0, 10).map((t) => {
      const score = t.ciqScore ?? t.priorityScore ?? 0;
      const latestRoadmapStatus = t.roadmapItems[0]?.status ?? null;

      let recommendation: StrategicSignalsOutput['roadmapRecommendations'][0]['recommendation'];
      let rationale: string;

      if (score >= 70) {
        if (
          latestRoadmapStatus === 'COMMITTED' ||
          latestRoadmapStatus === 'SHIPPED'
        ) {
          recommendation = 'already_committed';
          rationale = `High CIQ score (${score.toFixed(0)}) — already committed or shipped.`;
        } else {
          recommendation = 'promote_to_committed';
          rationale = `High CIQ score (${score.toFixed(0)}) with strong revenue signals — recommend committing to roadmap.`;
        }
      } else if (score >= 40) {
        recommendation = 'promote_to_planned';
        rationale = `Moderate CIQ score (${score.toFixed(0)}) — recommend adding to planned roadmap for further validation.`;
      } else {
        recommendation = 'monitor';
        rationale = `Low CIQ score (${score.toFixed(0)}) — monitor for signal growth before promoting.`;
      }

      return {
        themeId: t.id,
        title: t.title,
        ciqScore: parseFloat(score.toFixed(2)),
        currentStatus: latestRoadmapStatus,
        recommendation,
        rationale,
      };
    });

    // ── Voice sentiment summary ───────────────────────────────────────────────
    const voiceFeedbacks = themes.flatMap((t) =>
      t.feedbacks
        .filter((tf) => {
          const meta = tf.feedback.metadata as Record<string, unknown> | null;
          return meta?.intelligence != null;
        })
        .map((tf) => {
          const meta = tf.feedback.metadata as Record<string, unknown>;
          const intel = meta.intelligence as Record<string, unknown>;
          return {
            sentiment: tf.feedback.sentiment ?? 0,
            urgency:
              typeof intel.urgencySignal === 'number' ? intel.urgencySignal : 0,
            churn:
              typeof intel.churnSignal === 'number' ? intel.churnSignal : 0,
            createdAt: tf.feedback.createdAt,
          };
        }),
    );

    const avgSentiment =
      voiceFeedbacks.length > 0
        ? voiceFeedbacks.reduce((s, v) => s + v.sentiment, 0) /
          voiceFeedbacks.length
        : 0;
    const urgentCount = voiceFeedbacks.filter((v) => v.urgency > 0.5).length;
    const complaintCount = voiceFeedbacks.filter(
      (v) => v.churn > 0.5 || v.urgency > 0.7,
    ).length;

    // ── Survey demand summary ─────────────────────────────────────────────────
    const avgCiqWeight =
      surveyResponses.length > 0
        ? surveyResponses.reduce((s, r) => s + (r.ciqWeight ?? 0), 0) /
          surveyResponses.length
        : 0;
    const validationCount = surveyResponses.length;
    const featureValidationCount = surveyResponses.filter(
      (r) =>
        r.survey.surveyType === 'FEATURE_VALIDATION' ||
        r.survey.surveyType === 'ROADMAP_VALIDATION',
    ).length;

    // ── Support spike summary ─────────────────────────────────────────────────
    const spikeCount = supportSpikes.length;
    const negativeSentimentCount = customerSignals.filter(
      (s) =>
        s.signalType.toLowerCase().includes('negative') ||
        s.signalType.toLowerCase().includes('churn'),
    ).length;

    // ── Signal feed ───────────────────────────────────────────────────────────
    const signals: StrategicSignal[] = [];

    // High-CIQ themes without roadmap linkage; also surface unscored themes with feedback
    for (const t of themes) {
      const score = t.ciqScore ?? t.priorityScore ?? 0;
      const feedbackCount = t.feedbacks?.length ?? 0;
      if (score >= 30 && t.roadmapItems.length === 0) {
        signals.push({
          type: 'theme',
          entityId: t.id,
          entityTitle: t.title,
          signal: 'high_ciq_no_roadmap',
          strength: score / 100,
          detail: `Theme "${t.title}" has CIQ score ${score.toFixed(0)} but no roadmap item.`,
          detectedAt: new Date(),
        });
      } else if (
        score === 0 &&
        feedbackCount >= 1 &&
        t.roadmapItems.length === 0
      ) {
        // Theme has feedback but hasn't been CIQ-scored yet — surface as pending signal
        signals.push({
          type: 'feedback',
          entityId: t.id,
          entityTitle: t.title,
          signal: 'pending_ciq_scoring',
          strength: Math.min(0.5, feedbackCount / 10),
          detail: `Theme "${t.title}" has ${feedbackCount} feedback item${feedbackCount !== 1 ? 's' : ''} awaiting CIQ scoring.`,
          detectedAt: new Date(),
        });
      }
    }

    // Support spikes
    for (const spike of supportSpikes.slice(0, 5)) {
      signals.push({
        type: 'support',
        entityId: spike.id,
        entityTitle: `Support cluster ${spike.clusterId.slice(0, 8)}`,
        signal: 'support_spike',
        strength: Math.min(1, spike.ticketCount / 20),
        detail: `Support spike detected: ${spike.ticketCount} tickets in cluster.`,
        detectedAt: spike.windowStart,
      });
    }

    // High-urgency voice signals
    for (const v of voiceFeedbacks.filter((v) => v.urgency > 0.7).slice(0, 5)) {
      signals.push({
        type: 'voice',
        entityId: 'voice-signal',
        entityTitle: 'Voice feedback',
        signal: 'high_urgency_voice',
        strength: v.urgency,
        detail: `High-urgency voice signal detected (urgency=${v.urgency.toFixed(2)}).`,
        detectedAt: v.createdAt,
      });
    }

    // High-weight survey responses
    for (const r of surveyResponses
      .filter((r) => (r.ciqWeight ?? 0) >= 0.7)
      .slice(0, 5)) {
      signals.push({
        type: 'survey',
        entityId: r.id,
        entityTitle: r.survey.title,
        signal: 'high_demand_survey',
        strength: r.ciqWeight ?? 0,
        detail: `Survey "${r.survey.title}" response with high demand validation weight (${(r.ciqWeight ?? 0).toFixed(2)}).`,
        detectedAt: r.submittedAt,
      });
    }

    // Sort signals by strength desc
    signals.sort((a, b) => b.strength - a.strength);

    return {
      topThemes,
      roadmapRecommendations,
      signals: signals.slice(0, 20),
      voiceSentimentSummary: {
        avgSentiment: parseFloat(avgSentiment.toFixed(3)),
        urgentCount,
        complaintCount,
      },
      surveyDemandSummary: {
        avgCiqWeight: parseFloat(avgCiqWeight.toFixed(3)),
        validationCount,
        featureValidationCount,
      },
      supportSpikeSummary: {
        spikeCount,
        negativeSentimentCount,
      },
    };
  }

  // ─── 5. Persist CIQ scores ────────────────────────────────────────────────

  /**
   * Persist ciqScore back to a Feedback row.
   * Called by CiqScoringProcessor after FEEDBACK_SCORED jobs.
   */
  async persistFeedbackCiqScore(
    feedbackId: string,
    ciqScore: number,
  ): Promise<void> {
    try {
      await this.prisma.feedback.update({
        where: { id: feedbackId },
        data: { ciqScore: parseFloat(ciqScore.toFixed(2)) },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to persist feedback ciqScore: ${(err as Error).message}`,
      );
    }
  }

  // ─── 5b. Single-theme scorer for persistence (M1 fix) ───────────────────

  /**
   * Score a single theme using the canonical 7-factor formula (same as
   * getThemeRanking) and return the result for persistence.
   *
   * This replaces CiqService.scoreTheme for the THEME_SCORED pipeline path,
   * ensuring the persisted ciqScore always matches what the ranking pages show.
   * Fixes M1 (formula mismatch) and M5 (live vs persisted mismatch).
   */
  async scoreThemeForPersistence(themeId: string): Promise<{
    ciqScore: number;
    breakdown: Record<string, CiqScoreBreakdown>;
    feedbackCount: number;
    uniqueCustomerCount: number;
    voiceCount: number;
    supportCount: number;
    surveyCount: number;
    totalSignalCount: number;
    revenueInfluence: number;
    dealInfluenceValue: number;
    aiConfidence?: number;
  }> {
    const EMPTY = {
      ciqScore: 0, breakdown: {} as Record<string, CiqScoreBreakdown>,
      feedbackCount: 0, uniqueCustomerCount: 0,
      voiceCount: 0, supportCount: 0, surveyCount: 0, totalSignalCount: 0,
      revenueInfluence: 0, dealInfluenceValue: 0, aiConfidence: 0,
    };
    const theme = await this.prisma.theme.findUnique({
      where: { id: themeId },
      select: {
        id: true,
        feedbackCount: true, voiceCount: true, supportCount: true,
        surveyCount: true, totalSignalCount: true, revenueInfluence: true,
        autoMergeCandidate: true,
        resurfaceCount: true,
        recentSignalCount: true,
        lastEvidenceAt: true,
        createdAt: true,
        feedbacks: {
          where: {
            feedback: {
              status: { notIn: [FeedbackStatus.ARCHIVED, FeedbackStatus.MERGED] },
            },
          },
          select: {
            feedback: {
              select: {
                id: true,
                customerId: true,
                sentiment: true,
                ciqScore: true,
                metadata: true,
                sourceType: true,
                primarySource: true,
                title: true,
                createdAt: true,
                status: true,
                customer: { select: { arrValue: true, accountPriority: true } },
              },
            },
          },
        },
        dealLinks: {
          select: { deal: { select: { annualValue: true, stage: true, status: true } } },
        },
        customerSignals: { select: { signalType: true, strength: true } },
      },
    });
    if (!theme) return EMPTY;

    const activeFeedback = theme.feedbacks.filter((tf) => tf.feedback != null);
    // ── Signal extraction (Step 1: exclude ARCHIVED + MERGED feedback) ──────
    const feedbackCount = activeFeedback.length;
    const feedbackIds = activeFeedback.map((tf) => tf.feedback.id);

    // ── Source distribution ────────────────────────────────────────────────
    const sourceSet = new Set<string>();
    const sourceDist: Record<string, number> = {};
    for (const tf of activeFeedback) {
      const src = (tf.feedback.primarySource ?? tf.feedback.sourceType ?? 'FEEDBACK').toUpperCase();
      sourceSet.add(src);
      sourceDist[src] = (sourceDist[src] ?? 0) + 1;
    }
    const distinctSources = sourceSet.size;

    // ── Sentiment distribution ─────────────────────────────────────────────
    let negativeCount = 0;
    let positiveCount = 0;
    let neutralCount = 0;
    const sentiments: number[] = [];
    for (const tf of activeFeedback) {
      const s = tf.feedback.sentiment ?? 0;
      sentiments.push(s);
      if (s < -0.1) negativeCount++;
      else if (s > 0.1) positiveCount++;
      else neutralCount++;
    }
    const sentimentMean = sentiments.length > 0
      ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
      : 0;
    const sentimentVariance = sentiments.length > 0
      ? sentiments.reduce((s, v) => s + Math.pow(v - sentimentMean, 2), 0) / sentiments.length
      : 0;

    // ── Recency: days since most recent feedback ───────────────────────────
    const lastFeedbackAt: Date | null = activeFeedback.reduce<Date | null>((latest, tf) => {
      const d = tf.feedback.createdAt;
      if (!d) return latest;
      return !latest || d > latest ? d : latest;
    }, null) ?? theme.lastEvidenceAt ?? theme.createdAt ?? null;
    const daysSinceLast = lastFeedbackAt
      ? (Date.now() - lastFeedbackAt.getTime()) / (1000 * 60 * 60 * 24)
      : 0; // treat unknown recency as fresh (0 days) — conservative
    const resurfaceCountVal = theme.resurfaceCount ?? 0;
    // ── Voice metadata intelligence (urgency/churn signals from metadata.intelligence) ──
    let voiceUrgencyCount = 0;
    let voiceChurnCount = 0;
    for (const tf of activeFeedback) {
      const meta = tf.feedback.metadata as Record<string, unknown> | null;
      const intel = meta?.intelligence as Record<string, unknown> | null;
      if (intel) {
        if (typeof intel.urgencySignal === 'number' && intel.urgencySignal > 0.5) voiceUrgencyCount++;
        if (typeof intel.churnSignal === 'number' && intel.churnSignal > 0.5) voiceChurnCount++;
      }
    }
    // ── Support signal score from live CustomerSignal rows ───────────────────────
    const liveSupportSignalCount = theme.customerSignals.filter(
      (s) => s.signalType.toLowerCase().includes('support'),
    ).length;
    // ── Impact keyword detection ────────────────────────────────────────────────────
    const allText = activeFeedback.map((tf) => tf.feedback.title ?? '').join(' ');
    const hasEnterpriseSignal =
      sourceSet.has('SUPPORT') || liveSupportSignalCount > 0 || hasKeyword(allText, ENTERPRISE_KEYWORDS);
    const hasPaymentOrSecuritySignal = hasKeyword(allText, PAYMENT_SECURITY_KEYWORDS);
    const negativeRatio = feedbackCount > 0 ? negativeCount / feedbackCount : 0;
    const velScore = velocityScore(feedbackCount);
    const highNegativeSentiment = negativeRatio >= 0.7;
    const highVelocityFlag = velScore >= 0.5;

    // ── CIQ_SIGNAL_SNAPSHOT debug log ──────────────────────────────────────
    this.logger.debug(JSON.stringify({
      event: 'CIQ_SIGNAL_SNAPSHOT',
      themeId,
      feedbackCount,
      feedbackIds,
      sourceDistribution: sourceDist,
      sentimentDistribution: { positive: positiveCount, neutral: neutralCount, negative: negativeCount },
      daysSinceLast: parseFloat(daysSinceLast.toFixed(1)),
      resurfaceCount: resurfaceCountVal,
    }));

    // ── Step 7: WEAK theme guard ───────────────────────────────────────────
    if (feedbackCount === 0) {
      return {
        ciqScore: 0,
        breakdown: {},
        feedbackCount: 0,
        uniqueCustomerCount: 0,
        voiceCount: 0,
        supportCount: 0,
        surveyCount: 0,
        totalSignalCount: 0,
        revenueInfluence: 0,
        dealInfluenceValue: 0,
      };
    }

    // ── 6-factor business-grade CIQ ───────────────────────────────────────
    const { score: rawCiqScore, factors, multiplier } = computeBusinessCiq({
      feedbackCount,
      daysSinceLastFeedback: daysSinceLast,
      negativeCount,
      distinctSources,
      resurfaceCount: resurfaceCountVal,
      hasEnterpriseSignal,
      hasPaymentOrSecuritySignal,
      highNegativeSentiment,
      highVelocity: highVelocityFlag,
    });

    const breakdown: Record<string, CiqScoreBreakdown> = {
      velocity: { value: parseFloat((factors.velocity * 100).toFixed(1)), weight: 0.30, contribution: parseFloat((factors.velocity * 0.30 * 100).toFixed(2)), label: 'Feedback velocity' },
      sentiment: { value: parseFloat((factors.sentiment * 100).toFixed(1)), weight: 0.20, contribution: parseFloat((factors.sentiment * 0.20 * 100).toFixed(2)), label: 'Negative sentiment pressure' },
      recency: { value: parseFloat((factors.recency * 100).toFixed(1)), weight: 0.15, contribution: parseFloat((factors.recency * 0.15 * 100).toFixed(2)), label: 'Signal recency' },
      resurfacing: { value: parseFloat((factors.resurfacing * 100).toFixed(1)), weight: 0.15, contribution: parseFloat((factors.resurfacing * 0.15 * 100).toFixed(2)), label: 'Post-ship resurfacing' },
      sourceMix: { value: parseFloat((factors.sourceMix * 100).toFixed(1)), weight: 0.10, contribution: parseFloat((factors.sourceMix * 0.10 * 100).toFixed(2)), label: 'Source diversity' },
      confidence: { value: parseFloat((factors.confidence * 100).toFixed(1)), weight: 0.10, contribution: parseFloat((factors.confidence * 0.10 * 100).toFixed(2)), label: 'Signal confidence' },
    };

    // ── CIQ_FACTOR_BREAKDOWN debug log ─────────────────────────────────────
    this.logger.debug(JSON.stringify({
      event: 'CIQ_FACTOR_BREAKDOWN',
      themeId,
      factors,
      multiplier,
      rawCiqScore,
    }));

    const isNearDuplicate = theme.autoMergeCandidate ?? false;
    const ciqScore = isNearDuplicate
      ? Math.max(0, Math.round(rawCiqScore * 0.8))
      : rawCiqScore;

    // ── CIQ_FINAL_SCORE debug log ──────────────────────────────────────────
    this.logger.debug(JSON.stringify({
      event: 'CIQ_FINAL_SCORE',
      themeId,
      rawCiqScore,
      ciqScore,
      isNearDuplicate,
      priority: priorityLabel(ciqScore, negativeRatio, velScore),
    }));

    // ── Live source counts from active feedback rows ───────────────────────
    const liveVoiceCount = activeFeedback.filter(
      (tf) => (tf.feedback.sourceType ?? '').toUpperCase() === 'VOICE' ||
               (tf.feedback.primarySource ?? '').toUpperCase() === 'VOICE',
    ).length;
    const liveSupportCount = activeFeedback.filter(
      (tf) => (tf.feedback.sourceType ?? '').toUpperCase() === 'SUPPORT' ||
               (tf.feedback.primarySource ?? '').toUpperCase() === 'SUPPORT',
    ).length;
    const liveSurveyCount = activeFeedback.filter(
      (tf) => (tf.feedback.sourceType ?? '').toUpperCase() === 'SURVEY' ||
               (tf.feedback.primarySource ?? '').toUpperCase() === 'SURVEY',
    ).length;
    const liveTotalSignalCount = feedbackCount;

    // ── Revenue signals (kept for revenue intelligence display) ───────────
    const arrValue = activeFeedback.reduce(
      (s, tf) => s + (tf.feedback.customer?.arrValue ?? 0), 0,
    );
    const dealInfluenceValue = theme.dealLinks.reduce((s, dl) => {
      const sw = DEAL_STAGE_WEIGHT[dl.deal.stage] ?? 0;
      return s + dl.deal.annualValue * sw;
    }, 0);

    const uniqueCustomerIds = new Set(
      activeFeedback.map((tf) => tf.feedback.customerId).filter(Boolean),
    );
    const uniqueCustomerCount = uniqueCustomerIds.size;

    // ── Narration confidence ───────────────────────────────────────────────
    const aiConf = narrationConfidence(feedbackCount, distinctSources, sentimentVariance);

    return {
      ciqScore,
      breakdown,
      feedbackCount,
      uniqueCustomerCount,
      voiceCount: liveVoiceCount,
      supportCount: liveSupportCount,
      surveyCount: liveSurveyCount,
      totalSignalCount: liveTotalSignalCount,
      revenueInfluence: arrValue,
      dealInfluenceValue,
      aiConfidence: aiConf,
    };
  }

  /**
   * Persist canonical CIQ score to the Theme row in a single atomic write.
   * Replaces the two separate writes (CiqService.persistThemeScore +
   * CiqEngineService.persistThemeCiqScore) with one call (M8 fix).
   * Both ciqScore and priorityScore are set to the same value so that
   * all pages reading either field see a consistent number.
   */
  async persistCanonicalThemeScore(
    themeId: string,
    score: Awaited<ReturnType<CiqEngineService['scoreThemeForPersistence']>>,
  ): Promise<void> {
    try {
      await this.prisma.theme.update({
        where: { id: themeId },
        data: {
          ciqScore: score.ciqScore,
          priorityScore: score.ciqScore,   // keep both in sync (M8)
          lastScoredAt: new Date(),
          revenueInfluence: score.revenueInfluence,
          signalBreakdown: score.breakdown as object,
          feedbackCount: score.feedbackCount,
          voiceCount: score.voiceCount,
          supportCount: score.supportCount,
          surveyCount: score.surveyCount,
          totalSignalCount: score.totalSignalCount,
          ...(score.aiConfidence != null ? { aiConfidence: score.aiConfidence } : {}),
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to persist canonical theme CIQ score: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Persist ciqScore back to a Theme row (mirrors priorityScore).
   * @deprecated Use persistCanonicalThemeScore instead (M8 fix).
   */
  async persistThemeCiqScore(themeId: string, ciqScore: number): Promise<void> {
    try {
      await this.prisma.theme.update({
        where: { id: themeId },
        data: { ciqScore: parseFloat(ciqScore.toFixed(2)) },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to persist theme ciqScore: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Persist ciqScore back to a Deal row.
   * Called when a deal is created/updated.
   */
  async persistDealCiqScore(dealId: string, ciqScore: number): Promise<void> {
    try {
      await this.prisma.deal.update({
        where: { id: dealId },
        data: { ciqScore: parseFloat(ciqScore.toFixed(2)) },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to persist deal ciqScore: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Compute and persist ciqScore for a single deal.
   */
  async scoreDeal(workspaceId: string, dealId: string): Promise<number> {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, workspaceId },
      select: {
        annualValue: true,
        stage: true,
        status: true,
        influenceWeight: true,
        customer: { select: { arrValue: true, accountPriority: true } },
        themeLinks: { select: { themeId: true } },
      },
    });

    if (!deal) return 0;

    const stageWeight = DEAL_STAGE_WEIGHT[deal.stage] ?? 0;
    const dealValue = deal.annualValue * stageWeight * deal.influenceWeight;
    const arrValue = deal.customer?.arrValue ?? 0;
    const priorityNum =
      ACCOUNT_PRIORITY_MAP[
        deal.customer?.accountPriority ?? AccountPriority.MEDIUM
      ];
    const themeCount = deal.themeLinks.length;

    const normDeal = logNorm(dealValue, 7);
    const normArr = logNorm(arrValue, 7);
    const normPriority = (priorityNum / 4) * 100;
    const normTheme = countNorm(themeCount, 5);

    const ciqScore = clamp100(
      normDeal * 0.4 + normArr * 0.3 + normPriority * 0.2 + normTheme * 0.1,
    );

    await this.persistDealCiqScore(dealId, ciqScore);
    return ciqScore;
  }
}

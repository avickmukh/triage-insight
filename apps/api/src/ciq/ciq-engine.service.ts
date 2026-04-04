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
import { AccountPriority, DealStage, DealStatus, ThemeStatus } from '@prisma/client';

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

const ACCOUNT_PRIORITY_MAP: Record<AccountPriority, number> = {
  [AccountPriority.LOW]:      1,
  [AccountPriority.MEDIUM]:   2,
  [AccountPriority.HIGH]:     3,
  [AccountPriority.CRITICAL]: 4,
};

const DEAL_STAGE_WEIGHT: Record<DealStage, number> = {
  [DealStage.PROSPECTING]: 0.1,
  [DealStage.QUALIFYING]:  0.3,
  [DealStage.PROPOSAL]:    0.6,
  [DealStage.NEGOTIATION]: 0.8,
  [DealStage.CLOSED_WON]:  1.0,
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
  type: 'theme' | 'feedback' | 'deal' | 'customer' | 'voice' | 'survey' | 'support';
  entityId: string;
  entityTitle: string;
  signal: string;
  strength: number;
  detail: string;
  detectedAt: Date;
}

export interface StrategicSignalsOutput {
  topThemes: Array<{ themeId: string; title: string; ciqScore: number; roadmapLinked: boolean }>;
  roadmapRecommendations: Array<{
    themeId: string;
    title: string;
    ciqScore: number;
    currentStatus: string | null;
    recommendation: 'promote_to_planned' | 'promote_to_committed' | 'already_committed' | 'monitor';
    rationale: string;
  }>;
  signals: StrategicSignal[];
  voiceSentimentSummary: { avgSentiment: number; urgentCount: number; complaintCount: number };
  surveyDemandSummary: { avgCiqWeight: number; validationCount: number; featureValidationCount: number };
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
      const priorityRaw = fb.customer?.accountPriority ?? AccountPriority.MEDIUM;
      const priorityNum = ACCOUNT_PRIORITY_MAP[priorityRaw];
      const sentiment = fb.sentiment ?? 0;
      const voteCount = fb.votes.length;
      const duplicateClusterSize = fb.mergedFrom.length;
      const themeCount = fb.themes.length;
      const isRecent = fb.createdAt > thirtyDaysAgo;

      const normArr      = logNorm(arrValue, 7);
      const normPriority = (priorityNum / 4) * 100;
      const normSentimentUrgency = sentiment < 0 ? Math.abs(sentiment) * 100 : 0;
      const normVotes    = countNorm(voteCount, 50);
      const normCluster  = countNorm(duplicateClusterSize, 10);
      const normTheme    = themeCount > 0 ? 15 : 0;
      const normRecency  = isRecent ? 10 : 0;

      const breakdown: Record<string, CiqScoreBreakdown> = {
        customerArr:       { value: normArr,              weight: 0.30, contribution: normArr * 0.30,              label: 'Customer ARR' },
        accountPriority:   { value: normPriority,         weight: 0.20, contribution: normPriority * 0.20,         label: 'Account priority' },
        sentimentUrgency:  { value: normSentimentUrgency, weight: 0.15, contribution: normSentimentUrgency * 0.15, label: 'Sentiment urgency' },
        voteSignal:        { value: normVotes,            weight: 0.15, contribution: normVotes * 0.15,            label: 'Portal votes' },
        duplicateCluster:  { value: normCluster,          weight: 0.10, contribution: normCluster * 0.10,          label: 'Duplicate cluster size' },
        themeSignal:       { value: normTheme,            weight: 0.05, contribution: normTheme * 0.05,            label: 'Theme cluster signal' },
        recencySignal:     { value: normRecency,          weight: 0.05, contribution: normRecency * 0.05,          label: 'Recent activity (30d)' },
      };

      const ciqScore = clamp100(
        Object.values(breakdown).reduce((s, c) => s + c.contribution, 0),
      );

      return {
        feedbackId:   fb.id,
        title:        fb.title,
        ciqScore:     parseFloat(ciqScore.toFixed(2)),
        impactScore:  fb.impactScore,
        voteCount,
        sentiment:    fb.sentiment,
        customerName: fb.customer?.name ?? null,
        customerArr:  arrValue,
        themeCount,
        breakdown,
      };
    });

    // Sort by live ciqScore and return top N
    return ranked
      .sort((a, b) => b.ciqScore - a.ciqScore)
      .slice(0, limit);
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
        feedbackCount:    true,
        voiceCount:       true,
        supportCount:     true,
        totalSignalCount: true,
        aiConfidence:       true,
        autoMergeCandidate: true,
        feedbacks: {
          select: {
            feedback: {
              select: {
                customerId: true,
                sentiment: true,
                ciqScore: true,
                metadata: true,
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

      // ── Feedback signals ──────────────────────────────────────────────────
      const feedbackCount = activeFeedback.length;
      const uniqueCustomerIds = new Set(
        activeFeedback.map((tf) => tf.feedback.customerId).filter(Boolean),
      );
      const uniqueCustomerCount = uniqueCustomerIds.size;
      const arrValue = activeFeedback.reduce(
        (s, tf) => s + (tf.feedback.customer?.arrValue ?? 0), 0,
      );

      // ── Deal signals ──────────────────────────────────────────────────────
      const dealInfluenceValue = theme.dealLinks.reduce((s, dl) => {
        if (dl.deal.status === DealStatus.LOST) return s;
        return s + dl.deal.annualValue * (DEAL_STAGE_WEIGHT[dl.deal.stage] ?? 0);
      }, 0);

      // ── Voice signals (from feedback metadata.intelligence) ───────────────
      let voiceUrgencySum = 0;
      let voiceComplaintCount = 0;
      for (const tf of activeFeedback) {
        const meta = tf.feedback.metadata as Record<string, unknown> | null;
        const intel = meta?.intelligence as Record<string, unknown> | null;
        if (intel) {
          const urgency = typeof intel.urgencySignal === 'number' ? intel.urgencySignal : 0;
          const churn   = typeof intel.churnSignal   === 'number' ? intel.churnSignal   : 0;
          voiceUrgencySum += urgency;
          if (urgency > 0.5 || churn > 0.5) voiceComplaintCount++;
        }
      }
      const voiceSignalScore = clamp100(
        countNorm(voiceComplaintCount, 5) * 0.5 + logNorm(voiceUrgencySum, 2) * 0.5,
      );

      // ── Survey signals (SurveyResponse.ciqWeight for linked surveys) ──────
      // We approximate via CustomerSignal rows with signalType containing 'survey'
      const surveySignals = theme.customerSignals.filter(
        (s) => s.signalType.toLowerCase().includes('survey'),
      );
      const surveySignalScore = clamp100(
        surveySignals.reduce((s, sig) => s + sig.strength, 0) * 20,
      );

      // ── Support signals ───────────────────────────────────────────────────
      const supportSignals = theme.customerSignals.filter(
        (s) => s.signalType.toLowerCase().includes('support') ||
               s.signalType.toLowerCase().includes('spike'),
      );
      const supportSignalScore = clamp100(
        supportSignals.reduce((s, sig) => s + sig.strength, 0) * 20,
      );

      // ── Composite CIQ score ───────────────────────────────────────────────
      const normFreq       = countNorm(feedbackCount, 50);
      const normCustomers  = countNorm(uniqueCustomerCount, 20);
      const normArr        = logNorm(arrValue, 7);
      const normDeal       = logNorm(dealInfluenceValue, 7);

      const breakdown: Record<string, CiqScoreBreakdown> = {
        feedbackFrequency: { value: normFreq,          weight: 0.20, contribution: normFreq * 0.20,          label: 'Feedback frequency' },
        uniqueCustomers:   { value: normCustomers,     weight: 0.15, contribution: normCustomers * 0.15,     label: 'Unique customers' },
        arrRevenue:        { value: normArr,            weight: 0.25, contribution: normArr * 0.25,            label: 'Customer ARR' },
        dealInfluence:     { value: normDeal,           weight: 0.20, contribution: normDeal * 0.20,           label: 'Deal pipeline influence' },
        voiceSignal:       { value: voiceSignalScore,   weight: 0.10, contribution: voiceSignalScore * 0.10,   label: 'Voice complaint / urgency' },
        surveySignal:      { value: surveySignalScore,  weight: 0.05, contribution: surveySignalScore * 0.05,  label: 'Survey demand validation' },
        supportSignal:     { value: supportSignalScore, weight: 0.05, contribution: supportSignalScore * 0.05, label: 'Support spike signal' },
      };

      const ciqScore = clamp100(
        Object.values(breakdown).reduce((s, c) => s + c.contribution, 0),
      );

      // Use persisted counts from Theme row when available (set by unified CIQ scorer),
      // otherwise fall back to live-computed counts from the feedback join.
      const persistedFeedbackCount = theme.feedbackCount ?? feedbackCount;
      const persistedVoiceCount    = theme.voiceCount    ?? 0;
      const persistedSupportCount  = theme.supportCount  ?? 0;
      // Use live feedbackCount (from join) as primary fallback — persisted totalSignalCount may be null
      // before CIQ scoring has run. This ensures themes always appear in the ranking.
      const liveSignalCount = feedbackCount + (theme.voiceCount ?? 0) + (theme.supportCount ?? 0);
      const persistedTotalSignals  = theme.totalSignalCount ?? liveSignalCount;

      // ── Near-duplicate penalty (20% CIQ reduction for merge candidates) ────
      const isNearDuplicate = theme.autoMergeCandidate ?? false;
      const effectiveCiqScore = isNearDuplicate
        ? parseFloat((ciqScore * 0.80).toFixed(2))
        : parseFloat(ciqScore.toFixed(2));

      return {
        themeId:            theme.id,
        title:              theme.title,
        status:             theme.status,
        ciqScore:           effectiveCiqScore,
        priorityScore:      theme.priorityScore,
        revenueInfluence:   theme.revenueInfluence ?? 0,
        feedbackCount:      persistedFeedbackCount,
        uniqueCustomerCount,
        dealInfluenceValue,
        voiceSignalScore:   parseFloat(voiceSignalScore.toFixed(2)),
        surveySignalScore:  parseFloat(surveySignalScore.toFixed(2)),
        supportSignalScore: parseFloat(supportSignalScore.toFixed(2)),
        voiceCount:         persistedVoiceCount,
        supportCount:       persistedSupportCount,
        totalSignalCount:   persistedTotalSignals,
        lastScoredAt:       theme.lastScoredAt,
        aiConfidence:       theme.aiConfidence ?? null,
        isNearDuplicate,
        // drs / signalLabels / eligibility are not computed here (CIQ engine is
        // the live-scoring path; DRS is computed by ThemeRankingEngine).
        // Provide sensible defaults so the interface is satisfied.
        drs:          effectiveCiqScore,
        signalLabels: isNearDuplicate ? ['Near-duplicate'] : [],
        eligibility:  (persistedTotalSignals < 1 ? 'INELIGIBLE' : isNearDuplicate ? 'PENALISED' : 'ELIGIBLE') as 'ELIGIBLE' | 'PENALISED' | 'INELIGIBLE',
        breakdown,
      };
    })
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
        c.segment === 'ENTERPRISE' ? 1.3 :
        c.segment === 'MID_MARKET' ? 1.1 : 1.0;

      const normArr      = logNorm(arrValue, 7) * segmentMultiplier;
      const normPriority = (priorityNum / 4) * 100;
      const normFeedback = countNorm(feedbackCount, 20);
      const normDeals    = countNorm(dealCount, 5);
      const normChurn    = churnRisk; // already 0–100

      const breakdown: Record<string, CiqScoreBreakdown> = {
        customerArr:       { value: clamp100(normArr),  weight: 0.35, contribution: clamp100(normArr) * 0.35,  label: 'ARR × segment weight' },
        accountPriority:   { value: normPriority,       weight: 0.20, contribution: normPriority * 0.20,       label: 'Account priority' },
        feedbackVolume:    { value: normFeedback,       weight: 0.20, contribution: normFeedback * 0.20,       label: 'Feedback volume' },
        dealPipeline:      { value: normDeals,          weight: 0.15, contribution: normDeals * 0.15,          label: 'Deal pipeline activity' },
        churnRiskPenalty:  { value: normChurn,          weight: 0.10, contribution: normChurn * 0.10,          label: 'Churn risk signal' },
      };

      const ciqScore = clamp100(
        Object.values(breakdown).reduce((s, c) => s + c.contribution, 0),
      );

      return {
        customerId:           c.id,
        name:                 c.name,
        companyName:          c.companyName,
        segment:              c.segment,
        arrValue,
        ciqScore:             parseFloat(ciqScore.toFixed(2)),
        ciqInfluenceScore:    c.ciqInfluenceScore ?? 0,
        featureDemandScore:   c.featureDemandScore ?? 0,
        supportIntensityScore: c.supportIntensityScore ?? 0,
        healthScore:          c.healthScore ?? 0,
        dealCount,
        feedbackCount,
        churnRisk:            churnRisk,
        breakdown,
      };
    });

    return ranked
      .sort((a, b) => b.ciqScore - a.ciqScore)
      .slice(0, limit);
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
  async getStrategicSignals(workspaceId: string): Promise<StrategicSignalsOutput> {
    const [themes, surveyResponses, supportSpikes, customerSignals] = await Promise.all([
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
      themeId:       t.id,
      title:         t.title,
      ciqScore:      parseFloat((t.ciqScore ?? t.priorityScore ?? 0).toFixed(2)),
      roadmapLinked: t.roadmapItems.length > 0,
    }));

    // ── Roadmap recommendations ───────────────────────────────────────────────
    const roadmapRecommendations = themes.slice(0, 10).map((t) => {
      const score = t.ciqScore ?? t.priorityScore ?? 0;
      const latestRoadmapStatus = t.roadmapItems[0]?.status ?? null;

      let recommendation: StrategicSignalsOutput['roadmapRecommendations'][0]['recommendation'];
      let rationale: string;

      if (score >= 70) {
        if (latestRoadmapStatus === 'COMMITTED' || latestRoadmapStatus === 'SHIPPED') {
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
        themeId:         t.id,
        title:           t.title,
        ciqScore:        parseFloat(score.toFixed(2)),
        currentStatus:   latestRoadmapStatus,
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
            sentiment:    tf.feedback.sentiment ?? 0,
            urgency:      typeof intel.urgencySignal === 'number' ? intel.urgencySignal : 0,
            churn:        typeof intel.churnSignal   === 'number' ? intel.churnSignal   : 0,
            createdAt:    tf.feedback.createdAt,
          };
        }),
    );

    const avgSentiment = voiceFeedbacks.length > 0
      ? voiceFeedbacks.reduce((s, v) => s + v.sentiment, 0) / voiceFeedbacks.length
      : 0;
    const urgentCount    = voiceFeedbacks.filter((v) => v.urgency > 0.5).length;
    const complaintCount = voiceFeedbacks.filter((v) => v.churn > 0.5 || v.urgency > 0.7).length;

    // ── Survey demand summary ─────────────────────────────────────────────────
    const avgCiqWeight = surveyResponses.length > 0
      ? surveyResponses.reduce((s, r) => s + (r.ciqWeight ?? 0), 0) / surveyResponses.length
      : 0;
    const validationCount = surveyResponses.length;
    const featureValidationCount = surveyResponses.filter(
      (r) => r.survey.surveyType === 'FEATURE_VALIDATION' || r.survey.surveyType === 'ROADMAP_VALIDATION',
    ).length;

    // ── Support spike summary ─────────────────────────────────────────────────
    const spikeCount = supportSpikes.length;
    const negativeSentimentCount = customerSignals.filter(
      (s) => s.signalType.toLowerCase().includes('negative') ||
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
          type:         'theme',
          entityId:     t.id,
          entityTitle:  t.title,
          signal:       'high_ciq_no_roadmap',
          strength:     score / 100,
          detail:       `Theme "${t.title}" has CIQ score ${score.toFixed(0)} but no roadmap item.`,
          detectedAt:   new Date(),
        });
      } else if (score === 0 && feedbackCount >= 1 && t.roadmapItems.length === 0) {
        // Theme has feedback but hasn't been CIQ-scored yet — surface as pending signal
        signals.push({
          type:         'feedback',
          entityId:     t.id,
          entityTitle:  t.title,
          signal:       'pending_ciq_scoring',
          strength:     Math.min(0.5, feedbackCount / 10),
          detail:       `Theme "${t.title}" has ${feedbackCount} feedback item${feedbackCount !== 1 ? 's' : ''} awaiting CIQ scoring.`,
          detectedAt:   new Date(),
        });
      }
    }

    // Support spikes
    for (const spike of supportSpikes.slice(0, 5)) {
      signals.push({
        type:         'support',
        entityId:     spike.id,
        entityTitle:  `Support cluster ${spike.clusterId.slice(0, 8)}`,
        signal:       'support_spike',
        strength:     Math.min(1, spike.ticketCount / 20),
        detail:       `Support spike detected: ${spike.ticketCount} tickets in cluster.`,
        detectedAt:   spike.windowStart,
      });
    }

    // High-urgency voice signals
    for (const v of voiceFeedbacks.filter((v) => v.urgency > 0.7).slice(0, 5)) {
      signals.push({
        type:         'voice',
        entityId:     'voice-signal',
        entityTitle:  'Voice feedback',
        signal:       'high_urgency_voice',
        strength:     v.urgency,
        detail:       `High-urgency voice signal detected (urgency=${v.urgency.toFixed(2)}).`,
        detectedAt:   v.createdAt,
      });
    }

    // High-weight survey responses
    for (const r of surveyResponses.filter((r) => (r.ciqWeight ?? 0) >= 0.7).slice(0, 5)) {
      signals.push({
        type:         'survey',
        entityId:     r.id,
        entityTitle:  r.survey.title,
        signal:       'high_demand_survey',
        strength:     r.ciqWeight ?? 0,
        detail:       `Survey "${r.survey.title}" response with high demand validation weight (${(r.ciqWeight ?? 0).toFixed(2)}).`,
        detectedAt:   r.submittedAt,
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
        avgCiqWeight:           parseFloat(avgCiqWeight.toFixed(3)),
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
  async persistFeedbackCiqScore(feedbackId: string, ciqScore: number): Promise<void> {
    try {
      await this.prisma.feedback.update({
        where: { id: feedbackId },
        data: { ciqScore: parseFloat(ciqScore.toFixed(2)) },
      });
    } catch (err) {
      this.logger.warn(`Failed to persist feedback ciqScore: ${(err as Error).message}`);
    }
  }

  /**
   * Persist ciqScore back to a Theme row (mirrors priorityScore).
   * Called by CiqScoringProcessor after THEME_SCORED jobs.
   */
  async persistThemeCiqScore(themeId: string, ciqScore: number): Promise<void> {
    try {
      await this.prisma.theme.update({
        where: { id: themeId },
        data: { ciqScore: parseFloat(ciqScore.toFixed(2)) },
      });
    } catch (err) {
      this.logger.warn(`Failed to persist theme ciqScore: ${(err as Error).message}`);
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
      this.logger.warn(`Failed to persist deal ciqScore: ${(err as Error).message}`);
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
    const dealValue   = deal.annualValue * stageWeight * deal.influenceWeight;
    const arrValue    = deal.customer?.arrValue ?? 0;
    const priorityNum = ACCOUNT_PRIORITY_MAP[deal.customer?.accountPriority ?? AccountPriority.MEDIUM];
    const themeCount  = deal.themeLinks.length;

    const normDeal     = logNorm(dealValue, 7);
    const normArr      = logNorm(arrValue, 7);
    const normPriority = (priorityNum / 4) * 100;
    const normTheme    = countNorm(themeCount, 5);

    const ciqScore = clamp100(
      normDeal * 0.40 + normArr * 0.30 + normPriority * 0.20 + normTheme * 0.10,
    );

    await this.persistDealCiqScore(dealId, ciqScore);
    return ciqScore;
  }
}

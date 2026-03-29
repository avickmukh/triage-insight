/**
 * PrioritizationAggregationService
 *
 * Enterprise-grade Prioritization Engine powered by CIQ.
 *
 * Scoring dimensions (4):
 *   1. Demand Strength    — feedback cluster size, vote velocity, sentiment polarity, survey validation
 *   2. Revenue Impact     — ARR-weighted demand, deal blocking signal, enterprise account weighting, churn risk
 *   3. Strategic Importance — admin strategic tag, roadmap alignment, product vision weighting
 *   4. Urgency Signals    — support spike correlation, negative voice trend, escalation flags
 *
 * Output types (5):
 *   1. feature_priority_rank          — per-feedback item composite rank
 *   2. theme_priority_rank            — per-theme composite rank
 *   3. roadmap_recommendation_score   — per-roadmap-item priority score
 *   4. urgency_score                  — per-theme/feedback urgency composite
 *   5. revenue_opportunity_score      — per-theme/feedback ARR-weighted opportunity
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountPriority, DealStage, DealStatus, ThemeStatus, RoadmapStatus } from '@prisma/client';

// ─── Normalisation helpers ────────────────────────────────────────────────────
function logNorm(value: number, scale = 7): number {
  if (value <= 0) return 0;
  return Math.min(100, (Math.log10(value + 1) / scale) * 100);
}
function countNorm(value: number, cap = 50): number {
  return Math.min(100, (value / cap) * 100);
}
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
const STRATEGIC_TAG_MULTIPLIER: Record<string, number> = {
  strategic:       1.5,
  core:            1.2,
  'nice-to-have':  0.8,
  deprioritised:   0.3,
};
const ROADMAP_STATUS_MULTIPLIER: Record<RoadmapStatus, number> = {
  [RoadmapStatus.BACKLOG]:   0.5,
  [RoadmapStatus.EXPLORING]: 0.8,
  [RoadmapStatus.PLANNED]:   1.0,
  [RoadmapStatus.COMMITTED]: 1.2,
  [RoadmapStatus.SHIPPED]:   0.0,
};

// ─── Output interfaces ────────────────────────────────────────────────────────
export interface DimensionScore {
  raw: number;
  normalised: number;
  weight: number;
  contribution: number;
  label: string;
  factors: Record<string, number>;
}
export interface PrioritizationScoreBreakdown {
  demandStrength:       DimensionScore;
  revenueImpact:        DimensionScore;
  strategicImportance:  DimensionScore;
  urgencySignal:        DimensionScore;
}
export interface FeaturePriorityItem {
  feedbackId:              string;
  title:                   string;
  featurePriorityRank:     number;
  priorityScore:           number;
  urgencyScore:            number;
  revenueOpportunityScore: number;
  voteCount:               number;
  voteVelocity:            number;
  sentiment:               number | null;
  customerName:            string | null;
  customerArr:             number;
  themeCount:              number;
  breakdown:               PrioritizationScoreBreakdown;
}
export interface ThemePriorityItem {
  themeId:                 string;
  title:                   string;
  status:                  string;
  themePriorityRank:       number;
  priorityScore:           number;
  revenueScore:            number;
  urgencyScore:            number;
  revenueOpportunityScore: number;
  feedbackCount:           number;
  uniqueCustomerCount:     number;
  revenueInfluence:        number;
  dealInfluenceValue:      number;
  strategicTag:            string | null;
  manualOverrideScore:     number | null;
  hasManualOverride:       boolean;
  lastScoredAt:            Date | null;
  breakdown:               PrioritizationScoreBreakdown;
}
export interface RoadmapRecommendationItem {
  roadmapItemId:              string;
  title:                      string;
  status:                     string;
  themeId:                    string | null;
  themeTitle:                 string | null;
  roadmapRecommendationScore: number;
  urgencyScore:               number;
  revenueOpportunityScore:    number;
  priorityScore:              number;
  recommendation:             'promote_to_committed' | 'promote_to_planned' | 'keep_current' | 'deprioritise' | 'already_shipped';
  rationale:                  string;
  breakdown:                  PrioritizationScoreBreakdown;
}
export interface PrioritizationOpportunity {
  type:                    'theme' | 'feature' | 'roadmap';
  entityId:                string;
  title:                   string;
  opportunityScore:        number;
  revenueOpportunityScore: number;
  urgencyScore:            number;
  reason:                  string;
  arrAtRisk:               number;
  dealCount:               number;
}
/** @deprecated Use ThemePriorityItem instead */
export interface ThemeData {
  themeId:              string;
  requestFrequency:     number;
  uniqueCustomerCount:  number;
  arrValue:             number;
  accountPriorityValue: number;
  dealInfluenceValue:   number;
}

interface DimensionWeights {
  demandStrengthWeight:      number;
  revenueImpactWeight:       number;
  strategicImportanceWeight: number;
  urgencySignalWeight:       number;
}
const DEFAULT_WEIGHTS: DimensionWeights = {
  demandStrengthWeight:      0.30,
  revenueImpactWeight:       0.35,
  strategicImportanceWeight: 0.20,
  urgencySignalWeight:       0.15,
};

// ─── Service ──────────────────────────────────────────────────────────────────
@Injectable()
export class AggregationService {
  private readonly logger = new Logger(AggregationService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── 1. Feature Priority Ranking ──────────────────────────────────────────
  async getFeaturePriorityRanking(workspaceId: string, limit = 50): Promise<FeaturePriorityItem[]> {
    const [feedbacks, settings] = await Promise.all([
      this.prisma.feedback.findMany({
        where: { workspaceId, status: { not: 'MERGED' } },
        select: {
          id: true, title: true, sentiment: true, impactScore: true,
          ciqScore: true, urgencySignal: true, voteVelocity: true, createdAt: true,
          customer: { select: { name: true, arrValue: true, accountPriority: true, segment: true, churnRisk: true } },
          votes: { select: { id: true } },
          themes: {
            select: {
              theme: {
                select: {
                  id: true, strategicTag: true,
                  dealLinks: { select: { deal: { select: { annualValue: true, stage: true, status: true } } } },
                },
              },
            },
          },
          mergedFrom: { select: { id: true } },
        },
        orderBy: { ciqScore: { sort: 'desc', nulls: 'last' } },
        take: limit * 3,
      }),
      this.prisma.prioritizationSettings.findUnique({ where: { workspaceId } }),
    ]);

    const weights: DimensionWeights = settings ? {
      demandStrengthWeight:      settings.demandStrengthWeight,
      revenueImpactWeight:       settings.revenueImpactWeight,
      strategicImportanceWeight: settings.strategicImportanceWeight,
      urgencySignalWeight:       settings.urgencySignalWeight,
    } : DEFAULT_WEIGHTS;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const ranked: FeaturePriorityItem[] = feedbacks.map((fb) => {
      const arrValue     = fb.customer?.arrValue ?? 0;
      const priorityNum  = ACCOUNT_PRIORITY_MAP[fb.customer?.accountPriority ?? AccountPriority.MEDIUM];
      const voteCount    = fb.votes.length;
      const clusterSize  = fb.mergedFrom.length;
      const themeCount   = fb.themes.length;
      const isRecent     = fb.createdAt > thirtyDaysAgo;
      const voteVelocity = fb.voteVelocity ?? 0;
      const churnRisk    = fb.customer?.churnRisk ?? 0;
      const urgencyRaw   = fb.urgencySignal ?? 0;
      const firstTheme   = fb.themes[0]?.theme;
      const strategicTag = firstTheme?.strategicTag ?? null;
      const tagMult      = strategicTag ? (STRATEGIC_TAG_MULTIPLIER[strategicTag] ?? 1.0) : 1.0;
      const dealValue    = (firstTheme?.dealLinks ?? []).reduce((sum, dl) => {
        if (!dl.deal || dl.deal.status === DealStatus.LOST) return sum;
        return sum + (dl.deal.annualValue ?? 0) * (DEAL_STAGE_WEIGHT[dl.deal.stage] ?? 0);
      }, 0);

      const demandFactors = {
        clusterSize:       countNorm(clusterSize, 10),
        voteVelocity:      countNorm(voteVelocity, 5),
        sentimentPolarity: (fb.sentiment ?? 0) < 0 ? Math.abs(fb.sentiment ?? 0) * 100 : 0,
        surveyValidation:  0,
      };
      const demandNorm = clamp100(
        demandFactors.clusterSize * 0.35 +
        demandFactors.voteVelocity * 0.30 +
        demandFactors.sentimentPolarity * 0.25,
      );

      const revenueFactors = {
        arrWeighted:      logNorm(arrValue, 7),
        dealBlocking:     logNorm(dealValue, 6),
        enterpriseWeight: (priorityNum / 4) * 100,
        churnRiskLinkage: churnRisk * 100,
      };
      const revenueNorm = clamp100(
        revenueFactors.arrWeighted * 0.40 +
        revenueFactors.dealBlocking * 0.30 +
        revenueFactors.enterpriseWeight * 0.20 +
        revenueFactors.churnRiskLinkage * 0.10,
      );

      const strategicFactors = {
        adminStrategicTag: strategicTag === 'strategic' ? 100 : strategicTag === 'core' ? 70 : strategicTag === 'nice-to-have' ? 30 : 50,
        roadmapAlignment:  themeCount > 0 ? 60 : 0,
        productVision:     isRecent ? 20 : 0,
      };
      const strategicNorm = clamp100(
        (strategicFactors.adminStrategicTag * 0.50 +
         strategicFactors.roadmapAlignment * 0.35 +
         strategicFactors.productVision * 0.15) * tagMult,
      );

      const urgencyFactors = {
        supportSpikeCorrelation: 0,
        negativeVoiceTrend:      urgencyRaw * 100,
        escalationFlags:         churnRisk >= 0.7 ? 80 : churnRisk >= 0.4 ? 40 : 0,
      };
      const urgencyNorm = clamp100(
        urgencyFactors.negativeVoiceTrend * 0.40 +
        urgencyFactors.escalationFlags * 0.20,
      );

      const priorityScore = clamp100(
        demandNorm  * weights.demandStrengthWeight +
        revenueNorm * weights.revenueImpactWeight +
        strategicNorm * weights.strategicImportanceWeight +
        urgencyNorm * weights.urgencySignalWeight,
      );

      const breakdown: PrioritizationScoreBreakdown = {
        demandStrength:      { raw: demandNorm, normalised: demandNorm, weight: weights.demandStrengthWeight, contribution: demandNorm * weights.demandStrengthWeight, label: 'Demand Strength', factors: demandFactors },
        revenueImpact:       { raw: revenueNorm, normalised: revenueNorm, weight: weights.revenueImpactWeight, contribution: revenueNorm * weights.revenueImpactWeight, label: 'Revenue Impact', factors: revenueFactors },
        strategicImportance: { raw: strategicNorm, normalised: strategicNorm, weight: weights.strategicImportanceWeight, contribution: strategicNorm * weights.strategicImportanceWeight, label: 'Strategic Importance', factors: strategicFactors },
        urgencySignal:       { raw: urgencyNorm, normalised: urgencyNorm, weight: weights.urgencySignalWeight, contribution: urgencyNorm * weights.urgencySignalWeight, label: 'Urgency Signals', factors: urgencyFactors },
      };

      return {
        feedbackId: fb.id, title: fb.title, featurePriorityRank: 0,
        priorityScore: parseFloat(priorityScore.toFixed(2)),
        urgencyScore: parseFloat(urgencyNorm.toFixed(2)),
        revenueOpportunityScore: parseFloat(revenueNorm.toFixed(2)),
        voteCount, voteVelocity, sentiment: fb.sentiment,
        customerName: fb.customer?.name ?? null, customerArr: arrValue, themeCount, breakdown,
      };
    });

    return ranked
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, limit)
      .map((item, i) => ({ ...item, featurePriorityRank: i + 1 }));
  }

  // ─── 2. Theme Priority Ranking ─────────────────────────────────────────────
  async getThemePriorityRanking(workspaceId: string, limit = 50): Promise<ThemePriorityItem[]> {
    const [themes, settings, supportSpikes] = await Promise.all([
      this.prisma.theme.findMany({
        where: { workspaceId, status: { not: ThemeStatus.ARCHIVED } },
        select: {
          id: true, title: true, status: true, priorityScore: true, ciqScore: true,
          revenueScore: true, urgencyScore: true, revenueInfluence: true, lastScoredAt: true,
          signalBreakdown: true, strategicTag: true, manualOverrideScore: true, overrideReason: true,
          feedbacks: {
            select: {
              feedback: {
                select: {
                  customerId: true, sentiment: true, urgencySignal: true, voteVelocity: true,
                  customer: { select: { arrValue: true, accountPriority: true, churnRisk: true } },
                  votes: { select: { id: true } },
                },
              },
            },
          },
          dealLinks: { select: { deal: { select: { annualValue: true, stage: true, status: true } } } },
          roadmapItems: { select: { id: true, status: true }, take: 1, orderBy: { createdAt: 'desc' } },
          correlations: { select: { id: true, ticketCount: true }, take: 5 },
        },
        orderBy: [{ priorityScore: { sort: 'desc', nulls: 'last' } }, { pinned: 'desc' }],
        take: limit * 2,
      }),
      this.prisma.prioritizationSettings.findUnique({ where: { workspaceId } }),
      this.prisma.issueSpikeEvent.findMany({
        where: { workspaceId },
        select: { clusterId: true, ticketCount: true, zScore: true },
        orderBy: { windowStart: 'desc' },
        take: 50,
      }),
    ]);

    const weights: DimensionWeights = settings ? {
      demandStrengthWeight:      settings.demandStrengthWeight,
      revenueImpactWeight:       settings.revenueImpactWeight,
      strategicImportanceWeight: settings.strategicImportanceWeight,
      urgencySignalWeight:       settings.urgencySignalWeight,
    } : DEFAULT_WEIGHTS;

    const spikeByCluster = new Map<string, number>();
    for (const spike of supportSpikes) {
      spikeByCluster.set(spike.clusterId, (spikeByCluster.get(spike.clusterId) ?? 0) + spike.zScore);
    }

    const ranked: ThemePriorityItem[] = themes.map((theme) => {
      // Manual override takes precedence
      if (theme.manualOverrideScore != null) {
        const tagMult = theme.strategicTag ? (STRATEGIC_TAG_MULTIPLIER[theme.strategicTag] ?? 1.0) : 1.0;
        const overrideScore = clamp100(theme.manualOverrideScore * tagMult);
        const placeholder: PrioritizationScoreBreakdown = {
          demandStrength:      { raw: 0, normalised: 0, weight: weights.demandStrengthWeight, contribution: 0, label: 'Demand Strength', factors: {} },
          revenueImpact:       { raw: 0, normalised: 0, weight: weights.revenueImpactWeight, contribution: 0, label: 'Revenue Impact', factors: {} },
          strategicImportance: { raw: overrideScore, normalised: overrideScore, weight: 1, contribution: overrideScore, label: 'Manual Override', factors: { manualOverride: theme.manualOverrideScore } },
          urgencySignal:       { raw: 0, normalised: 0, weight: weights.urgencySignalWeight, contribution: 0, label: 'Urgency Signals', factors: {} },
        };
        return {
          themeId: theme.id, title: theme.title, status: theme.status, themePriorityRank: 0,
          priorityScore: parseFloat(overrideScore.toFixed(2)),
          revenueScore: theme.revenueScore ?? 0, urgencyScore: theme.urgencyScore ?? 0,
          revenueOpportunityScore: theme.revenueScore ?? 0,
          feedbackCount: theme.feedbacks.length,
          uniqueCustomerCount: new Set(theme.feedbacks.map(f => f.feedback.customerId).filter(Boolean)).size,
          revenueInfluence: theme.revenueInfluence ?? 0, dealInfluenceValue: 0,
          strategicTag: theme.strategicTag, manualOverrideScore: theme.manualOverrideScore,
          hasManualOverride: true, lastScoredAt: theme.lastScoredAt, breakdown: placeholder,
        };
      }

      const feedbacks = theme.feedbacks.map(f => f.feedback);
      const uniqueCustomerIds = new Set(feedbacks.map(f => f.customerId).filter(Boolean));
      const totalArr = feedbacks.reduce((s, f) => s + (f.customer?.arrValue ?? 0), 0);
      const maxPriority = feedbacks.reduce((max, f) => Math.max(max, ACCOUNT_PRIORITY_MAP[f.customer?.accountPriority ?? AccountPriority.MEDIUM]), 1);
      const avgSentiment = feedbacks.length > 0 ? feedbacks.reduce((s, f) => s + (f.sentiment ?? 0), 0) / feedbacks.length : 0;
      const avgVoteVelocity = feedbacks.length > 0 ? feedbacks.reduce((s, f) => s + (f.voteVelocity ?? 0), 0) / feedbacks.length : 0;
      const avgUrgency = feedbacks.length > 0 ? feedbacks.reduce((s, f) => s + (f.urgencySignal ?? 0), 0) / feedbacks.length : 0;
      const maxChurnRisk = feedbacks.reduce((max, f) => Math.max(max, f.customer?.churnRisk ?? 0), 0);
      const dealInfluenceValue = theme.dealLinks.reduce((sum, dl) => {
        if (!dl.deal || dl.deal.status === DealStatus.LOST) return sum;
        return sum + (dl.deal.annualValue ?? 0) * (DEAL_STAGE_WEIGHT[dl.deal.stage] ?? 0);
      }, 0);
      const spikeScore = theme.correlations.reduce((sum, c) => sum + (spikeByCluster.get(c.id) ?? 0), 0);
      const tagMult = theme.strategicTag ? (STRATEGIC_TAG_MULTIPLIER[theme.strategicTag] ?? 1.0) : 1.0;
      const roadmapStatus = theme.roadmapItems[0]?.status ?? null;
      const roadmapMult = roadmapStatus ? (ROADMAP_STATUS_MULTIPLIER[roadmapStatus] ?? 1.0) : 1.0;

      const demandNorm = clamp100(
        countNorm(feedbacks.length, 50) * 0.35 +
        countNorm(avgVoteVelocity, 5) * 0.30 +
        (avgSentiment < 0 ? Math.abs(avgSentiment) * 100 : 0) * 0.25,
      );
      const revenueNorm = clamp100(
        logNorm(totalArr, 8) * 0.40 +
        logNorm(dealInfluenceValue, 7) * 0.30 +
        (maxPriority / 4) * 100 * 0.20 +
        maxChurnRisk * 100 * 0.10,
      );
      const strategicNorm = clamp100(
        ((theme.strategicTag === 'strategic' ? 100 : theme.strategicTag === 'core' ? 70 : theme.strategicTag === 'nice-to-have' ? 30 : 50) * 0.50 +
         (roadmapStatus ? 80 : 0) * 0.35 +
         (tagMult > 1 ? 30 : 0) * 0.15) * tagMult * roadmapMult,
      );
      const urgencyNorm = clamp100(
        countNorm(spikeScore, 10) * 0.40 +
        avgUrgency * 100 * 0.40 +
        (maxChurnRisk >= 0.7 ? 80 : maxChurnRisk >= 0.4 ? 40 : 0) * 0.20,
      );

      const priorityScore = clamp100(
        demandNorm  * weights.demandStrengthWeight +
        revenueNorm * weights.revenueImpactWeight +
        strategicNorm * weights.strategicImportanceWeight +
        urgencyNorm * weights.urgencySignalWeight,
      );

      const breakdown: PrioritizationScoreBreakdown = {
        demandStrength:      { raw: demandNorm, normalised: demandNorm, weight: weights.demandStrengthWeight, contribution: demandNorm * weights.demandStrengthWeight, label: 'Demand Strength', factors: { feedbackCount: feedbacks.length, avgVoteVelocity, avgSentiment } },
        revenueImpact:       { raw: revenueNorm, normalised: revenueNorm, weight: weights.revenueImpactWeight, contribution: revenueNorm * weights.revenueImpactWeight, label: 'Revenue Impact', factors: { totalArr, dealInfluenceValue, maxChurnRisk } },
        strategicImportance: { raw: strategicNorm, normalised: strategicNorm, weight: weights.strategicImportanceWeight, contribution: strategicNorm * weights.strategicImportanceWeight, label: 'Strategic Importance', factors: { tagMult, roadmapMult } },
        urgencySignal:       { raw: urgencyNorm, normalised: urgencyNorm, weight: weights.urgencySignalWeight, contribution: urgencyNorm * weights.urgencySignalWeight, label: 'Urgency Signals', factors: { spikeScore, avgUrgency, maxChurnRisk } },
      };

      return {
        themeId: theme.id, title: theme.title, status: theme.status, themePriorityRank: 0,
        priorityScore: parseFloat(priorityScore.toFixed(2)),
        revenueScore: parseFloat(revenueNorm.toFixed(2)),
        urgencyScore: parseFloat(urgencyNorm.toFixed(2)),
        revenueOpportunityScore: parseFloat(revenueNorm.toFixed(2)),
        feedbackCount: feedbacks.length, uniqueCustomerCount: uniqueCustomerIds.size,
        revenueInfluence: theme.revenueInfluence ?? 0, dealInfluenceValue,
        strategicTag: theme.strategicTag, manualOverrideScore: theme.manualOverrideScore,
        hasManualOverride: false, lastScoredAt: theme.lastScoredAt, breakdown,
      };
    });

    return ranked
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, limit)
      .map((item, i) => ({ ...item, themePriorityRank: i + 1 }));
  }

  // ─── 3. Roadmap Recommendation Scoring ────────────────────────────────────
  async getRoadmapRecommendations(workspaceId: string, limit = 30): Promise<RoadmapRecommendationItem[]> {
    const [roadmapItems, settings] = await Promise.all([
      this.prisma.roadmapItem.findMany({
        where: { workspaceId, status: { not: RoadmapStatus.SHIPPED } },
        select: {
          id: true, title: true, status: true, themeId: true, priorityScore: true,
          revenueImpactScore: true, revenueImpactValue: true, dealInfluenceValue: true,
          theme: {
            select: {
              id: true, title: true, priorityScore: true, ciqScore: true,
              revenueScore: true, urgencyScore: true, strategicTag: true, manualOverrideScore: true,
              feedbacks: { select: { feedback: { select: { sentiment: true, urgencySignal: true, customer: { select: { arrValue: true, churnRisk: true } } } } } },
              dealLinks: { select: { deal: { select: { annualValue: true, stage: true, status: true } } } },
            },
          },
        },
        orderBy: { priorityScore: { sort: 'desc', nulls: 'last' } },
        take: limit * 2,
      }),
      this.prisma.prioritizationSettings.findUnique({ where: { workspaceId } }),
    ]);

    const weights: DimensionWeights = settings ? {
      demandStrengthWeight:      settings.demandStrengthWeight,
      revenueImpactWeight:       settings.revenueImpactWeight,
      strategicImportanceWeight: settings.strategicImportanceWeight,
      urgencySignalWeight:       settings.urgencySignalWeight,
    } : DEFAULT_WEIGHTS;

    const items: RoadmapRecommendationItem[] = roadmapItems.map((item) => {
      const theme = item.theme;
      const tagMult = theme?.strategicTag ? (STRATEGIC_TAG_MULTIPLIER[theme.strategicTag] ?? 1.0) : 1.0;
      const statusMult = ROADMAP_STATUS_MULTIPLIER[item.status as RoadmapStatus] ?? 1.0;
      const feedbacks = theme?.feedbacks.map(f => f.feedback) ?? [];
      const avgSentiment = feedbacks.length > 0 ? feedbacks.reduce((s, f) => s + (f.sentiment ?? 0), 0) / feedbacks.length : 0;
      const avgUrgency = feedbacks.length > 0 ? feedbacks.reduce((s, f) => s + (f.urgencySignal ?? 0), 0) / feedbacks.length : 0;
      const maxChurnRisk = feedbacks.reduce((max, f) => Math.max(max, f.customer?.churnRisk ?? 0), 0);
      const totalArr = feedbacks.reduce((s, f) => s + (f.customer?.arrValue ?? 0), 0);
      const dealInfluence = (theme?.dealLinks ?? []).reduce((sum, dl) => {
        if (!dl.deal || dl.deal.status === DealStatus.LOST) return sum;
        return sum + (dl.deal.annualValue ?? 0) * (DEAL_STAGE_WEIGHT[dl.deal.stage] ?? 0);
      }, 0);

      const demandNorm = clamp100(
        countNorm(feedbacks.length, 30) * 0.40 +
        (avgSentiment < 0 ? Math.abs(avgSentiment) * 100 : 0) * 0.30,
      );
      const revenueNorm = clamp100(
        logNorm(totalArr, 8) * 0.40 +
        logNorm(dealInfluence, 7) * 0.40 +
        maxChurnRisk * 100 * 0.20,
      );
      const strategicNorm = clamp100(
        (theme?.strategicTag === 'strategic' ? 100 : theme?.strategicTag === 'core' ? 70 : 50) * tagMult,
      );
      const urgencyNorm = clamp100(
        avgUrgency * 100 * 0.60 +
        (maxChurnRisk >= 0.7 ? 80 : maxChurnRisk >= 0.4 ? 40 : 0) * 0.40,
      );

      const roadmapScore = clamp100(
        (demandNorm  * weights.demandStrengthWeight +
         revenueNorm * weights.revenueImpactWeight +
         strategicNorm * weights.strategicImportanceWeight +
         urgencyNorm * weights.urgencySignalWeight) * statusMult,
      );

      let recommendation: RoadmapRecommendationItem['recommendation'];
      let rationale: string;
      if (item.status === RoadmapStatus.SHIPPED) {
        recommendation = 'already_shipped'; rationale = 'Already shipped.';
      } else if (roadmapScore >= 75 && item.status === RoadmapStatus.EXPLORING) {
        recommendation = 'promote_to_committed'; rationale = `High priority score (${roadmapScore.toFixed(0)}) — ready to commit.`;
      } else if (roadmapScore >= 55 && item.status === RoadmapStatus.BACKLOG) {
        recommendation = 'promote_to_planned'; rationale = `Moderate-high priority score (${roadmapScore.toFixed(0)}) — recommend moving to Planned.`;
      } else if (roadmapScore < 25 && item.status !== RoadmapStatus.COMMITTED) {
        recommendation = 'deprioritise'; rationale = `Low priority score (${roadmapScore.toFixed(0)}) — consider deprioritising.`;
      } else {
        recommendation = 'keep_current'; rationale = `Priority score (${roadmapScore.toFixed(0)}) is appropriate for current status.`;
      }

      const breakdown: PrioritizationScoreBreakdown = {
        demandStrength:      { raw: demandNorm, normalised: demandNorm, weight: weights.demandStrengthWeight, contribution: demandNorm * weights.demandStrengthWeight, label: 'Demand Strength', factors: { feedbackCount: feedbacks.length, avgSentiment } },
        revenueImpact:       { raw: revenueNorm, normalised: revenueNorm, weight: weights.revenueImpactWeight, contribution: revenueNorm * weights.revenueImpactWeight, label: 'Revenue Impact', factors: { totalArr, dealInfluence, maxChurnRisk } },
        strategicImportance: { raw: strategicNorm, normalised: strategicNorm, weight: weights.strategicImportanceWeight, contribution: strategicNorm * weights.strategicImportanceWeight, label: 'Strategic Importance', factors: { tagMult, statusMult } },
        urgencySignal:       { raw: urgencyNorm, normalised: urgencyNorm, weight: weights.urgencySignalWeight, contribution: urgencyNorm * weights.urgencySignalWeight, label: 'Urgency Signals', factors: { avgUrgency, maxChurnRisk } },
      };

      return {
        roadmapItemId: item.id, title: item.title, status: item.status, themeId: item.themeId,
        themeTitle: theme?.title ?? null,
        roadmapRecommendationScore: parseFloat(roadmapScore.toFixed(2)),
        urgencyScore: parseFloat(urgencyNorm.toFixed(2)),
        revenueOpportunityScore: parseFloat(revenueNorm.toFixed(2)),
        priorityScore: parseFloat(roadmapScore.toFixed(2)),
        recommendation, rationale, breakdown,
      };
    });

    return items
      .sort((a, b) => b.roadmapRecommendationScore - a.roadmapRecommendationScore)
      .slice(0, limit);
  }

  // ─── 4. Revenue Opportunities ─────────────────────────────────────────────
  async getOpportunities(workspaceId: string, limit = 20): Promise<PrioritizationOpportunity[]> {
    const [themes, feedbacks] = await Promise.all([
      this.prisma.theme.findMany({
        where: { workspaceId, status: { not: ThemeStatus.ARCHIVED } },
        select: {
          id: true, title: true, priorityScore: true, ciqScore: true,
          revenueScore: true, urgencyScore: true, revenueInfluence: true,
          roadmapItems: { select: { status: true }, take: 1 },
          dealLinks: { select: { deal: { select: { annualValue: true, stage: true, status: true } } } },
          feedbacks: { select: { feedback: { select: { customer: { select: { arrValue: true, churnRisk: true } } } } } },
        },
        orderBy: { revenueInfluence: { sort: 'desc', nulls: 'last' } },
        take: limit * 2,
      }),
      this.prisma.feedback.findMany({
        where: { workspaceId, status: { not: 'MERGED' }, urgencySignal: { gt: 0.6 } },
        select: {
          id: true, title: true, urgencySignal: true, ciqScore: true,
          customer: { select: { arrValue: true, churnRisk: true } },
          themes: { select: { themeId: true } },
        },
        orderBy: { urgencySignal: 'desc' },
        take: limit,
      }),
    ]);

    const opportunities: PrioritizationOpportunity[] = [];

    for (const theme of themes) {
      const roadmapStatus = theme.roadmapItems[0]?.status;
      if (roadmapStatus === RoadmapStatus.COMMITTED || roadmapStatus === RoadmapStatus.SHIPPED) continue;
      const dealCount = theme.dealLinks.filter(dl => dl.deal?.status !== DealStatus.LOST).length;
      const arrAtRisk = theme.feedbacks.reduce((s, f) => s + ((f.feedback.customer?.churnRisk ?? 0) >= 0.5 ? (f.feedback.customer?.arrValue ?? 0) : 0), 0);
      const opportunityScore = clamp100(
        (theme.revenueScore ?? 0) * 0.50 +
        (theme.urgencyScore ?? 0) * 0.30 +
        logNorm(arrAtRisk, 7) * 0.20,
      );
      if (opportunityScore >= 30) {
        opportunities.push({
          type: 'theme', entityId: theme.id, title: theme.title,
          opportunityScore: parseFloat(opportunityScore.toFixed(2)),
          revenueOpportunityScore: theme.revenueScore ?? 0,
          urgencyScore: theme.urgencyScore ?? 0,
          reason: `High-value theme with $${((theme.revenueInfluence ?? 0) / 1000).toFixed(0)}k ARR influence and ${dealCount} active deals — not yet committed to roadmap.`,
          arrAtRisk, dealCount,
        });
      }
    }

    for (const fb of feedbacks) {
      if (fb.themes.length > 0) continue;
      const arrAtRisk = (fb.customer?.churnRisk ?? 0) >= 0.5 ? (fb.customer?.arrValue ?? 0) : 0;
      const opportunityScore = clamp100((fb.urgencySignal ?? 0) * 100 * 0.60 + logNorm(arrAtRisk, 7) * 0.40);
      if (opportunityScore >= 40) {
        opportunities.push({
          type: 'feature', entityId: fb.id, title: fb.title,
          opportunityScore: parseFloat(opportunityScore.toFixed(2)),
          revenueOpportunityScore: logNorm(fb.customer?.arrValue ?? 0, 7),
          urgencyScore: (fb.urgencySignal ?? 0) * 100,
          reason: `High-urgency feedback (urgency=${((fb.urgencySignal ?? 0) * 100).toFixed(0)}%) with churn risk — no theme cluster yet.`,
          arrAtRisk, dealCount: 0,
        });
      }
    }

    return opportunities
      .sort((a, b) => b.opportunityScore - a.opportunityScore)
      .slice(0, limit);
  }

  // ─── 5. Persist scores back to DB ─────────────────────────────────────────
  async persistThemeScores(workspaceId: string, items: ThemePriorityItem[]): Promise<void> {
    await Promise.all(items.map((item) =>
      this.prisma.theme.update({
        where: { id: item.themeId },
        data: {
          priorityScore:   item.priorityScore / 100,
          ciqScore:        item.priorityScore,
          revenueScore:    item.revenueScore,
          urgencyScore:    item.urgencyScore,
          lastScoredAt:    new Date(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          signalBreakdown: item.breakdown as any,
        },
      }),
    ));
    this.logger.log(`Persisted priority scores for ${items.length} themes in workspace ${workspaceId}`);
  }

  async persistFeedbackSignals(workspaceId: string, items: FeaturePriorityItem[]): Promise<void> {
    await Promise.all(items.map((item) =>
      this.prisma.feedback.update({
        where: { id: item.feedbackId },
        data: { ciqScore: item.priorityScore, urgencySignal: item.urgencyScore / 100, voteVelocity: item.voteVelocity },
      }),
    ));
    this.logger.log(`Persisted urgency signals for ${items.length} feedback items in workspace ${workspaceId}`);
  }

  /** @deprecated Use getThemePriorityRanking instead */
  async getThemeData(workspaceId: string, themeId: string): Promise<ThemeData> {
    const feedback = await this.prisma.feedback.findMany({
      where: { workspaceId, themes: { some: { themeId } }, status: { not: 'MERGED' } },
      select: { customerId: true },
    });
    const uniqueCustomers = [...new Set(feedback.map((f) => f.customerId).filter(Boolean))];
    return {
      themeId,
      requestFrequency:     feedback.length,
      uniqueCustomerCount:  uniqueCustomers.length,
      arrValue:             uniqueCustomers.length * 1000,
      accountPriorityValue: uniqueCustomers.length * 5,
      dealInfluenceValue:   feedback.length * 500,
    };
  }
}

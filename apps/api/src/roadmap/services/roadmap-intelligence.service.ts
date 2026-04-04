/**
 * RoadmapIntelligenceService
 * ─────────────────────────────────────────────────────────────────────────────
 * Computes a "Roadmap Priority Score" (RPS) for every active theme and
 * generates human-readable AI suggestions:
 *
 *   ADD_TO_ROADMAP     — theme has no roadmap item yet, high RPS
 *   INCREASE_PRIORITY  — theme is on roadmap but RPS justifies moving up
 *   DECREASE_PRIORITY  — theme is on roadmap but RPS has dropped
 *   MONITOR            — moderate signals, not yet actionable
 *   NO_ACTION          — low signals, nothing to do
 *
 * Design principles
 *   • AI assists decision-making, it does NOT auto-create roadmap items
 *   • Every suggestion is explainable: reason, confidence, signal summary
 *   • Scores are derived from real CIQ signals — no hallucination
 *   • Duplicate suggestions are suppressed (one per theme)
 *
 * RPS formula (weights configurable via PrioritizationSettings):
 *   RPS = ciqScore × 0.35
 *       + velocitySignal × 0.20
 *       + sentimentIntensity × 0.15
 *       + sourceImportance × 0.15
 *       + recencySignal × 0.10
 *       + resurfacingBonus × 0.05
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ThemeStatus, RoadmapStatus } from '@prisma/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AiSuggestionType =
  | 'ADD_TO_ROADMAP'
  | 'INCREASE_PRIORITY'
  | 'DECREASE_PRIORITY'
  | 'MONITOR'
  | 'NO_ACTION';

export type AiConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AiSuggestionSignalSummary {
  totalSignals: number;
  feedbackCount: number;
  voiceCount: number;
  supportCount: number;
  surveyCount: number;
  activeSources: number;
  velocityDelta: number | null; // % WoW change
  sentimentScore: number | null; // -1 to +1
}

export interface AiSuggestionBreakdown {
  ciqScore: number;
  velocityScore: number;
  sentimentScore: number;
  sourceScore: number;
  recencyScore: number;
  resurfacingBonus: number;
  roadmapPriorityScore: number;
}

export interface AiRoadmapSuggestion {
  themeId: string;
  themeTitle: string;
  ciqScore: number;
  roadmapPriorityScore: number;
  suggestionType: AiSuggestionType;
  confidence: AiConfidenceLevel;
  reason: string;
  signalSummary: AiSuggestionSignalSummary;
  breakdown: AiSuggestionBreakdown;
  // Roadmap link (null = not yet on roadmap)
  roadmapItemId: string | null;
  roadmapStatus: string | null;
  // Explainability
  dominantDriver: string | null;
  priorityReason: string | null;
  confidenceExplanation: string | null;
}

export interface AiRoadmapSuggestionsResponse {
  data: AiRoadmapSuggestion[];
  total: number;
  computedAt: string;
  summary: {
    addToRoadmap: number;
    increasePriority: number;
    decreasePriority: number;
    monitor: number;
    noAction: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(val: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, val));
}

function logNorm(value: number, logBase = 7): number {
  if (value <= 0) return 0;
  return clamp((Math.log(value + 1) / Math.log(Math.pow(10, logBase))) * 100);
}

function countNorm(count: number, cap = 30): number {
  return clamp((count / cap) * 100);
}

function daysSince(date: Date | null | undefined): number {
  if (!date) return 999;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class RoadmapIntelligenceService {
  private readonly logger = new Logger(RoadmapIntelligenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /workspaces/:workspaceId/roadmap/ai-suggestions
   *
   * Returns AI-generated roadmap suggestions for all active themes.
   * Sorted by roadmapPriorityScore descending.
   * Deduped: one suggestion per theme.
   */
  async getAiSuggestions(
    workspaceId: string,
    limit = 50,
  ): Promise<AiRoadmapSuggestionsResponse> {
    // ── 1. Fetch all active themes with signal data ──────────────────────────
    const themes = await this.prisma.theme.findMany({
      where: {
        workspaceId,
        status: { not: ThemeStatus.ARCHIVED },
      },
      select: {
        id: true,
        title: true,
        ciqScore: true,
        priorityScore: true,
        feedbackCount: true,
        voiceCount: true,
        supportCount: true,
        surveyCount: true,
        totalSignalCount: true,
        trendDelta: true,
        currentWeekSignals: true,
        prevWeekSignals: true,
        lastScoredAt: true,
        signalBreakdown: true,
        // Roadmap link
        roadmapItems: {
          select: { id: true, status: true, priorityScore: true },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
        // Feedback signals for sentiment + recency + resurfacing
        feedbacks: {
          select: {
            feedback: {
              select: {
                sentiment: true,
                urgencySignal: true,
                primarySource: true,
                createdAt: true,
                customer: {
                  select: { arrValue: true, churnRisk: true },
                },
              },
            },
          },
          take: 100,
        },
      },
      orderBy: { ciqScore: { sort: 'desc', nulls: 'last' } },
      take: limit * 3,
    });

    // ── 2. Score each theme ──────────────────────────────────────────────────
    const suggestions: AiRoadmapSuggestion[] = [];

    for (const theme of themes) {
      const fb = theme.feedbacks.map((tf) => tf.feedback);

      // --- CIQ score (0–100) ---
      // priorityScore is stored as 0–100 by CiqScoringProcessor.
      // Do NOT multiply by 100 — that was a scale bug causing all themes to
      // show ciqScore = 100 (clamp(72 * 100) = 100 after clamping).
      const ciqScore = clamp(
        theme.ciqScore ?? theme.priorityScore ?? 0,
      );

      // --- Velocity signal (0–100) ---
      const velocityDelta = theme.trendDelta ?? null;
      const rawVelocity =
        velocityDelta != null ? Math.max(0, velocityDelta) : 0;
      const velocityScore = clamp(Math.min(rawVelocity * 2, 100)); // cap at +50% WoW → 100

      // --- Sentiment intensity (0–100) ---
      // Negative sentiment = higher urgency signal
      const sentiments = fb.map((f) => f.sentiment ?? 0).filter((s) => s !== 0);
      const avgSentiment =
        sentiments.length > 0
          ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
          : 0;
      // Invert: -1 (very negative) → 100, 0 → 50, +1 (very positive) → 0
      const sentimentIntensity = clamp(((avgSentiment * -1 + 1) / 2) * 100);

      // --- Source importance (0–100) ---
      // support > feedback > survey (configurable in future)
      const supportCount = theme.supportCount ?? 0;
      const feedbackCount = theme.feedbackCount ?? 0;
      const surveyCount = theme.surveyCount ?? 0;
      const voiceCount = theme.voiceCount ?? 0;
      const sourceScore = clamp(
        countNorm(supportCount, 20) * 0.4 +
          countNorm(feedbackCount, 30) * 0.3 +
          countNorm(voiceCount, 10) * 0.2 +
          countNorm(surveyCount, 20) * 0.1,
      );

      // --- Recency signal (0–100) ---
      const daysSinceScored = daysSince(theme.lastScoredAt);
      const recencyScore = clamp(
        daysSinceScored <= 7
          ? 100
          : daysSinceScored <= 14
            ? 80
            : daysSinceScored <= 30
              ? 60
              : daysSinceScored <= 60
                ? 30
                : 10,
      );

      // --- Resurfacing bonus (0–100) ---
      // Themes that had low signals before and now have rising velocity
      const prevWeek = theme.prevWeekSignals ?? 0;
      const currWeek = theme.currentWeekSignals ?? 0;
      const resurfacingBonus =
        prevWeek === 0 && currWeek > 0
          ? 80
          : prevWeek > 0 && currWeek > prevWeek * 2
            ? 60
            : 0;

      // --- Roadmap Priority Score (RPS) ---
      const roadmapPriorityScore = clamp(
        ciqScore * 0.35 +
          velocityScore * 0.2 +
          sentimentIntensity * 0.15 +
          sourceScore * 0.15 +
          recencyScore * 0.1 +
          resurfacingBonus * 0.05,
      );

      // --- Active sources count ---
      const activeSources = [
        feedbackCount,
        voiceCount,
        supportCount,
        surveyCount,
      ].filter((c) => c > 0).length;

      // --- Roadmap link ---
      const roadmapItem = theme.roadmapItems[0] ?? null;
      const roadmapItemId = roadmapItem?.id ?? null;
      const roadmapStatus = roadmapItem?.status ?? null;

      // --- Suggestion type ---
      const suggestionType = this.computeSuggestionType(
        roadmapPriorityScore,
        roadmapStatus,
        velocityDelta,
        resurfacingBonus,
      );

      // --- Confidence ---
      const totalSignals =
        theme.totalSignalCount ??
        feedbackCount + voiceCount + supportCount + surveyCount;
      const confidence = this.computeConfidence(
        totalSignals,
        activeSources,
        ciqScore,
      );

      // --- Dominant driver ---
      const dominantDriver = this.computeDominantDriver({
        ciqScore,
        velocityScore,
        sentimentIntensity,
        sourceScore,
        recencyScore,
        resurfacingBonus,
      });

      // --- Reason sentence ---
      const reason = this.buildReason(suggestionType, dominantDriver, {
        ciqScore,
        roadmapPriorityScore,
        velocityDelta,
        supportCount,
        feedbackCount,
        voiceCount,
        surveyCount,
        activeSources,
        avgSentiment,
      });

      // --- Confidence explanation ---
      const confidenceExplanation = this.buildConfidenceExplanation(
        confidence,
        { feedbackCount, voiceCount, supportCount, surveyCount, activeSources },
      );

      // --- Priority reason (from CIQ signalBreakdown if available) ---
      const breakdown_raw = theme.signalBreakdown as Record<
        string,
        { value?: number; label?: string }
      > | null;
      const priorityReason = breakdown_raw
        ? this.buildPriorityReason(
            roadmapPriorityScore,
            dominantDriver,
            breakdown_raw,
          )
        : null;

      suggestions.push({
        themeId: theme.id,
        themeTitle: theme.title,
        ciqScore: parseFloat(ciqScore.toFixed(1)),
        roadmapPriorityScore: parseFloat(roadmapPriorityScore.toFixed(1)),
        suggestionType,
        confidence,
        reason,
        signalSummary: {
          totalSignals,
          feedbackCount,
          voiceCount,
          supportCount,
          surveyCount,
          activeSources,
          velocityDelta,
          sentimentScore:
            sentiments.length > 0 ? parseFloat(avgSentiment.toFixed(3)) : null,
        },
        breakdown: {
          ciqScore: parseFloat(ciqScore.toFixed(1)),
          velocityScore: parseFloat(velocityScore.toFixed(1)),
          sentimentScore: parseFloat(sentimentIntensity.toFixed(1)),
          sourceScore: parseFloat(sourceScore.toFixed(1)),
          recencyScore: parseFloat(recencyScore.toFixed(1)),
          resurfacingBonus: parseFloat(resurfacingBonus.toFixed(1)),
          roadmapPriorityScore: parseFloat(roadmapPriorityScore.toFixed(1)),
        },
        roadmapItemId,
        roadmapStatus,
        dominantDriver,
        priorityReason,
        confidenceExplanation,
      });
    }

    // ── 3. Sort + deduplicate + limit ────────────────────────────────────────
    const sorted = suggestions
      .sort((a, b) => b.roadmapPriorityScore - a.roadmapPriorityScore)
      .slice(0, limit);

    // ── 4. Summary counts ────────────────────────────────────────────────────
    const summary = {
      addToRoadmap: sorted.filter((s) => s.suggestionType === 'ADD_TO_ROADMAP')
        .length,
      increasePriority: sorted.filter(
        (s) => s.suggestionType === 'INCREASE_PRIORITY',
      ).length,
      decreasePriority: sorted.filter(
        (s) => s.suggestionType === 'DECREASE_PRIORITY',
      ).length,
      monitor: sorted.filter((s) => s.suggestionType === 'MONITOR').length,
      noAction: sorted.filter((s) => s.suggestionType === 'NO_ACTION').length,
    };

    this.logger.log(
      `[RoadmapIntelligence] workspace=${workspaceId} themes=${sorted.length} ` +
        `add=${summary.addToRoadmap} increase=${summary.increasePriority} ` +
        `decrease=${summary.decreasePriority} monitor=${summary.monitor}`,
    );

    return {
      data: sorted,
      total: sorted.length,
      computedAt: new Date().toISOString(),
      summary,
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private computeSuggestionType(
    rps: number,
    roadmapStatus: string | null,
    velocityDelta: number | null,
    resurfacingBonus: number,
  ): AiSuggestionType {
    const isOnRoadmap = roadmapStatus !== null;
    const isShipped = roadmapStatus === RoadmapStatus.SHIPPED;

    if (isShipped) return 'NO_ACTION';

    if (!isOnRoadmap) {
      if (rps >= 65) return 'ADD_TO_ROADMAP';
      if (rps >= 40 || resurfacingBonus >= 60) return 'MONITOR';
      return 'NO_ACTION';
    }

    // Theme already on roadmap
    const isCommitted = roadmapStatus === RoadmapStatus.COMMITTED;
    if (rps >= 70 && !isCommitted) return 'INCREASE_PRIORITY';
    if (rps < 25 && !isCommitted) return 'DECREASE_PRIORITY';
    if (velocityDelta !== null && velocityDelta > 30 && !isCommitted)
      return 'INCREASE_PRIORITY';
    if (rps >= 40) return 'MONITOR';
    return 'NO_ACTION';
  }

  private computeConfidence(
    totalSignals: number,
    activeSources: number,
    ciqScore: number,
  ): AiConfidenceLevel {
    const signalScore = countNorm(totalSignals, 20);
    const sourceScore = (activeSources / 4) * 100;
    const composite = signalScore * 0.5 + sourceScore * 0.3 + ciqScore * 0.2;
    if (composite >= 65) return 'HIGH';
    if (composite >= 35) return 'MEDIUM';
    return 'LOW';
  }

  private computeDominantDriver(scores: {
    ciqScore: number;
    velocityScore: number;
    sentimentIntensity: number;
    sourceScore: number;
    recencyScore: number;
    resurfacingBonus: number;
  }): string | null {
    const weighted = {
      'CIQ Score': scores.ciqScore * 0.35,
      'Signal Velocity': scores.velocityScore * 0.2,
      'Sentiment Intensity': scores.sentimentIntensity * 0.15,
      'Source Coverage': scores.sourceScore * 0.15,
      Recency: scores.recencyScore * 0.1,
      Resurfacing: scores.resurfacingBonus * 0.05,
    };
    const sorted = Object.entries(weighted).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] ?? null;
  }

  private buildReason(
    type: AiSuggestionType,
    dominantDriver: string | null,
    ctx: {
      ciqScore: number;
      roadmapPriorityScore: number;
      velocityDelta: number | null;
      supportCount: number;
      feedbackCount: number;
      voiceCount: number;
      surveyCount: number;
      activeSources: number;
      avgSentiment: number;
    },
  ): string {
    const rps = Math.round(ctx.roadmapPriorityScore);
    const ciq = Math.round(ctx.ciqScore);
    const velStr =
      ctx.velocityDelta != null
        ? ` Signal velocity is ${ctx.velocityDelta > 0 ? '+' : ''}${ctx.velocityDelta.toFixed(0)}% WoW.`
        : '';
    const srcStr =
      ctx.activeSources >= 2
        ? ` Corroborated by ${ctx.activeSources} independent sources.`
        : '';
    const sentStr =
      ctx.avgSentiment < -0.3
        ? ' Strong negative sentiment detected.'
        : ctx.avgSentiment > 0.3
          ? ' Positive sentiment — users want this.'
          : '';

    switch (type) {
      case 'ADD_TO_ROADMAP':
        return (
          `This theme has a Roadmap Priority Score of ${rps}/100 (CIQ ${ciq}) and is not yet on the roadmap.` +
          (ctx.supportCount > 0
            ? ` ${ctx.supportCount} support ticket${ctx.supportCount !== 1 ? 's' : ''} are linked.`
            : '') +
          velStr +
          srcStr +
          sentStr +
          ` Dominant driver: ${dominantDriver ?? 'CIQ Score'}.`
        );
      case 'INCREASE_PRIORITY':
        return (
          `This theme's Roadmap Priority Score (${rps}/100) justifies moving it up.` +
          velStr +
          srcStr +
          sentStr +
          (ctx.feedbackCount > 0
            ? ` ${ctx.feedbackCount} feedback item${ctx.feedbackCount !== 1 ? 's' : ''} linked.`
            : '') +
          ` Dominant driver: ${dominantDriver ?? 'CIQ Score'}.`
        );
      case 'DECREASE_PRIORITY':
        return (
          `This theme's Roadmap Priority Score has dropped to ${rps}/100.` +
          (ctx.velocityDelta != null && ctx.velocityDelta < 0
            ? ` Signal volume is declining (${ctx.velocityDelta.toFixed(0)}% WoW).`
            : ' Recent activity is low.') +
          ' Consider deprioritising or moving to Backlog.'
        );
      case 'MONITOR':
        return (
          `Moderate signals detected (RPS ${rps}/100, CIQ ${ciq}).` +
          velStr +
          srcStr +
          ' Not yet strong enough to act on — monitor for further growth.'
        );
      case 'NO_ACTION':
      default:
        return `Low signal activity (RPS ${rps}/100). No action required at this time.`;
    }
  }

  private buildConfidenceExplanation(
    level: AiConfidenceLevel,
    ctx: {
      feedbackCount: number;
      voiceCount: number;
      supportCount: number;
      surveyCount: number;
      activeSources: number;
    },
  ): string {
    const parts: string[] = [];
    if (ctx.feedbackCount > 0)
      parts.push(
        `${ctx.feedbackCount} feedback item${ctx.feedbackCount !== 1 ? 's' : ''}`,
      );
    if (ctx.voiceCount > 0)
      parts.push(
        `${ctx.voiceCount} voice signal${ctx.voiceCount !== 1 ? 's' : ''}`,
      );
    if (ctx.supportCount > 0)
      parts.push(
        `${ctx.supportCount} support ticket${ctx.supportCount !== 1 ? 's' : ''}`,
      );
    if (ctx.surveyCount > 0)
      parts.push(
        `${ctx.surveyCount} survey response${ctx.surveyCount !== 1 ? 's' : ''}`,
      );

    const signalStr =
      parts.length > 0
        ? `based on ${parts.join(', ')}`
        : 'based on limited signals';

    if (level === 'HIGH') {
      return `High confidence — ${signalStr}. Multiple independent sources corroborate this suggestion.`;
    }
    if (level === 'MEDIUM') {
      return `Medium confidence — ${signalStr}. Adding more cross-source signals will increase confidence.`;
    }
    return `Low confidence — ${signalStr}. Gather more signals from multiple sources before acting.`;
  }

  private buildPriorityReason(
    rps: number,
    dominantDriver: string | null,
    breakdown: Record<string, { value?: number; label?: string }>,
  ): string {
    const band = rps >= 70 ? 'High' : rps >= 40 ? 'Moderate' : 'Low';
    const topFactor =
      dominantDriver ?? Object.keys(breakdown)[0] ?? 'signal volume';
    return `${band} roadmap priority (RPS ${Math.round(rps)}/100) driven by ${topFactor.toLowerCase()}.`;
  }
}

/**
 * ActionPlanService
 *
 * Produces a "Weekly Action Plan" — the top 5 themes a product team should
 * act on RIGHT NOW, ranked by the unified Decision Ranking Score (DRS) from
 * ThemeRankingEngine.
 *
 * DRS formula (ThemeRankingEngine):
 *   DRS = CIQ×0.30 + Velocity×0.20 + Recency×0.18 + Resurface×0.15
 *         + SourceDiversity×0.10 + Confidence×0.07
 *
 * Quality guards (all enforced by ThemeRankingEngine):
 *   • MIN_SIGNALS (3): hard gate — themes with fewer signals are excluded
 *   • NEAR_DUP_PENALTY (0.80): soft — near-duplicate themes ranked lower
 *   • LOW_CONF_PENALTY (0.85): soft — low-confidence themes ranked lower
 *   • WEAK_SIGNAL_PENALTY (0.90): soft — 3–5 signal themes ranked lower
 *   • aiConfidence tiebreaker within 0.5 DRS pts
 *
 * Each item includes:
 *   - deterministic reason sentence
 *   - signal quality labels (Strong signal / Multi-source / Emerging issue / etc.)
 *   - recommended action (ADD_TO_ROADMAP | INCREASE_PRIORITY | INVESTIGATE | MONITOR)
 *   - DRS breakdown for the expandable score panel
 *
 * No LLM calls — all output is derived from real database values.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ThemeRankingEngine,
  RankedTheme,
  SignalQualityLabel,
} from './theme-ranking-engine.service';

export type ActionType =
  | 'ADD_TO_ROADMAP'
  | 'INCREASE_PRIORITY'
  | 'INVESTIGATE'
  | 'MONITOR';

export interface ActionPlanItem {
  themeId: string;
  themeName: string;
  shortLabel: string | null;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  ciqScore: number;
  decisionPriorityScore: number;
  recommendedAction: ActionType;
  reason: string;
  isNearDuplicate: boolean;
  /** Signal quality labels for UI explainability chips. */
  signalLabels: SignalQualityLabel[];
  signals: {
    feedbackCount: number;
    supportCount: number;
    voiceCount: number;
    surveyCount: number;
    totalSignalCount: number;
    sourceDiversity: number;
    trendDelta: number | null;
    resurfaceCount: number;
    lastEvidenceAt: Date | null;
  };
  /** DRS breakdown for the expandable score panel. */
  drsBreakdown: {
    ciq: { weight: string; value: string };
    velocity: { weight: string; value: string };
    recency: { weight: string; value: string };
    resurfacing: { weight: string; value: string };
    sourceDiversity: { weight: string; value: string };
    aiConfidence: { weight: string; value: string };
    penalties: string | null;
  };
}

export interface ActionPlanResponse {
  generatedAt: string;
  items: ActionPlanItem[];
}

@Injectable()
export class ActionPlanService {
  private readonly logger = new Logger(ActionPlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rankingEngine: ThemeRankingEngine,
  ) {}

  async getActionPlan(workspaceId: string): Promise<ActionPlanResponse> {
    // ── 1. Get top-5 eligible themes from the unified ranking engine ──────────
    const top5 = await this.rankingEngine.getTopN(workspaceId, 5);

    if (top5.length === 0) {
      return { generatedAt: new Date().toISOString(), items: [] };
    }

    // ── 2. Fetch roadmap status for the top-5 themes ─────────────────────────
    const themeIds = top5.map((t) => t.themeId);
    const roadmapMap = await this.fetchRoadmapStatus(workspaceId, themeIds);

    // ── 3. Build output items ─────────────────────────────────────────────────
    const items: ActionPlanItem[] = top5.map((ranked) => {
      const drs = ranked.drs;
      const delta = ranked.signals.trendDelta ?? 0;

      const priority: ActionPlanItem['priority'] =
        drs >= 75
          ? 'CRITICAL'
          : drs >= 55
            ? 'HIGH'
            : drs >= 35
              ? 'MEDIUM'
              : 'LOW';

      // Determine recommended action
      const onRoadmap = roadmapMap.get(ranked.themeId) ?? false;
      let recommendedAction: ActionType;
      if (!onRoadmap && drs >= 60) {
        recommendedAction = 'ADD_TO_ROADMAP';
      } else if (onRoadmap && delta > 20) {
        recommendedAction = 'INCREASE_PRIORITY';
      } else if (ranked.signals.resurfaceCount > 0) {
        recommendedAction = 'INVESTIGATE';
      } else {
        recommendedAction = 'MONITOR';
      }

      // Build DRS breakdown for the expandable score panel
      const bd = ranked.breakdown;
      const penaltyParts: string[] = [];
      if (bd.penalties.nearDuplicate) penaltyParts.push('Near-duplicate ×0.80');
      if (bd.penalties.lowConfidence) penaltyParts.push('Low confidence ×0.85');
      if (bd.penalties.weakSignal) penaltyParts.push('Weak signal ×0.90');

      const drsBreakdown: ActionPlanItem['drsBreakdown'] = {
        ciq: { weight: '30%', value: `${Math.round(bd.ciq.raw)}/100` },
        velocity: {
          weight: '20%',
          value:
            ranked.signals.trendDelta != null
              ? `${delta > 0 ? '+' : ''}${Math.round(delta)}%`
              : 'n/a',
        },
        recency: {
          weight: '18%',
          value: ranked.signals.lastEvidenceAt
            ? new Date(ranked.signals.lastEvidenceAt).toLocaleDateString()
            : 'n/a',
        },
        resurfacing: {
          weight: '15%',
          value:
            ranked.signals.resurfaceCount > 0
              ? `×${ranked.signals.resurfaceCount}`
              : 'none',
        },
        sourceDiversity: {
          weight: '10%',
          value: `${ranked.signals.sourceDiversity}/4 sources`,
        },
        aiConfidence: {
          weight: '7%',
          value:
            ranked.aiConfidence != null
              ? `${Math.round(ranked.aiConfidence * 100)}%`
              : 'n/a',
        },
        penalties: penaltyParts.length > 0 ? penaltyParts.join(', ') : null,
      };

      return {
        themeId: ranked.themeId,
        themeName: ranked.title,
        shortLabel: ranked.shortLabel,
        priority,
        ciqScore: ranked.ciqScore,
        decisionPriorityScore: Math.round(drs),
        recommendedAction,
        reason: ranked.reason,
        isNearDuplicate: ranked.isNearDuplicate,
        signalLabels: ranked.signalLabels,
        signals: {
          feedbackCount: ranked.signals.feedbackCount,
          supportCount: ranked.signals.supportCount,
          voiceCount: ranked.signals.voiceCount,
          surveyCount: ranked.signals.surveyCount,
          totalSignalCount: ranked.signals.totalSignalCount,
          sourceDiversity: ranked.signals.sourceDiversity,
          trendDelta: ranked.signals.trendDelta,
          resurfaceCount: ranked.signals.resurfaceCount,
          lastEvidenceAt: ranked.signals.lastEvidenceAt,
        },
        drsBreakdown,
      };
    });

    this.logger.log(
      `[ActionPlan] Generated ${items.length} items for workspace ${workspaceId}`,
    );
    return { generatedAt: new Date().toISOString(), items };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async fetchRoadmapStatus(
    workspaceId: string,
    themeIds: string[],
  ): Promise<Map<string, boolean>> {
    const roadmapItems = await this.prisma.roadmapItem.findMany({
      where: {
        themeId: { in: themeIds },
        theme: { workspaceId },
        status: { not: 'SHIPPED' },
      },
      select: { themeId: true },
    });
    const map = new Map<string, boolean>();
    for (const item of roadmapItems) {
      if (item.themeId) map.set(item.themeId, true);
    }
    return map;
  }
}

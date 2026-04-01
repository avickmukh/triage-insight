/**
 * ExecutiveDashboardService
 *
 * Produces a single, decision-grade Executive Dashboard payload with five
 * sections that a CPO / VP-Product can act on immediately:
 *
 *   1. 🔥 Top Problems        — top 5 themes by CIQ score (min-signal eligible)
 *   2. 🚨 Rising Issues       — top 5 themes with fastest positive velocity
 *   3. 📉 What Is Declining   — top 5 themes with steepest negative velocity
 *   4. 🧠 Recommended Actions — top 5 themes by Decision Ranking Score (DRS)
 *   5. 💰 Revenue Impact      — top 5 themes by ARR exposure
 *
 * Ranking is fully delegated to ThemeRankingEngine (single source of truth).
 * DRS formula: CIQ×0.30 + Velocity×0.20 + Recency×0.18 + Resurface×0.15
 *              + SourceDiversity×0.10 + Confidence×0.07
 *
 * Quality guards (enforced by ThemeRankingEngine):
 *   • MIN_SIGNALS (3): hard gate — themes with fewer signals excluded
 *   • NEAR_DUP_PENALTY (0.80): soft — near-duplicate themes ranked lower
 *   • LOW_CONF_PENALTY (0.85): soft — low-confidence themes ranked lower
 *   • WEAK_SIGNAL_PENALTY (0.90): soft — 3–5 signal themes ranked lower
 *
 * No LLM calls. All output is derived from real database values.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ThemeRankingEngine,
  RankedTheme,
  SignalQualityLabel,
} from './theme-ranking-engine.service';

// ─── Shared types ─────────────────────────────────────────────────────────────

export type ExecActionType =
  | 'ADD_TO_ROADMAP'
  | 'INCREASE_PRIORITY'
  | 'INVESTIGATE'
  | 'MONITOR'
  | 'WATCH_DECLINE';

export interface ExecDashboardItem {
  themeId:    string;
  themeName:  string;
  shortLabel: string | null;
  ciqScore:   number;
  /** Decision Ranking Score — the composite score used for Recommended Actions. */
  drs:        number;
  reason:     string;
  action:     ExecActionType;
  /** Signal quality labels for UI explainability chips. */
  signalLabels: SignalQualityLabel[];
  signals: {
    totalSignalCount: number;
    trendDelta:       number | null;
    resurfaceCount:   number;
    revenueInfluence: number | null;
    feedbackCount:    number;
    supportCount:     number;
    voiceCount:       number;
    surveyCount:      number;
    sourceDiversity:  number;
    lastEvidenceAt:   Date | null;
    negativePct:      number | null;
  };
}

export interface ExecutiveDashboardResponse {
  generatedAt:        string;
  topProblems:        ExecDashboardItem[];
  risingIssues:       ExecDashboardItem[];
  decliningThemes:    ExecDashboardItem[];
  recommendedActions: ExecDashboardItem[];
  revenueImpact:      ExecDashboardItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pickAction(
  drs: number,
  delta: number,
  resurfaceCount: number,
  onRoadmap: boolean,
  isDecline: boolean,
): ExecActionType {
  if (isDecline) return 'WATCH_DECLINE';
  if (!onRoadmap && drs >= 60) return 'ADD_TO_ROADMAP';
  if (onRoadmap && delta > 20)  return 'INCREASE_PRIORITY';
  if (resurfaceCount > 0)       return 'INVESTIGATE';
  return 'MONITOR';
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ExecutiveDashboardService {
  private readonly logger = new Logger(ExecutiveDashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rankingEngine: ThemeRankingEngine,
  ) {}

  async getDashboard(workspaceId: string): Promise<ExecutiveDashboardResponse> {
    // ── 1. Get all eligible ranked themes from the unified engine ─────────────
    const allRanked = await this.rankingEngine.rankThemes(workspaceId);
    const eligible = allRanked.filter((t) => t.eligibility !== 'INELIGIBLE');

    if (eligible.length === 0) {
      const empty: ExecDashboardItem[] = [];
      return {
        generatedAt:        new Date().toISOString(),
        topProblems:        empty,
        risingIssues:       empty,
        decliningThemes:    empty,
        recommendedActions: empty,
        revenueImpact:      empty,
      };
    }

    // ── 2. Fetch roadmap status for all eligible themes ───────────────────────
    const themeIds = eligible.map((t) => t.themeId);
    const roadmapSet = await this.fetchRoadmapSet(workspaceId, themeIds);

    // ── 3. Build converter ────────────────────────────────────────────────────
    const toItem = (ranked: RankedTheme, isDecline = false): ExecDashboardItem => {
      const delta = ranked.signals.trendDelta ?? 0;
      const onRoadmap = roadmapSet.has(ranked.themeId);
      const action = pickAction(
        ranked.drs, delta, ranked.signals.resurfaceCount, onRoadmap, isDecline,
      );
      return {
        themeId:      ranked.themeId,
        themeName:    ranked.title,
        shortLabel:   ranked.shortLabel,
        ciqScore:     ranked.ciqScore,
        drs:          Math.round(ranked.drs),
        reason:       ranked.reason,
        action,
        signalLabels: ranked.signalLabels,
        signals: {
          totalSignalCount: ranked.signals.totalSignalCount,
          trendDelta:       ranked.signals.trendDelta,
          resurfaceCount:   ranked.signals.resurfaceCount,
          revenueInfluence: ranked.signals.revenueInfluence > 0 ? ranked.signals.revenueInfluence : null,
          feedbackCount:    ranked.signals.feedbackCount,
          supportCount:     ranked.signals.supportCount,
          voiceCount:       ranked.signals.voiceCount,
          surveyCount:      ranked.signals.surveyCount,
          sourceDiversity:  ranked.signals.sourceDiversity,
          lastEvidenceAt:   ranked.signals.lastEvidenceAt,
          negativePct:      ranked.signals.negativePct,
        },
      };
    };

    // ── Section 1: 🔥 Top Problems — highest CIQ (min-signal eligible only) ──
    const topProblems = [...eligible]
      .sort((a, b) => {
        const diff = b.ciqScore - a.ciqScore;
        if (Math.abs(diff) < 0.5) return (b.aiConfidence ?? 0) - (a.aiConfidence ?? 0);
        return diff;
      })
      .slice(0, 5)
      .map((e) => toItem(e));

    // ── Section 2: 🚨 Rising Issues — fastest positive velocity ──────────────
    const risingIssues = [...eligible]
      .filter((e) => (e.signals.trendDelta ?? 0) > 0)
      .sort((a, b) => (b.signals.trendDelta ?? 0) - (a.signals.trendDelta ?? 0))
      .slice(0, 5)
      .map((e) => toItem(e));

    // ── Section 3: 📉 Declining — steepest negative velocity ─────────────────
    const decliningThemes = [...eligible]
      .filter((e) => (e.signals.trendDelta ?? 0) < 0)
      .sort((a, b) => (a.signals.trendDelta ?? 0) - (b.signals.trendDelta ?? 0))
      .slice(0, 5)
      .map((e) => toItem(e, true));

    // ── Section 4: 🧠 Recommended Actions — highest DRS (with all penalties) ──
    // eligible is already sorted by DRS desc from ThemeRankingEngine
    const recommendedActions = eligible
      .slice(0, 5)
      .map((e) => toItem(e));

    // ── Section 5: 💰 Revenue Impact — highest ARR exposure ──────────────────
    const revenueImpact = [...eligible]
      .filter((e) => e.signals.revenueInfluence > 0)
      .sort((a, b) => b.signals.revenueInfluence - a.signals.revenueInfluence)
      .slice(0, 5)
      .map((e) => toItem(e));

    this.logger.log(
      `[ExecutiveDashboard] Generated for workspace ${workspaceId}: ` +
      `topProblems=${topProblems.length}, rising=${risingIssues.length}, ` +
      `declining=${decliningThemes.length}, actions=${recommendedActions.length}, ` +
      `revenue=${revenueImpact.length}`,
    );

    return {
      generatedAt:        new Date().toISOString(),
      topProblems,
      risingIssues,
      decliningThemes,
      recommendedActions,
      revenueImpact,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async fetchRoadmapSet(
    workspaceId: string,
    themeIds: string[],
  ): Promise<Set<string>> {
    const items = await this.prisma.roadmapItem.findMany({
      where: {
        themeId: { in: themeIds },
        theme:   { workspaceId },
        status:  { not: 'SHIPPED' },
      },
      select: { themeId: true },
    });
    const set = new Set<string>();
    for (const item of items) {
      if (item.themeId) set.add(item.themeId);
    }
    return set;
  }
}

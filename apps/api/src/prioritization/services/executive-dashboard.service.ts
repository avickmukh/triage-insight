/**
 * ExecutiveDashboardService
 *
 * Produces a single, decision-grade Executive Dashboard payload with five
 * sections that a CPO / VP-Product can act on immediately:
 *
 *   1. 🔥 Top Problems        — top 5 themes by CIQ score
 *   2. 🚨 Rising Issues       — top 5 themes with fastest positive velocity (trendDelta)
 *   3. 📉 What Is Declining   — top 5 themes with the steepest negative velocity
 *   4. 🧠 Recommended Actions — top 5 themes by Decision Priority Score (DPS)
 *   5. 💰 Revenue Impact      — top 5 themes by ARR exposure (revenueInfluence)
 *
 * Every item includes:
 *   • themeId / themeName / shortLabel
 *   • ciqScore
 *   • reason  (deterministic sentence built from DB values — no LLM)
 *   • action  (ADD_TO_ROADMAP | INCREASE_PRIORITY | INVESTIGATE | MONITOR | WATCH_DECLINE)
 *
 * No LLM calls.  All output is derived from real database values.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
  reason:     string;
  action:     ExecActionType;
  signals: {
    totalSignalCount: number;
    trendDelta:       number | null;
    resurfaceCount:   number;
    revenueInfluence: number | null;
    feedbackCount:    number;
    supportCount:     number;
    voiceCount:       number;
    surveyCount:      number;
    lastEvidenceAt:   Date | null;
    negativePct:      number | null;   // 0–1 fraction of negative signals (for declining)
  };
}

export interface ExecutiveDashboardResponse {
  generatedAt:        string;
  topProblems:        ExecDashboardItem[];   // 🔥 Top 5 by CIQ
  risingIssues:       ExecDashboardItem[];   // 🚨 Top 5 by velocity (positive trendDelta)
  decliningThemes:    ExecDashboardItem[];   // 📉 Top 5 by velocity (negative trendDelta)
  recommendedActions: ExecDashboardItem[];   // 🧠 Top 5 by DPS
  revenueImpact:      ExecDashboardItem[];   // 💰 Top 5 by ARR exposure
}

// ─── DPS weights (same as ActionPlanService for consistency) ──────────────────
const W_CIQ       = 0.35;
const W_VELOCITY  = 0.25;
const W_RECENCY   = 0.20;
const W_RESURFACE = 0.20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatArr(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function computeDps(
  ciq: number,
  delta: number,
  lastEvidenceAt: Date | null,
  resurfaceCount: number,
  now: number,
): number {
  const velocityNorm  = Math.min(100, Math.max(0, ((delta + 50) / 100) * 100));
  let recencyNorm     = 0;
  if (lastEvidenceAt) {
    const ageDays = (now - new Date(lastEvidenceAt).getTime()) / 86_400_000;
    recencyNorm   = Math.max(0, 100 * Math.exp(-ageDays / 30));
  }
  const resurfaceNorm = Math.min(100, resurfaceCount * 25);
  return (
    W_CIQ       * ciq +
    W_VELOCITY  * velocityNorm +
    W_RECENCY   * recencyNorm +
    W_RESURFACE * resurfaceNorm
  );
}

function pickAction(
  dps: number,
  delta: number,
  resurfaceCount: number,
  onRoadmap: boolean,
  isDecline: boolean,
): ExecActionType {
  if (isDecline) return 'WATCH_DECLINE';
  if (!onRoadmap && dps >= 60) return 'ADD_TO_ROADMAP';
  if (onRoadmap && delta > 20)  return 'INCREASE_PRIORITY';
  if (resurfaceCount > 0)       return 'INVESTIGATE';
  return 'MONITOR';
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ExecutiveDashboardService {
  private readonly logger = new Logger(ExecutiveDashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(workspaceId: string): Promise<ExecutiveDashboardResponse> {
    // ── 1. Fetch all non-archived themes with every field we need ─────────────
    const themes = await this.prisma.theme.findMany({
      where: {
        workspaceId,
        status: { not: 'ARCHIVED' },
      },
      select: {
        id:                    true,
        title:                 true,
        shortLabel:            true,
        status:                true,
        ciqScore:              true,
        priorityScore:         true,
        trendDelta:            true,
        resurfaceCount:        true,
        resurfacedAt:          true,
        lastEvidenceAt:        true,
        feedbackCount:         true,
        supportCount:          true,
        voiceCount:            true,
        surveyCount:           true,
        totalSignalCount:      true,
        revenueInfluence:      true,
        signalBreakdown:       true,
        sentimentDistribution: true,
        roadmapItems: {
          select: { id: true, status: true },
          take: 1,
        },
      },
    });

    if (themes.length === 0) {
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

    const now = Date.now();

    // ── 2. Pre-compute derived values for every theme ─────────────────────────
    type Enriched = {
      t:           typeof themes[0];
      ciq:         number;
      delta:       number;
      dps:         number;
      onRoadmap:   boolean;
      negativePct: number | null;
    };

    const enriched: Enriched[] = themes.map((t) => {
      const ciq  = Math.min(100, Math.max(0, t.ciqScore ?? t.priorityScore ?? 0));
      const delta = t.trendDelta ?? 0;
      const dps   = computeDps(ciq, delta, t.lastEvidenceAt, t.resurfaceCount ?? 0, now);
      const onRoadmap = (t.roadmapItems ?? []).some((r) => r.status !== 'SHIPPED');

      // Sentiment: extract negativePct from sentimentDistribution JSON
      let negativePct: number | null = null;
      const dist = t.sentimentDistribution as {
        positive?: number; neutral?: number; negative?: number;
      } | null;
      if (dist) {
        const pos = dist.positive ?? 0;
        const neu = dist.neutral  ?? 0;
        const neg = dist.negative ?? 0;
        const total = pos + neu + neg;
        if (total >= 3) negativePct = neg / total;
      }

      return { t, ciq, delta, dps, onRoadmap, negativePct };
    });

    // ── 3. Build each section ─────────────────────────────────────────────────

    // Helper: convert an Enriched entry into an ExecDashboardItem
    const toItem = (e: Enriched, isDecline = false): ExecDashboardItem => {
      const { t, ciq, delta, dps, onRoadmap } = e;
      const action = pickAction(dps, delta, t.resurfaceCount ?? 0, onRoadmap, isDecline);

      // Build deterministic reason sentence
      const parts: string[] = [];
      parts.push(`CIQ ${Math.round(ciq)}/100`);

      if (delta > 10)  parts.push(`+${Math.round(delta)}% signal velocity WoW`);
      if (delta < -10) parts.push(`${Math.round(delta)}% signal velocity WoW`);

      if ((t.resurfaceCount ?? 0) > 0) {
        parts.push(`resurfaced ${t.resurfaceCount}× after shipping`);
      }
      if ((t.totalSignalCount ?? 0) > 0) {
        parts.push(`${t.totalSignalCount} total signals`);
      }
      if ((t.revenueInfluence ?? 0) > 0) {
        parts.push(`${formatArr(t.revenueInfluence!)} ARR exposure`);
      }
      if (e.negativePct != null && e.negativePct >= 0.4) {
        parts.push(`${Math.round(e.negativePct * 100)}% negative sentiment`);
      }

      // Extract dominant driver from signalBreakdown JSON
      const bd = t.signalBreakdown as Record<string, unknown> | null;
      const dominantDriver = bd?.dominantDriver as string | undefined;
      if (dominantDriver) parts.push(`driver: ${dominantDriver}`);

      const reason = parts.join(' · ');

      return {
        themeId:    t.id,
        themeName:  t.title,
        shortLabel: t.shortLabel ?? null,
        ciqScore:   Math.round(ciq),
        reason,
        action,
        signals: {
          totalSignalCount: t.totalSignalCount ?? 0,
          trendDelta:       delta !== 0 ? delta : null,
          resurfaceCount:   t.resurfaceCount ?? 0,
          revenueInfluence: t.revenueInfluence ?? null,
          feedbackCount:    t.feedbackCount ?? 0,
          supportCount:     t.supportCount ?? 0,
          voiceCount:       t.voiceCount ?? 0,
          surveyCount:      t.surveyCount ?? 0,
          lastEvidenceAt:   t.lastEvidenceAt ?? null,
          negativePct:      e.negativePct,
        },
      };
    };

    // ── Section 1: 🔥 Top Problems — highest CIQ ─────────────────────────────
    const topProblems = [...enriched]
      .sort((a, b) => b.ciq - a.ciq)
      .slice(0, 5)
      .map((e) => toItem(e));

    // ── Section 2: 🚨 Rising Issues — fastest positive velocity ──────────────
    const risingIssues = [...enriched]
      .filter((e) => e.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5)
      .map((e) => toItem(e));

    // ── Section 3: 📉 Declining — steepest negative velocity ─────────────────
    const decliningThemes = [...enriched]
      .filter((e) => e.delta < 0)
      .sort((a, b) => a.delta - b.delta)   // most negative first
      .slice(0, 5)
      .map((e) => toItem(e, true));

    // ── Section 4: 🧠 Recommended Actions — highest DPS ──────────────────────
    const recommendedActions = [...enriched]
      .sort((a, b) => b.dps - a.dps)
      .slice(0, 5)
      .map((e) => toItem(e));

    // ── Section 5: 💰 Revenue Impact — highest ARR exposure ──────────────────
    const revenueImpact = [...enriched]
      .filter((e) => (e.t.revenueInfluence ?? 0) > 0)
      .sort((a, b) => (b.t.revenueInfluence ?? 0) - (a.t.revenueInfluence ?? 0))
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
}

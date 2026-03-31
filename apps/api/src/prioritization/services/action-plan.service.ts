/**
 * ActionPlanService
 *
 * Produces a "Weekly Action Plan" — the top 5 themes a product team should
 * act on RIGHT NOW, ranked by a composite Decision Priority Score (DPS) that
 * combines:
 *
 *   • CIQ score          (35%) — existing composite intelligence score
 *   • Signal velocity    (25%) — WoW trendDelta (capped at ±50 → 0–100)
 *   • Recency            (20%) — how recently the last signal arrived
 *   • Resurfacing bonus  (20%) — extra weight for themes that came back after SHIPPED
 *
 * Quality guards applied before ranking:
 *   • MIN_SIGNAL_THRESHOLD (3): themes with fewer than 3 total signals are excluded
 *     from the top-5 to prevent single-customer ARR from dominating the list.
 *   • NEAR_DUPLICATE_PENALTY (0.20): themes flagged as autoMergeCandidate=true
 *     receive a 20% DPS penalty so near-duplicate split themes don't both appear
 *     in the top-5 at the expense of genuinely distinct problems.
 *   • aiConfidence tiebreaker: when two themes have the same DPS (within 0.5 pts),
 *     the one with higher aiConfidence is ranked first.
 *
 * Each item includes a deterministic, human-readable reason sentence and a
 * recommended action (ADD_TO_ROADMAP | INCREASE_PRIORITY | INVESTIGATE | MONITOR).
 *
 * No LLM calls — all output is derived from real database values.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
  signals: {
    feedbackCount: number;
    supportCount: number;
    voiceCount: number;
    surveyCount: number;
    totalSignalCount: number;
    trendDelta: number | null;
    resurfaceCount: number;
    lastEvidenceAt: Date | null;
  };
}

export interface ActionPlanResponse {
  generatedAt: string;
  items: ActionPlanItem[];
}

// Weights must sum to 1.0
const W_CIQ       = 0.35;
const W_VELOCITY  = 0.25;
const W_RECENCY   = 0.20;
const W_RESURFACE = 0.20;

/** Minimum total signal count for a theme to be eligible for the top-5. */
const MIN_SIGNAL_THRESHOLD = 3;

/** DPS multiplier applied to near-duplicate themes (autoMergeCandidate=true). */
const NEAR_DUPLICATE_PENALTY = 0.80;

@Injectable()
export class ActionPlanService {
  private readonly logger = new Logger(ActionPlanService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getActionPlan(workspaceId: string): Promise<ActionPlanResponse> {
    // ── 1. Fetch all non-archived themes with scoring fields ─────────────────
    const themes = await this.prisma.theme.findMany({
      where: {
        workspaceId,
        status: { not: 'ARCHIVED' },
      },
      select: {
        id: true,
        title: true,
        shortLabel: true,
        status: true,
        ciqScore: true,
        priorityScore: true,
        aiConfidence: true,
        autoMergeCandidate: true,
        trendDelta: true,
        resurfaceCount: true,
        resurfacedAt: true,
        lastEvidenceAt: true,
        feedbackCount: true,
        supportCount: true,
        voiceCount: true,
        surveyCount: true,
        totalSignalCount: true,
        revenueInfluence: true,
        signalBreakdown: true,
        roadmapItems: {
          select: { id: true, status: true },
          take: 1,
        },
      },
    });

    if (themes.length === 0) {
      return { generatedAt: new Date().toISOString(), items: [] };
    }

    const now = Date.now();

    // ── 2. Score each theme ───────────────────────────────────────────────────
    const scored = themes.map((t) => {
      // Use canonical totalSignalCount (persisted by CIQ scorer) as the signal count.
      // Fall back to feedbackCount only if totalSignalCount has not been set yet.
      const signalCount = t.totalSignalCount ?? t.feedbackCount ?? 0;

      // CIQ component (0–100): prefer ciqScore (set by CiqScoringProcessor),
      // fall back to priorityScore (set by CiqService.persistThemeScore).
      const ciq = Math.min(100, Math.max(0, t.ciqScore ?? t.priorityScore ?? 0));

      // Velocity component: trendDelta is WoW % change, cap at ±50 → map to 0–100
      const delta = t.trendDelta ?? 0;
      const velocityNorm = Math.min(100, Math.max(0, ((delta + 50) / 100) * 100));

      // Recency component: exponential decay over 30 days
      let recencyNorm = 0;
      if (t.lastEvidenceAt) {
        const ageDays = (now - new Date(t.lastEvidenceAt).getTime()) / 86_400_000;
        recencyNorm = Math.max(0, 100 * Math.exp(-ageDays / 30));
      }

      // Resurfacing component: each resurface adds 25 pts, capped at 100
      const resurfaceNorm = Math.min(100, (t.resurfaceCount ?? 0) * 25);

      let dps =
        W_CIQ       * ciq +
        W_VELOCITY  * velocityNorm +
        W_RECENCY   * recencyNorm +
        W_RESURFACE * resurfaceNorm;

      // ── Near-duplicate penalty ────────────────────────────────────────────
      // Themes flagged by AutoMergeService as near-duplicates of another theme
      // get a 20% DPS reduction so they don't crowd out distinct problems.
      const isNearDuplicate = t.autoMergeCandidate ?? false;
      if (isNearDuplicate) {
        dps = dps * NEAR_DUPLICATE_PENALTY;
      }

      return { theme: t, ciq, delta, dps, signalCount, isNearDuplicate };
    });

    // ── 3. Apply min-signal guard, sort by DPS, use aiConfidence as tiebreaker ─
    const eligible = scored.filter((s) => s.signalCount >= MIN_SIGNAL_THRESHOLD);

    eligible.sort((a, b) => {
      const dpsDiff = b.dps - a.dps;
      // Use aiConfidence as tiebreaker when DPS values are within 0.5 pts
      if (Math.abs(dpsDiff) < 0.5) {
        const confA = a.theme.aiConfidence ?? 0;
        const confB = b.theme.aiConfidence ?? 0;
        return confB - confA;
      }
      return dpsDiff;
    });

    const top5 = eligible.slice(0, 5);

    // ── 4. Build output items ─────────────────────────────────────────────────
    const items: ActionPlanItem[] = top5.map(({ theme: t, ciq, delta, dps, isNearDuplicate }) => {
      const priority = dps >= 75 ? 'CRITICAL' : dps >= 55 ? 'HIGH' : dps >= 35 ? 'MEDIUM' : 'LOW';

      // Determine recommended action
      const onRoadmap = (t.roadmapItems ?? []).some(
        (r) => r.status !== 'SHIPPED',
      );
      let recommendedAction: ActionType;
      if (!onRoadmap && dps >= 60) {
        recommendedAction = 'ADD_TO_ROADMAP';
      } else if (onRoadmap && delta > 20) {
        recommendedAction = 'INCREASE_PRIORITY';
      } else if ((t.resurfaceCount ?? 0) > 0) {
        recommendedAction = 'INVESTIGATE';
      } else {
        recommendedAction = 'MONITOR';
      }

      // Build deterministic reason sentence
      const parts: string[] = [];
      parts.push(`CIQ score ${Math.round(ciq)}/100`);
      if (delta > 10)  parts.push(`signal velocity +${Math.round(delta)}% WoW`);
      if (delta < -10) parts.push(`signal velocity ${Math.round(delta)}% WoW`);
      if ((t.resurfaceCount ?? 0) > 0) parts.push(`resurfaced ${t.resurfaceCount}× after shipping`);
      if ((t.totalSignalCount ?? 0) > 0) parts.push(`${t.totalSignalCount} total signals`);
      if ((t.revenueInfluence ?? 0) > 0) {
        const arr = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(t.revenueInfluence!);
        parts.push(`${arr} ARR exposure`);
      }
      if (t.aiConfidence != null) {
        parts.push(`${Math.round(t.aiConfidence * 100)}% AI confidence`);
      }
      // Extract dominant driver from signalBreakdown JSON if available
      const bd = t.signalBreakdown as Record<string, unknown> | null;
      const dominantDriver = bd?.dominantDriver as string | undefined;
      if (dominantDriver) parts.push(`dominant driver: ${dominantDriver}`);
      if (isNearDuplicate) parts.push('⚠ near-duplicate of another theme — consider merging');

      const reason = parts.length > 0
        ? parts.join(' · ')
        : 'Ranked by composite Decision Priority Score.';

      return {
        themeId: t.id,
        themeName: t.title,
        shortLabel: t.shortLabel ?? null,
        priority,
        ciqScore: Math.round(ciq),
        decisionPriorityScore: Math.round(dps),
        recommendedAction,
        reason,
        isNearDuplicate,
        signals: {
          feedbackCount:    t.feedbackCount    ?? 0,
          supportCount:     t.supportCount     ?? 0,
          voiceCount:       t.voiceCount       ?? 0,
          surveyCount:      t.surveyCount      ?? 0,
          totalSignalCount: t.totalSignalCount ?? 0,
          trendDelta:       t.trendDelta       ?? null,
          resurfaceCount:   t.resurfaceCount   ?? 0,
          lastEvidenceAt:   t.lastEvidenceAt   ?? null,
        },
      };
    });

    this.logger.log(
      `[ActionPlan] Generated ${items.length} items for workspace ${workspaceId} ` +
      `(eligible: ${eligible.length}/${themes.length}, min_signal_guard: ${MIN_SIGNAL_THRESHOLD}, ` +
      `near_dup_penalty: ${NEAR_DUPLICATE_PENALTY})`,
    );
    return { generatedAt: new Date().toISOString(), items };
  }
}

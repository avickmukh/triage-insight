/**
 * ThemeRankingEngine
 *
 * Single source of truth for ALL theme ranking logic in TriageInsight.
 * Replaces the duplicated ranking code previously spread across:
 *   - ActionPlanService
 *   - ExecutiveDashboardService
 *   - CiqEngineService.getThemeRanking
 *
 * ─── Decision Ranking Score (DRS) formula ────────────────────────────────────
 *
 *   DRS = CIQ×W_CIQ + Velocity×W_VEL + Recency×W_REC + Resurface×W_RES
 *         + SourceDiversity×W_DIV + Confidence×W_CONF
 *
 *   Weights (must sum to 1.0):
 *     W_CIQ  = 0.30  — composite intelligence score
 *     W_VEL  = 0.20  — WoW signal velocity (trendDelta capped ±50 → 0–100)
 *     W_REC  = 0.18  — recency: exponential decay over 30 days
 *     W_RES  = 0.15  — resurfacing bonus (×25 per resurface, capped 100)
 *     W_DIV  = 0.10  — source diversity (0 = single source, 100 = 4 sources)
 *     W_CONF = 0.07  — AI confidence bonus (0–1 → 0–100)
 *
 * ─── Rank-eligibility gates ──────────────────────────────────────────────────
 *
 *   HARD gates (theme is excluded from top-N ranking):
 *     • totalSignalCount < MIN_SIGNALS (3)
 *
 *   SOFT penalties (theme stays visible but DRS is reduced):
 *     • autoMergeCandidate = true  → DRS × NEAR_DUP_PENALTY (0.80)
 *     • aiConfidence < LOW_CONF_THRESHOLD (0.25) → DRS × LOW_CONF_PENALTY (0.85)
 *     • totalSignalCount < WEAK_SIGNAL_THRESHOLD (6) → DRS × WEAK_SIGNAL_PENALTY (0.90)
 *
 * ─── Signal quality labels ───────────────────────────────────────────────────
 *
 *   Each ranked theme gets a set of explainability tags:
 *     "Strong signal"        — ≥10 signals, ≥2 sources, confidence ≥ 0.60
 *     "Multi-source"         — signals from ≥2 distinct source types
 *     "Rising +N% WoW"       — trendDelta > 10
 *     "Declining −N% WoW"    — trendDelta < −10
 *     "High revenue impact"  — revenueInfluence ≥ 50k
 *     "Resurfaced ×N"        — resurfaceCount > 0
 *     "Emerging issue"       — 3–5 signals, rising velocity
 *     "Needs more data"      — totalSignalCount < 6 OR aiConfidence < 0.25
 *     "Near-duplicate"       — autoMergeCandidate = true
 *
 * ─── Tiebreaker ──────────────────────────────────────────────────────────────
 *
 *   When two themes have DRS within 0.5 pts, the one with higher aiConfidence
 *   is ranked first. This prevents arbitrary ordering of equal-score themes.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum total signal count for a theme to be eligible for top-N ranking. */
export const MIN_SIGNALS = 3;

/** Themes with fewer than this many signals get a "Needs more data" label. */
export const WEAK_SIGNAL_THRESHOLD = 6;

/** Themes with AI confidence below this get a "Needs more data" label. */
export const LOW_CONF_THRESHOLD = 0.25;

/** DRS multiplier for near-duplicate themes (autoMergeCandidate = true). */
export const NEAR_DUP_PENALTY = 0.80;

/** DRS multiplier for themes with very low AI confidence. */
export const LOW_CONF_PENALTY = 0.85;

/** DRS multiplier for themes with fewer than WEAK_SIGNAL_THRESHOLD signals. */
export const WEAK_SIGNAL_PENALTY = 0.90;

// ─── DRS weights (must sum to 1.0) ───────────────────────────────────────────

const W_CIQ  = 0.30;
const W_VEL  = 0.20;
const W_REC  = 0.18;
const W_RES  = 0.15;
const W_DIV  = 0.10;
const W_CONF = 0.07;

// ─── Output types ─────────────────────────────────────────────────────────────

/** Signal quality label shown in the UI to explain why a theme is ranked. */
export type SignalQualityLabel =
  | 'Strong signal'
  | 'Multi-source'
  | 'Emerging issue'
  | 'Needs more data'
  | 'Near-duplicate'
  | 'Resurfaced'
  | 'Rising'
  | 'Declining'
  | 'High revenue impact';

/** Rank-eligibility status for a theme. */
export type EligibilityStatus =
  | 'ELIGIBLE'          // passes all hard gates, no soft penalties
  | 'PENALISED'         // passes hard gates but has soft penalties applied
  | 'INELIGIBLE';       // fails a hard gate — excluded from top-N

/** DRS score breakdown for explainability. */
export interface DrsBreakdown {
  ciq:           { raw: number; weight: number; contribution: number };
  velocity:      { raw: number; weight: number; contribution: number };
  recency:       { raw: number; weight: number; contribution: number };
  resurfacing:   { raw: number; weight: number; contribution: number };
  sourceDiversity: { raw: number; weight: number; contribution: number };
  aiConfidence:  { raw: number; weight: number; contribution: number };
  penalties: {
    nearDuplicate: boolean;
    lowConfidence: boolean;
    weakSignal:    boolean;
    multiplier:    number;
  };
}

/** A fully-ranked theme entry returned by ThemeRankingEngine. */
export interface RankedTheme {
  themeId:          string;
  title:            string;
  shortLabel:       string | null;
  status:           string;
  /** Raw CIQ score (0–100). */
  ciqScore:         number;
  /** Decision Ranking Score — the composite score used for all top-N rankings. */
  drs:              number;
  eligibility:      EligibilityStatus;
  signalLabels:     SignalQualityLabel[];
  /** Human-readable explanation sentence built from real DB values. */
  reason:           string;
  signals: {
    totalSignalCount: number;
    feedbackCount:    number;
    voiceCount:       number;
    supportCount:     number;
    surveyCount:      number;
    sourceDiversity:  number;   // 1–4 distinct source types present
    trendDelta:       number | null;
    resurfaceCount:   number;
    revenueInfluence: number;
    lastEvidenceAt:   Date | null;
    negativePct:      number | null;
  };
  aiConfidence:     number | null;
  isNearDuplicate:  boolean;
  breakdown:        DrsBreakdown;
}

// ─── Prisma select shape ──────────────────────────────────────────────────────

const THEME_SELECT = {
  id:                    true,
  title:                 true,
  shortLabel:            true,
  status:                true,
  ciqScore:              true,
  priorityScore:         true,
  aiConfidence:          true,
  autoMergeCandidate:    true,
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
} as const;

type ThemeRow = {
  id: string;
  title: string;
  shortLabel: string | null;
  status: string;
  ciqScore: number | null;
  priorityScore: number | null;
  aiConfidence: number | null;
  autoMergeCandidate: boolean;
  trendDelta: number | null;
  resurfaceCount: number | null;
  resurfacedAt: Date | null;
  lastEvidenceAt: Date | null;
  feedbackCount: number | null;
  supportCount: number | null;
  voiceCount: number | null;
  surveyCount: number | null;
  totalSignalCount: number | null;
  revenueInfluence: number | null;
  signalBreakdown: unknown;
  sentimentDistribution: unknown;
  roadmapItems: { id: string; status: string }[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ThemeRankingEngine {
  private readonly logger = new Logger(ThemeRankingEngine.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Rank all non-archived themes in a workspace using the Decision Ranking Score.
   * Returns ALL themes (eligible + penalised + ineligible) so callers can decide
   * how many to show and which eligibility tiers to include.
   *
   * Sorted by: DRS desc, then aiConfidence desc as tiebreaker.
   */
  async rankThemes(workspaceId: string): Promise<RankedTheme[]> {
    const rows = await this.prisma.theme.findMany({
      // Exclude PROVISIONAL themes from the Decision Ranking Score board.
      // PROVISIONAL clusters are draft candidates that have not yet reached
      // minimum support (minSupport = max(2, floor(log₂(N+2)))). They appear
      // in the draft queue only and must not influence top-N rankings.
      where: { workspaceId, status: { notIn: ['ARCHIVED', 'PROVISIONAL'] } },
      select: THEME_SELECT,
      orderBy: [
        { priorityScore: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
    });

    const now = Date.now();
    const ranked = rows.map((row) => this.scoreTheme(row as ThemeRow, now));

    // Sort by DRS desc, aiConfidence as tiebreaker
    ranked.sort((a, b) => {
      const diff = b.drs - a.drs;
      if (Math.abs(diff) < 0.5) {
        return (b.aiConfidence ?? 0) - (a.aiConfidence ?? 0);
      }
      return diff;
    });

    this.logger.debug(
      `[ThemeRankingEngine] Ranked ${ranked.length} themes for workspace ${workspaceId}`,
    );

    return ranked;
  }

  /**
   * Returns only the top-N themes that pass the hard eligibility gate (≥ MIN_SIGNALS).
   * Penalised themes are included but ranked lower.
   */
  async getTopN(workspaceId: string, n = 5): Promise<RankedTheme[]> {
    const all = await this.rankThemes(workspaceId);
    return all
      .filter((t) => t.eligibility !== 'INELIGIBLE')
      .slice(0, n);
  }

  // ─── Core scoring ────────────────────────────────────────────────────────────

  scoreTheme(row: ThemeRow, now: number): RankedTheme {
    const ciq   = clamp(row.ciqScore ?? row.priorityScore ?? 0);
    const delta = row.trendDelta ?? 0;
    const totalSignals  = row.totalSignalCount ?? row.feedbackCount ?? 0;
    const feedbackCount = row.feedbackCount ?? 0;
    const voiceCount    = row.voiceCount    ?? 0;
    const supportCount  = row.supportCount  ?? 0;
    const surveyCount   = row.surveyCount   ?? 0;
    const resurfaceCount = row.resurfaceCount ?? 0;
    const revenueInfluence = row.revenueInfluence ?? 0;
    const aiConf = row.aiConfidence ?? null;
    const isNearDuplicate = row.autoMergeCandidate ?? false;

    // ── Source diversity (1–4 distinct source types present) ─────────────────
    const sourceDiversity = [
      feedbackCount > 0,
      voiceCount    > 0,
      supportCount  > 0,
      surveyCount   > 0,
    ].filter(Boolean).length;

    // ── Normalised component scores (0–100) ──────────────────────────────────
    const normVelocity   = clamp(((delta + 50) / 100) * 100);
    let normRecency      = 0;
    if (row.lastEvidenceAt) {
      const ageDays = (now - new Date(row.lastEvidenceAt).getTime()) / 86_400_000;
      normRecency = clamp(100 * Math.exp(-ageDays / 30));
    }
    const normResurface  = clamp(resurfaceCount * 25);
    const normDiversity  = clamp((sourceDiversity / 4) * 100);
    const normConf       = clamp((aiConf ?? 0) * 100);

    // ── Raw DRS ───────────────────────────────────────────────────────────────
    const rawDrs =
      W_CIQ  * ciq          +
      W_VEL  * normVelocity  +
      W_REC  * normRecency   +
      W_RES  * normResurface +
      W_DIV  * normDiversity +
      W_CONF * normConf;

    // ── Soft penalties ────────────────────────────────────────────────────────
    const penaltyNearDup   = isNearDuplicate;
    const penaltyLowConf   = aiConf !== null && aiConf < LOW_CONF_THRESHOLD;
    const penaltyWeakSig   = totalSignals > 0 && totalSignals < WEAK_SIGNAL_THRESHOLD;

    let multiplier = 1.0;
    if (penaltyNearDup) multiplier *= NEAR_DUP_PENALTY;
    if (penaltyLowConf) multiplier *= LOW_CONF_PENALTY;
    if (penaltyWeakSig) multiplier *= WEAK_SIGNAL_PENALTY;

    const drs = parseFloat((rawDrs * multiplier).toFixed(2));

    // ── Eligibility ───────────────────────────────────────────────────────────
    let eligibility: EligibilityStatus;
    if (totalSignals < MIN_SIGNALS) {
      eligibility = 'INELIGIBLE';
    } else if (multiplier < 1.0) {
      eligibility = 'PENALISED';
    } else {
      eligibility = 'ELIGIBLE';
    }

    // ── Sentiment ─────────────────────────────────────────────────────────────
    let negativePct: number | null = null;
    const dist = row.sentimentDistribution as {
      positive?: number; neutral?: number; negative?: number;
    } | null;
    if (dist) {
      const pos = dist.positive ?? 0;
      const neu = dist.neutral  ?? 0;
      const neg = dist.negative ?? 0;
      const total = pos + neu + neg;
      if (total >= 3) negativePct = neg / total;
    }

    // ── Signal quality labels ─────────────────────────────────────────────────
    const signalLabels = this.computeSignalLabels({
      totalSignals, sourceDiversity, aiConf, delta, revenueInfluence,
      resurfaceCount, isNearDuplicate,
    });

    // ── Reason sentence ───────────────────────────────────────────────────────
    const reason = this.buildReason({
      ciq, delta, totalSignals, resurfaceCount, revenueInfluence,
      aiConf, isNearDuplicate, negativePct, signalLabels,
      signalBreakdown: row.signalBreakdown,
    });

    // ── Breakdown ─────────────────────────────────────────────────────────────
    const breakdown: DrsBreakdown = {
      ciq:           { raw: ciq,          weight: W_CIQ,  contribution: W_CIQ  * ciq          },
      velocity:      { raw: normVelocity,  weight: W_VEL,  contribution: W_VEL  * normVelocity  },
      recency:       { raw: normRecency,   weight: W_REC,  contribution: W_REC  * normRecency   },
      resurfacing:   { raw: normResurface, weight: W_RES,  contribution: W_RES  * normResurface },
      sourceDiversity: { raw: normDiversity, weight: W_DIV, contribution: W_DIV * normDiversity },
      aiConfidence:  { raw: normConf,      weight: W_CONF, contribution: W_CONF * normConf      },
      penalties: {
        nearDuplicate: penaltyNearDup,
        lowConfidence: penaltyLowConf,
        weakSignal:    penaltyWeakSig,
        multiplier:    parseFloat(multiplier.toFixed(4)),
      },
    };

    return {
      themeId:         row.id,
      title:           row.title,
      shortLabel:      row.shortLabel ?? null,
      status:          row.status,
      ciqScore:        Math.round(ciq),
      drs,
      eligibility,
      signalLabels,
      reason,
      signals: {
        totalSignalCount: totalSignals,
        feedbackCount,
        voiceCount,
        supportCount,
        surveyCount,
        sourceDiversity,
        trendDelta:       delta !== 0 ? delta : null,
        resurfaceCount,
        revenueInfluence,
        lastEvidenceAt:   row.lastEvidenceAt ?? null,
        negativePct,
      },
      aiConfidence:    aiConf,
      isNearDuplicate,
      breakdown,
    };
  }

  // ─── Signal quality labels ───────────────────────────────────────────────────

  private computeSignalLabels(p: {
    totalSignals:    number;
    sourceDiversity: number;
    aiConf:          number | null;
    delta:           number;
    revenueInfluence: number;
    resurfaceCount:  number;
    isNearDuplicate: boolean;
  }): SignalQualityLabel[] {
    const labels: SignalQualityLabel[] = [];

    // Strong signal: high volume + multi-source + confident
    if (
      p.totalSignals >= 10 &&
      p.sourceDiversity >= 2 &&
      (p.aiConf ?? 0) >= 0.60
    ) {
      labels.push('Strong signal');
    }

    // Multi-source
    if (p.sourceDiversity >= 2) {
      labels.push('Multi-source');
    }

    // Trend
    if (p.delta > 10) {
      labels.push('Rising');
    } else if (p.delta < -10) {
      labels.push('Declining');
    }

    // Revenue
    if (p.revenueInfluence >= 50_000) {
      labels.push('High revenue impact');
    }

    // Resurfaced
    if (p.resurfaceCount > 0) {
      labels.push('Resurfaced');
    }

    // Emerging: small but growing
    if (p.totalSignals >= MIN_SIGNALS && p.totalSignals < WEAK_SIGNAL_THRESHOLD && p.delta > 5) {
      labels.push('Emerging issue');
    }

    // Needs more data
    if (
      p.totalSignals < WEAK_SIGNAL_THRESHOLD ||
      (p.aiConf !== null && p.aiConf < LOW_CONF_THRESHOLD)
    ) {
      labels.push('Needs more data');
    }

    // Near-duplicate
    if (p.isNearDuplicate) {
      labels.push('Near-duplicate');
    }

    return labels;
  }

  // ─── Reason sentence ─────────────────────────────────────────────────────────

  private buildReason(p: {
    ciq:             number;
    delta:           number;
    totalSignals:    number;
    resurfaceCount:  number;
    revenueInfluence: number;
    aiConf:          number | null;
    isNearDuplicate: boolean;
    negativePct:     number | null;
    signalLabels:    SignalQualityLabel[];
    signalBreakdown: unknown;
  }): string {
    const parts: string[] = [];

    parts.push(`CIQ ${Math.round(p.ciq)}/100`);

    if (p.totalSignals > 0) {
      parts.push(`${p.totalSignals} total signal${p.totalSignals !== 1 ? 's' : ''}`);
    }

    if (p.delta > 10)  parts.push(`+${Math.round(p.delta)}% signal velocity WoW`);
    if (p.delta < -10) parts.push(`${Math.round(p.delta)}% signal velocity WoW`);

    if (p.resurfaceCount > 0) {
      parts.push(`resurfaced ${p.resurfaceCount}× after shipping`);
    }

    if (p.revenueInfluence >= 10_000) {
      parts.push(`${formatCurrency(p.revenueInfluence)} ARR exposure`);
    }

    if (p.negativePct != null && p.negativePct >= 0.4) {
      parts.push(`${Math.round(p.negativePct * 100)}% negative sentiment`);
    }

    if (p.aiConf != null) {
      parts.push(`${Math.round(p.aiConf * 100)}% AI confidence`);
    }

    // Extract dominant driver from signalBreakdown JSON
    const bd = p.signalBreakdown as Record<string, unknown> | null;
    const dominantDriver = bd?.dominantDriver as string | undefined;
    if (dominantDriver) parts.push(`driver: ${dominantDriver}`);

    if (p.isNearDuplicate) parts.push('⚠ near-duplicate — consider merging');

    if (p.signalLabels.includes('Needs more data')) {
      parts.push('needs more data to fully rank');
    }

    return parts.join(' · ');
  }
}

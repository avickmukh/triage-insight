/**
 * CiqImpactBadge
 *
 * Renders a colour-coded pill showing the DECISION PRIORITY level for a theme.
 * Priority is derived from the CIQ (Customer Intelligence Quotient) score (0–100),
 * which is a composite of ARR influence, deal pipeline, feedback volume, voice
 * signals, survey demand, and support pressure.
 *
 * This badge answers: "How urgently should we act on this theme?"
 * It is NOT the same as AI confidence (narration certainty) or cluster evidence
 * quality (how cohesive the feedback cluster is).
 *
 * Thresholds (aligned with ScoreExplainer and all priority-related UI):
 *   Priority: Critical  ≥ 80   — Act now; significant revenue and customer impact
 *   Priority: High      ≥ 55   — Strong case for roadmap inclusion
 *   Priority: Medium    ≥ 30   — Worth tracking; monitor for signal growth
 *   Priority: Low       < 30   — Low urgency; revisit if signals increase
 *   Unscored            null   — CIQ pipeline has not yet scored this theme
 */

import React from 'react';

export type ImpactLevel = 'critical' | 'high' | 'medium' | 'low' | 'unscored';

interface ImpactConfig {
  label: string;
  tooltip: string;
  bg: string;
  color: string;
  border: string;
}

const IMPACT_CONFIG: Record<ImpactLevel, ImpactConfig> = {
  critical: {
    label: 'Priority: Critical',
    tooltip: 'Decision Priority: Critical (CIQ ≥ 80) — Act now. This theme has significant revenue exposure and high customer impact. Immediate roadmap action is recommended.',
    bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5',
  },
  high: {
    label: 'Priority: High',
    tooltip: 'Decision Priority: High (CIQ ≥ 55) — Strong case for roadmap inclusion. Multiple signals indicate this theme is affecting a meaningful portion of your customer base.',
    bg: '#fff7ed', color: '#c2410c', border: '#fdba74',
  },
  medium: {
    label: 'Priority: Medium',
    tooltip: 'Decision Priority: Medium (CIQ ≥ 30) — Worth tracking. Monitor for signal growth before committing roadmap resources.',
    bg: '#fffbeb', color: '#b45309', border: '#fcd34d',
  },
  low: {
    label: 'Priority: Low',
    tooltip: 'Decision Priority: Low (CIQ < 30) — Low urgency. Revisit if signal volume or revenue impact increases.',
    bg: '#f0fdf4', color: '#15803d', border: '#86efac',
  },
  unscored: {
    label: 'Priority: Unscored',
    tooltip: 'Decision Priority: Not yet scored. The CIQ pipeline has not processed this theme yet. Trigger a CIQ recalculation to generate a priority score.',
    bg: '#f8f9fa', color: '#6C757D', border: '#dee2e6',
  },
};

export function getImpactLevel(score: number | null | undefined): ImpactLevel {
  if (score == null) return 'unscored';
  if (score >= 80) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

interface CiqImpactBadgeProps {
  /** CIQ priorityScore in range 0–100, or null/undefined if not yet scored */
  score: number | null | undefined;
  /** Whether to show the numeric score alongside the label. Defaults to false. */
  showScore?: boolean;
  /** Optional size variant. Defaults to 'sm'. */
  size?: 'xs' | 'sm' | 'md';
}

export function CiqImpactBadge({ score, showScore = false, size = 'sm' }: CiqImpactBadgeProps) {
  const level = getImpactLevel(score);
  const cfg = IMPACT_CONFIG[level];

  const fontSize = size === 'xs' ? '0.65rem' : size === 'md' ? '0.8rem' : '0.7rem';
  const padding  = size === 'xs' ? '0.15rem 0.45rem' : size === 'md' ? '0.3rem 0.75rem' : '0.2rem 0.6rem';

  return (
    <span
      data-testid="ciq-impact-badge"
      data-level={level}
      title={cfg.tooltip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        fontSize,
        fontWeight: 700,
        letterSpacing: '0.03em',
        padding,
        borderRadius: '999px',
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        cursor: 'help',
      }}
    >
      {cfg.label}
      {showScore && score != null && (
        <span style={{ fontWeight: 400, opacity: 0.75 }}>
          {Math.round(score)}
        </span>
      )}
    </span>
  );
}

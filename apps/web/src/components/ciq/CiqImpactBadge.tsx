/**
 * CiqImpactBadge
 *
 * Renders a colour-coded pill label (Critical / High / Medium / Low / Unscored)
 * based on a CIQ priorityScore in the range 0–100.
 *
 * Thresholds:
 *   Critical  ≥ 80   — red
 *   High      ≥ 55   — orange
 *   Medium    ≥ 30   — amber
 *   Low       < 30   — green
 *   Unscored  null   — grey
 */

import React from 'react';

export type ImpactLevel = 'critical' | 'high' | 'medium' | 'low' | 'unscored';

interface ImpactConfig {
  label: string;
  bg: string;
  color: string;
  border: string;
}

const IMPACT_CONFIG: Record<ImpactLevel, ImpactConfig> = {
  critical: { label: 'Critical', bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5' },
  high:     { label: 'High',     bg: '#fff7ed', color: '#c2410c', border: '#fdba74' },
  medium:   { label: 'Medium',   bg: '#fffbeb', color: '#b45309', border: '#fcd34d' },
  low:      { label: 'Low',      bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
  unscored: { label: 'Unscored', bg: '#f8f9fa', color: '#6C757D', border: '#dee2e6' },
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

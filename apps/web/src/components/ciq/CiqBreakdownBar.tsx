'use client';
/**
 * CiqBreakdownBar — visual explainability panel for a theme's CIQ score.
 *
 * Renders each scoring factor as a horizontal progress bar with:
 *   - Factor label
 *   - Raw value (0–100)
 *   - Weight (e.g. 20%)
 *   - Weighted contribution (e.g. 14.2 pts)
 *
 * Usage:
 *   <CiqBreakdownBar breakdown={theme.breakdown} totalScore={theme.ciqScore} />
 */

import React from 'react';
import { CiqScoreBreakdown } from '@/lib/api-types';

interface Props {
  breakdown: Record<string, CiqScoreBreakdown>;
  totalScore: number;
  /** Optional: dominant driver key to highlight */
  dominantDriver?: string | null;
  /** Optional: compact mode for inline use */
  compact?: boolean;
}

// Colour palette for each factor key
const FACTOR_COLORS: Record<string, string> = {
  feedbackFrequency: '#1a73e8',
  uniqueCustomers:   '#20A4A4',
  arrRevenue:        '#7c3aed',
  dealInfluence:     '#9333ea',
  voiceSignal:       '#e65100',
  surveySignal:      '#2e7d32',
  supportSignal:     '#c62828',
  // 5-factor keys (from ciq.service.ts ThemePriorityBreakdown)
  volume:    '#1a73e8',
  severity:  '#c62828',
  frequency: '#20A4A4',
  friction:  '#e65100',
  recency:   '#2e7d32',
};

const DEFAULT_COLOR = '#6C757D';

export function CiqBreakdownBar({ breakdown, totalScore, dominantDriver, compact = false }: Props) {
  const entries = Object.entries(breakdown ?? {});
  if (entries.length === 0) return null;

  // Sort by contribution descending
  const sorted = [...entries].sort((a, b) => b[1].contribution - a[1].contribution);

  return (
    <div style={{ width: '100%' }}>
      {/* Score header */}
      {!compact && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '0.75rem',
        }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0a2540', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            CIQ Score Breakdown
          </span>
          <span style={{
            fontSize: '1.1rem', fontWeight: 800, color: totalScore >= 70 ? '#c62828' : totalScore >= 50 ? '#e65100' : '#1a73e8',
          }}>
            {Math.round(totalScore)}/100
          </span>
        </div>
      )}

      {/* Factor bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '0.35rem' : '0.55rem' }}>
        {sorted.map(([key, factor]) => {
          const color = FACTOR_COLORS[key] ?? DEFAULT_COLOR;
          const isDominant = dominantDriver === key;
          const barWidth = Math.min(100, Math.max(0, factor.value));

          return (
            <div key={key} style={{
              background: isDominant ? '#f0f9ff' : 'transparent',
              borderRadius: '0.375rem',
              padding: compact ? '0.2rem 0.4rem' : '0.35rem 0.5rem',
              border: isDominant ? `1px solid ${color}30` : '1px solid transparent',
            }}>
              {/* Label row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: color, flexShrink: 0, display: 'inline-block',
                  }} />
                  <span style={{ fontSize: compact ? '0.72rem' : '0.78rem', fontWeight: isDominant ? 700 : 500, color: '#0a2540' }}>
                    {factor.label}
                  </span>
                  {isDominant && (
                    <span style={{
                      fontSize: '0.62rem', fontWeight: 700, color: color,
                      background: `${color}18`, padding: '0.1rem 0.4rem',
                      borderRadius: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      Top driver
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  {!compact && (
                    <span style={{ fontSize: '0.7rem', color: '#6C757D' }}>
                      weight {Math.round(factor.weight * 100)}%
                    </span>
                  )}
                  <span style={{ fontSize: compact ? '0.72rem' : '0.78rem', fontWeight: 600, color: '#0a2540' }}>
                    +{factor.contribution.toFixed(1)} pts
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{
                height: compact ? 4 : 6, background: '#e9ecef', borderRadius: '99px', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', width: `${barWidth}%`,
                  background: color, borderRadius: '99px',
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Total contribution check */}
      {!compact && (
        <div style={{
          marginTop: '0.75rem', paddingTop: '0.5rem',
          borderTop: '1px solid #e9ecef',
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem',
        }}>
          <span style={{ fontSize: '0.72rem', color: '#6C757D' }}>Sum of contributions</span>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0a2540' }}>
            {Object.values(breakdown).reduce((s, f) => s + f.contribution, 0).toFixed(1)} pts
          </span>
        </div>
      )}
    </div>
  );
}

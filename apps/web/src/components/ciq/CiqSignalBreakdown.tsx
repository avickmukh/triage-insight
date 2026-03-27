/**
 * CiqSignalBreakdown
 *
 * Renders a compact table of CIQ scoring factors from the `signalBreakdown`
 * JSON field stored on a Theme or returned live from the CIQ scoring endpoint.
 *
 * Each entry in the breakdown has the shape:
 *   { value: number, weight: number, contribution: number, label: string }
 *
 * The component shows the top contributing factors as chips, sorted by
 * contribution descending. Optionally shows the full table in an expanded view.
 */

import React, { useState } from 'react';

interface SignalComponent {
  value?: number;
  weight?: number;
  contribution: number;
  label: string;
}

interface CiqSignalBreakdownProps {
  /**
   * The signalBreakdown object from the Theme or CiqScoreOutput.
   * Keys are factor names (e.g. "requestFrequency", "sentimentPenalty").
   * Values are SignalComponent objects.
   */
  breakdown: Record<string, unknown> | null | undefined;
  /** Sentiment value (-1 to +1) to show as a dedicated row. */
  sentiment?: number | null;
  /** Max number of chips to show before "show more". Defaults to 4. */
  maxChips?: number;
}

const FACTOR_LABELS: Record<string, string> = {
  requestFrequency:   'Request Frequency',
  customerCount:      'Customer Count',
  arrValue:           'ARR Value',
  accountPriority:    'Account Priority',
  dealValue:          'Deal Value',
  sentimentPenalty:   'Sentiment Penalty',
  sentimentUrgency:   'Sentiment Urgency',
  spikeBoost:         'Spike Boost',
  revenueImpact:      'Revenue Impact',
  storedRevenue:      'Stored Revenue',
};

function sentimentLabel(s: number): { text: string; color: string; bg: string } {
  if (s >= 0.3)  return { text: 'Positive', color: '#15803d', bg: '#f0fdf4' };
  if (s <= -0.3) return { text: 'Negative', color: '#b91c1c', bg: '#fef2f2' };
  return { text: 'Neutral', color: '#b45309', bg: '#fffbeb' };
}

export function CiqSignalBreakdown({ breakdown, sentiment, maxChips = 4 }: CiqSignalBreakdownProps) {
  const [expanded, setExpanded] = useState(false);

  if (!breakdown || Object.keys(breakdown).length === 0) {
    return (
      <p style={{ fontSize: '0.78rem', color: '#adb5bd', fontStyle: 'italic', margin: 0 }}>
        No signal breakdown available yet.
      </p>
    );
  }

  // Parse and sort by contribution descending
  const factors = Object.entries(breakdown)
    .map(([key, raw]) => {
      const comp = raw as SignalComponent;
      return {
        key,
        label: comp.label ?? FACTOR_LABELS[key] ?? key,
        contribution: comp.contribution ?? 0,
        value: comp.value,
        weight: comp.weight,
      };
    })
    .filter((f) => f.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution);

  const visible = expanded ? factors : factors.slice(0, maxChips);
  const hasMore = factors.length > maxChips;

  return (
    <div data-testid="ciq-signal-breakdown">
      {/* Sentiment chip */}
      {sentiment != null && (
        <div style={{ marginBottom: '0.625rem' }}>
          <span style={{ fontSize: '0.7rem', color: '#adb5bd', display: 'block', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Sentiment
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {(() => {
              const sl = sentimentLabel(sentiment);
              return (
                <span style={{
                  fontSize: '0.72rem', fontWeight: 700, padding: '0.18rem 0.55rem',
                  borderRadius: '999px', background: sl.bg, color: sl.color,
                }}>
                  {sl.text}
                </span>
              );
            })()}
            <span style={{ fontSize: '0.72rem', color: '#6C757D' }}>
              {sentiment > 0 ? '+' : ''}{sentiment.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Factor chips */}
      <span style={{ fontSize: '0.7rem', color: '#adb5bd', display: 'block', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Contributing Signals
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        {visible.map((f) => (
          <div
            key={f.key}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}
          >
            <span style={{ color: '#495057' }}>{f.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {/* Mini bar */}
              <div style={{ width: '4rem', height: '4px', borderRadius: '2px', background: '#e9ecef', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, f.contribution)}%`,
                  background: f.contribution >= 20 ? '#e63946' : f.contribution >= 10 ? '#f4a261' : '#20A4A4',
                  borderRadius: '2px',
                }} />
              </div>
              <span style={{ fontWeight: 600, color: '#0a2540', minWidth: '2.5rem', textAlign: 'right' }}>
                {f.contribution.toFixed(1)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginTop: '0.5rem', background: 'none', border: 'none', padding: 0,
            fontSize: '0.72rem', color: '#6C757D', cursor: 'pointer', textDecoration: 'underline',
          }}
        >
          {expanded ? 'Show less' : `+${factors.length - maxChips} more signals`}
        </button>
      )}
    </div>
  );
}

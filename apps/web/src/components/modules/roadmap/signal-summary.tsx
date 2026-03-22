'use client';

// ─── SignalSummary ────────────────────────────────────────────────────────────
// Shows a breakdown of signal types (CHURN_RISK, EXPANSION, etc.) for a
// roadmap item's linked theme.

const SIGNAL_COLORS: Record<string, string> = {
  CHURN_RISK:      '#ef4444',
  EXPANSION:       '#22c55e',
  UPSELL:          '#3b82f6',
  SUPPORT_SPIKE:   '#f59e0b',
  NPS_DROP:        '#ec4899',
  FEATURE_REQUEST: '#8b5cf6',
  BUG_REPORT:      '#f97316',
};

const SIGNAL_LABELS: Record<string, string> = {
  CHURN_RISK:      'Churn Risk',
  EXPANSION:       'Expansion',
  UPSELL:          'Upsell',
  SUPPORT_SPIKE:   'Support Spike',
  NPS_DROP:        'NPS Drop',
  FEATURE_REQUEST: 'Feature Request',
  BUG_REPORT:      'Bug Report',
};

interface SignalSummaryProps {
  signalSummary: Record<string, number>;
  signalCount: number;
}

export function SignalSummary({ signalSummary, signalCount }: SignalSummaryProps) {
  const entries = Object.entries(signalSummary).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return (
      <div style={{ color: '#adb5bd', fontSize: '0.82rem', fontStyle: 'italic' }}>
        No signals detected yet.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.82rem', color: '#6C757D' }}>
          {signalCount} total signal{signalCount !== 1 ? 's' : ''} across {entries.length} type{entries.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {entries.map(([type, count]) => {
          const color = SIGNAL_COLORS[type] ?? '#6C757D';
          const label = SIGNAL_LABELS[type] ?? type.replace(/_/g, ' ');
          return (
            <div
              key={type}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem',
                padding: '0.3rem 0.65rem', borderRadius: '999px',
                background: `${color}15`, border: `1px solid ${color}30`,
              }}
            >
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color }}>
                {label}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#6C757D', marginLeft: '0.1rem' }}>
                ×{count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

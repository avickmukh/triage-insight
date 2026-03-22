'use client';

// ─── IntelligenceBar ─────────────────────────────────────────────────────────
// Displays AI priority, confidence, and revenue impact as compact score bars.
// Used on both the board card (compact) and the detail page (full).

interface ScoreBarProps {
  label: string;
  value: number;      // 0–100 (or 0–1 for confidence)
  max?: number;
  color: string;
  compact?: boolean;
}

function ScoreBar({ label, value, max = 100, color, compact }: ScoreBarProps) {
  const pct = Math.min(100, (value / max) * 100);
  const display = max === 1 ? `${(value * 100).toFixed(0)}%` : value.toFixed(0);

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <span style={{ fontSize: '0.65rem', color: '#6C757D', minWidth: '1.8rem', textAlign: 'right' }}>
          {display}
        </span>
        <div style={{ flex: 1, height: '4px', background: '#e9ecef', borderRadius: '999px', minWidth: '40px' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '999px' }} />
        </div>
        <span style={{ fontSize: '0.62rem', color: '#adb5bd', minWidth: '2.5rem' }}>{label}</span>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#495057' }}>{label}</span>
        <span style={{ fontSize: '0.78rem', color: '#6C757D' }}>{display}</span>
      </div>
      <div style={{ height: '6px', background: '#e9ecef', borderRadius: '999px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '999px', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

interface IntelligenceBarProps {
  priorityScore?: number | null;
  confidenceScore?: number | null;
  revenueImpactScore?: number | null;
  compact?: boolean;
}

export function IntelligenceBar({ priorityScore, confidenceScore, revenueImpactScore, compact }: IntelligenceBarProps) {
  const hasAny = priorityScore != null || confidenceScore != null || revenueImpactScore != null;
  if (!hasAny) return null;

  if (compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.5rem' }}>
        {priorityScore != null && (
          <ScoreBar label="Priority" value={priorityScore} max={100} color="#1a56db" compact />
        )}
        {confidenceScore != null && (
          <ScoreBar label="Confidence" value={confidenceScore} max={1} color="#20A4A4" compact />
        )}
        {revenueImpactScore != null && (
          <ScoreBar label="Revenue" value={revenueImpactScore} max={100} color="#7c3aed" compact />
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {priorityScore != null && (
        <ScoreBar label="AI Priority Score" value={priorityScore} max={100} color="#1a56db" />
      )}
      {confidenceScore != null && (
        <ScoreBar label="Confidence Score" value={confidenceScore} max={1} color="#20A4A4" />
      )}
      {revenueImpactScore != null && (
        <ScoreBar label="Revenue Impact Score" value={revenueImpactScore} max={100} color="#7c3aed" />
      )}
    </div>
  );
}

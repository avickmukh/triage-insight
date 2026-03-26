'use client';
/**
 * AiProcessingBanner
 *
 * Step 3 — AI Processing State UX
 *
 * Shown after feedback has been imported but before themes/insights are ready.
 * Disappears automatically once themeCount > 0.
 */

const TEAL  = '#20A4A4';
const NAVY  = '#0A2540';
const GRAY  = '#6C757D';

interface Props {
  feedbackCount: number;
  themeCount: number;
}

export function AiProcessingBanner({ feedbackCount, themeCount }: Props) {
  // Only show when feedback exists but no themes yet
  if (feedbackCount === 0 || themeCount > 0) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.875rem',
      padding: '0.875rem 1.25rem',
      background: '#f0f9ff',
      border: '1px solid #bae6fd',
      borderRadius: '0.75rem',
      marginBottom: '1.25rem',
    }}>
      {/* Animated spinner */}
      <div style={{
        width: 28, height: 28, flexShrink: 0,
        borderRadius: '50%',
        border: `3px solid #bae6fd`,
        borderTopColor: TEAL,
        animation: 'triage-spin 0.9s linear infinite',
      }} />
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: '0.875rem', fontWeight: 700, color: NAVY, margin: '0 0 0.15rem' }}>
          AI is analysing your feedback
        </p>
        <p style={{ fontSize: '0.78rem', color: GRAY, margin: 0, lineHeight: 1.5 }}>
          We&apos;re clustering {feedbackCount} feedback item{feedbackCount !== 1 ? 's' : ''} into themes.
          This usually takes under a minute. Refresh the page to check for new insights.
        </p>
      </div>
      <style>{`
        @keyframes triage-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

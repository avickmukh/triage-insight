'use client';
/**
 * FirstInsightHighlight
 *
 * Step 4 — First Insight Highlight
 *
 * Shown once themes are generated for the first time (themeCount > 0 but
 * the user has not yet clicked through to review insights).
 * Dismissed when the user clicks the CTA or explicitly closes it.
 */
import Link from 'next/link';

const NAVY   = '#0A2540';
const TEAL   = '#20A4A4';
const GRAY   = '#6C757D';
const AMBER  = '#b8860b';
const AMBER_L = '#fff8e1';

interface TopTheme {
  id: string;
  name: string;
  feedbackCount: number;
  priorityScore?: number | null;
}

interface Props {
  topTheme: TopTheme | null | undefined;
  themeCount: number;
  insightsReviewed: boolean;
  href: string;
  onReview: () => void;
  onDismiss: () => void;
}

export function FirstInsightHighlight({
  topTheme,
  themeCount,
  insightsReviewed,
  href,
  onReview,
  onDismiss,
}: Props) {
  // Only show when there are themes and the user hasn't reviewed yet
  if (themeCount === 0 || insightsReviewed) return null;

  return (
    <div style={{
      background: AMBER_L,
      border: `1px solid #fde68a`,
      borderLeft: `3px solid ${AMBER}`,
      borderRadius: '0.875rem',
      padding: '1rem 1.25rem',
      marginBottom: '1.25rem',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.875rem',
    }}>
      <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>✨</span>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: '0.875rem', fontWeight: 800, color: NAVY, margin: '0 0 0.2rem' }}>
          Your first insights are ready!
        </p>
        {topTheme ? (
          <>
            <p style={{ fontSize: '0.82rem', color: NAVY, margin: '0 0 0.15rem', fontWeight: 600 }}>
              Top theme: &ldquo;{topTheme.name}&rdquo;
            </p>
            <p style={{ fontSize: '0.78rem', color: GRAY, margin: '0 0 0.625rem', lineHeight: 1.5 }}>
              {topTheme.feedbackCount} feedback signal{topTheme.feedbackCount !== 1 ? 's' : ''} clustered here
              {topTheme.priorityScore != null
                ? ` · CIQ priority score: ${Math.round(topTheme.priorityScore)}/100`
                : ''}.
              {' '}AI grouped these because they share a common customer pain point.
            </p>
          </>
        ) : (
          <p style={{ fontSize: '0.78rem', color: GRAY, margin: '0 0 0.625rem', lineHeight: 1.5 }}>
            AI has clustered your feedback into {themeCount} theme{themeCount !== 1 ? 's' : ''}.
            Each theme represents a distinct customer pain point or request.
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link
            href={href}
            onClick={onReview}
            style={{
              padding: '0.4rem 1rem',
              borderRadius: '0.4rem',
              background: AMBER,
              color: '#fff',
              fontSize: '0.78rem',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Review insights →
          </Link>
          <button
            onClick={onDismiss}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.75rem', color: GRAY, padding: 0,
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

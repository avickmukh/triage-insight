'use client';
/**
 * CIQ Feature Ranking — /:orgSlug/app/intelligence/features
 *
 * Shows feedback items ranked by 6-dimension CIQ score.
 * Each row links to the feedback detail and shows the customer ARR, vote count, and sentiment.
 */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCiqFeatureRanking } from '@/hooks/use-ciq';
import { appRoutes } from '@/lib/routes';

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 70 ? '#20A4A4' : pct >= 40 ? '#f57c00' : '#c62828';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ flex: 1, height: 6, background: '#e9ecef', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color, minWidth: 28, textAlign: 'right' }}>{Math.round(pct)}</span>
    </div>
  );
}

function SentimentBadge({ sentiment }: { sentiment: number | null }) {
  if (sentiment === null) return <span style={{ color: '#6C757D', fontSize: '0.75rem' }}>—</span>;
  const pct = Math.round(sentiment * 100);
  const color = pct >= 60 ? '#2e7d32' : pct >= 30 ? '#f57c00' : '#c62828';
  return <span style={{ color, fontWeight: 600, fontSize: '0.75rem' }}>{pct}%</span>;
}

export default function IntelligenceFeaturesPage() {
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;
  const routes = appRoutes(orgSlug);

  const { data: features, isLoading, error } = useCiqFeatureRanking(100);

  return (
    <div style={{ padding: '2rem', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <Link href={routes.intelligence} style={{ color: '#20A4A4', textDecoration: 'none', fontSize: '0.875rem' }}>
          ← Intelligence Hub
        </Link>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>Feature CIQ Ranking</h1>
          <p style={{ color: '#6C757D', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
            Feedback items ranked by composite CIQ score — ARR weight, vote count, sentiment, recency, and deal influence
          </p>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#6C757D' }}>Loading feature rankings…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#c62828' }}>Failed to load feature rankings.</div>
      ) : !features || features.length === 0 ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '4rem', color: '#6C757D' }}>
          No feature ranking data yet. CIQ scores are computed asynchronously as feedback accumulates.
        </div>
      ) : (
        <div style={CARD}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e9ecef' }}>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', width: 36 }}>#</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Feature / Feedback</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 140 }}>CIQ Score</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Votes</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sentiment</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ARR</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Themes</th>
                </tr>
              </thead>
              <tbody>
                {features.map((feat, i) => (
                  <tr key={feat.feedbackId} style={{ borderBottom: '1px solid #f0f4f8' }}>
                    <td style={{ padding: '0.875rem 0.5rem', color: '#6C757D', fontWeight: 700, textAlign: 'center' }}>{i + 1}</td>
                    <td style={{ padding: '0.875rem 0.5rem', maxWidth: 320 }}>
                      <Link href={routes.inboxItem(feat.feedbackId)}
                        style={{ fontWeight: 600, color: '#0a2540', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {feat.title}
                      </Link>
                    </td>
                    <td style={{ padding: '0.875rem 0.5rem', minWidth: 140 }}>
                      <ScoreBar score={feat.ciqScore} />
                    </td>
                    <td style={{ padding: '0.875rem 0.5rem', textAlign: 'right', color: '#0a2540', fontWeight: 500 }}>
                      {feat.voteCount}
                    </td>
                    <td style={{ padding: '0.875rem 0.5rem', textAlign: 'right' }}>
                      <SentimentBadge sentiment={feat.sentiment} />
                    </td>
                    <td style={{ padding: '0.875rem 0.5rem', color: '#6C757D', fontSize: '0.8rem' }}>
                      {feat.customerName ?? '—'}
                    </td>
                    <td style={{ padding: '0.875rem 0.5rem', textAlign: 'right', color: '#0a2540', fontWeight: 500 }}>
                      {feat.customerArr > 0 ? `$${(feat.customerArr / 1000).toFixed(0)}k` : '—'}
                    </td>
                    <td style={{ padding: '0.875rem 0.5rem', textAlign: 'right', color: '#6C757D' }}>
                      {feat.themeCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

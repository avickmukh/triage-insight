'use client';
/**
 * Feedback Priority Ranking — /:orgSlug/app/prioritization/features
 *
 * Full table of feedback items ranked by 4-dimension CIQ priority score.
 * NOTE: This page ranks individual feedback items (not features). Renamed from "Feature Priority Ranking".
 * Columns: Rank, Title, Priority Score (bar), Urgency, Revenue Opp, Votes, Sentiment, Customer ARR, Theme Count
 */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { usePrioritizedFeatures } from '@/hooks/use-prioritization';
import { useWorkspace } from '@/hooks/use-workspace';
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
      <div style={{ flex: 1, height: 6, background: '#e9ecef', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, color, minWidth: 28, textAlign: 'right' }}>{Math.round(pct)}</span>
    </div>
  );
}

function SentimentBadge({ sentiment }: { sentiment: number | null }) {
  if (sentiment === null) return <span style={{ color: '#6C757D', fontSize: '0.75rem' }}>—</span>;
  const pct = Math.round((sentiment + 1) * 50);
  const color = pct >= 60 ? '#2e7d32' : pct >= 40 ? '#f57c00' : '#c62828';
  const label = pct >= 60 ? 'Positive' : pct >= 40 ? 'Neutral' : 'Negative';
  return <span style={{ fontSize: '0.75rem', fontWeight: 600, color }}>{label}</span>;
}

export default function FeaturesPage() {
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;
  const routes = appRoutes(orgSlug);
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';

  const { data, isLoading } = usePrioritizedFeatures(workspaceId, 100);
  const features = data?.data ?? [];

  return (
    <div style={{ padding: '2rem', maxWidth: 1400, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <Link href={routes.prioritization} style={{ color: '#6C757D', textDecoration: 'none', fontSize: '0.875rem' }}>Prioritization</Link>
            <span style={{ color: '#6C757D' }}>›</span>
            <span style={{ fontSize: '0.875rem', color: '#0a2540', fontWeight: 500 }}>Feedback Ranking</span>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>Feedback Priority Ranking</h1>
          <p style={{ color: '#6C757D', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
            <strong>Priority Score = business decision score.</strong> Ranked by Demand Strength · Revenue Impact · Strategic Importance · Urgency.
          </p>
          <p style={{ fontSize: '0.8rem', color: '#6C757D', margin: '0.2rem 0 0' }}>
            For signal-intelligence scoring (CIQ), see{' '}
            <a href="../../intelligence/features" style={{ color: '#20A4A4', textDecoration: 'underline', fontWeight: 600 }}>Feedback CIQ Ranking</a>.
          </p>
        </div>
        {data && (
          <div style={{ fontSize: '0.8125rem', color: '#6C757D' }}>
            {data.total} features · {data.cached ? 'cached' : 'live'} · computed {new Date(data.computedAt).toLocaleTimeString()}
          </div>
        )}
      </div>

      <div style={CARD}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6C757D' }}>Computing feature priority scores…</div>
        ) : features.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6C757D' }}>
            No features scored yet. Go to the Prioritization Hub and click Recompute All.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e9ecef' }}>
                  {['#', 'Feature Request', 'Priority Score', 'Urgency', 'Revenue Opp', 'Votes', 'Velocity', 'Sentiment', 'Customer ARR', 'Themes'].map(h => (
                    <th key={h} style={{ padding: '0.625rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#6C757D', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {features.map((f) => (
                  <tr key={f.feedbackId} style={{ borderBottom: '1px solid #f0f4f8' }}>
                    <td style={{ padding: '0.625rem 0.75rem', fontWeight: 700, color: '#6C757D', minWidth: 32 }}>#{f.featurePriorityRank}</td>
                    <td style={{ padding: '0.625rem 0.75rem', minWidth: 200 }}>
                      <div style={{ fontWeight: 600, color: '#0a2540', marginBottom: '0.125rem' }}>{f.title}</div>
                      {f.customerName && <div style={{ fontSize: '0.75rem', color: '#6C757D' }}>{f.customerName}</div>}
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', minWidth: 120 }}>
                      <ScoreBar score={f.priorityScore} />
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: f.urgencyScore >= 70 ? '#c62828' : f.urgencyScore >= 40 ? '#f57c00' : '#6C757D', whiteSpace: 'nowrap' }}>
                      {f.urgencyScore.toFixed(0)}
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: '#20A4A4', whiteSpace: 'nowrap' }}>
                      {f.revenueOpportunityScore.toFixed(0)}
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', color: '#0a2540', fontWeight: 500 }}>{f.voteCount}</td>
                    <td style={{ padding: '0.625rem 0.75rem', color: '#6C757D', fontSize: '0.8125rem' }}>
                      {f.voteVelocity > 0 ? `+${f.voteVelocity.toFixed(1)}/d` : '—'}
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem' }}>
                      <SentimentBadge sentiment={f.sentiment} />
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', color: '#6C757D', whiteSpace: 'nowrap' }}>
                      {f.customerArr > 0 ? `$${(f.customerArr / 1000).toFixed(0)}k` : '—'}
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', color: '#6C757D' }}>{f.themeCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

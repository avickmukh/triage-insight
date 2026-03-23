'use client';
/**
 * Roadmap Recommendations — /:orgSlug/app/prioritization/roadmap
 *
 * Full table of roadmap items with AI-generated promote/deprioritise recommendations.
 * Columns: Title, Theme, Current Status, Score, Recommendation, Urgency, Revenue Opp, Rationale
 */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRoadmapRecommendations } from '@/hooks/use-prioritization';
import { useWorkspace } from '@/hooks/use-workspace';
import { appRoutes } from '@/lib/routes';
import { RoadmapRecommendationType } from '@/lib/api-types';

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const RECOMMENDATION_META: Record<RoadmapRecommendationType, { bg: string; color: string; label: string; icon: string }> = {
  promote_to_committed: { bg: '#fff3cd', color: '#b8860b', label: 'Promote to Committed', icon: '⬆' },
  promote_to_planned:   { bg: '#e8f7f7', color: '#20A4A4', label: 'Promote to Planned',   icon: '↑' },
  keep_current:         { bg: '#f0f4f8', color: '#6C757D', label: 'Keep Current',          icon: '→' },
  deprioritise:         { bg: '#fdecea', color: '#c62828', label: 'Deprioritise',          icon: '↓' },
  already_shipped:      { bg: '#e8f5e9', color: '#2e7d32', label: 'Already Shipped',       icon: '✓' },
};

const STATUS_COLORS: Record<string, string> = {
  BACKLOG:   '#6C757D',
  EXPLORING: '#1a73e8',
  PLANNED:   '#f57c00',
  COMMITTED: '#b8860b',
  SHIPPED:   '#2e7d32',
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

export default function RoadmapRecommendationsPage() {
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;
  const routes = appRoutes(orgSlug);
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';

  const { data, isLoading } = useRoadmapRecommendations(workspaceId, 100);
  const items = data?.data ?? [];

  const promotions = items.filter(i => i.recommendation === 'promote_to_committed' || i.recommendation === 'promote_to_planned').length;
  const deprioritisations = items.filter(i => i.recommendation === 'deprioritise').length;

  return (
    <div style={{ padding: '2rem', maxWidth: 1400, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <Link href={routes.prioritization} style={{ color: '#6C757D', textDecoration: 'none', fontSize: '0.875rem' }}>Prioritization</Link>
            <span style={{ color: '#6C757D' }}>›</span>
            <span style={{ fontSize: '0.875rem', color: '#0a2540', fontWeight: 500 }}>Roadmap Recommendations</span>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>Roadmap Recommendations</h1>
          <p style={{ color: '#6C757D', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
            AI-generated promote / deprioritise recommendations based on 4-dimension CIQ scoring
          </p>
        </div>
        {!isLoading && items.length > 0 && (
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ padding: '0.625rem 1rem', background: '#e8f7f7', borderRadius: '0.75rem', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#20A4A4', fontWeight: 500 }}>Promotions</p>
              <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#20A4A4' }}>{promotions}</p>
            </div>
            <div style={{ padding: '0.625rem 1rem', background: '#fdecea', borderRadius: '0.75rem', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#c62828', fontWeight: 500 }}>Deprioritise</p>
              <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#c62828' }}>{deprioritisations}</p>
            </div>
          </div>
        )}
      </div>

      <div style={CARD}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6C757D' }}>Computing roadmap recommendations…</div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6C757D' }}>
            No roadmap items to recommend on. Add items to your roadmap first.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e9ecef' }}>
                  {['Roadmap Item', 'Theme', 'Status', 'Score', 'Recommendation', 'Urgency', 'Revenue Opp', 'Rationale'].map(h => (
                    <th key={h} style={{ padding: '0.625rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#6C757D', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const recMeta = RECOMMENDATION_META[item.recommendation];
                  const statusColor = STATUS_COLORS[item.status] ?? '#6C757D';
                  return (
                    <tr key={item.roadmapItemId} style={{ borderBottom: '1px solid #f0f4f8' }}>
                      <td style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: '#0a2540', minWidth: 180 }}>
                        <Link href={`${routes.roadmap}/${item.roadmapItemId}`} style={{ color: '#0a2540', textDecoration: 'none' }}>
                          {item.title}
                        </Link>
                      </td>
                      <td style={{ padding: '0.625rem 0.75rem', color: '#6C757D', minWidth: 140 }}>
                        {item.themeTitle ?? '—'}
                      </td>
                      <td style={{ padding: '0.625rem 0.75rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: statusColor }}>{item.status}</span>
                      </td>
                      <td style={{ padding: '0.625rem 0.75rem', minWidth: 120 }}>
                        <ScoreBar score={item.roadmapRecommendationScore} />
                      </td>
                      <td style={{ padding: '0.625rem 0.75rem', minWidth: 180 }}>
                        <span style={{ padding: '0.25rem 0.625rem', borderRadius: '0.375rem', fontSize: '0.75rem', fontWeight: 600, background: recMeta.bg, color: recMeta.color, whiteSpace: 'nowrap' }}>
                          {recMeta.icon} {recMeta.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: item.urgencyScore >= 70 ? '#c62828' : item.urgencyScore >= 40 ? '#f57c00' : '#6C757D' }}>
                        {item.urgencyScore.toFixed(0)}
                      </td>
                      <td style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: '#20A4A4' }}>
                        {item.revenueOpportunityScore.toFixed(0)}
                      </td>
                      <td style={{ padding: '0.625rem 0.75rem', color: '#6C757D', fontSize: '0.8125rem', maxWidth: 300 }}>
                        {item.rationale}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

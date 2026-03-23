'use client';
/**
 * Revenue Opportunities — /:orgSlug/app/prioritization/opportunities
 *
 * High-value themes and features not yet committed to roadmap.
 * Columns: Type, Title, Opportunity Score, Revenue Opp, Urgency, ARR at Risk, Deals, Reason
 */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { usePrioritizationOpportunities } from '@/hooks/use-prioritization';
import { useWorkspace } from '@/hooks/use-workspace';
import { appRoutes } from '@/lib/routes';

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const TYPE_META: Record<string, { bg: string; color: string; label: string }> = {
  theme:   { bg: '#e8f7f7', color: '#20A4A4', label: 'Theme' },
  feature: { bg: '#e8f0fe', color: '#1a73e8', label: 'Feature' },
  roadmap: { bg: '#fff3cd', color: '#b8860b', label: 'Roadmap' },
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

export default function OpportunitiesPage() {
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;
  const routes = appRoutes(orgSlug);
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';

  const { data, isLoading } = usePrioritizationOpportunities(workspaceId, 100);
  const opps = data?.data ?? [];

  const totalArrAtRisk = opps.reduce((s, o) => s + o.arrAtRisk, 0);

  return (
    <div style={{ padding: '2rem', maxWidth: 1400, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <Link href={routes.prioritization} style={{ color: '#6C757D', textDecoration: 'none', fontSize: '0.875rem' }}>Prioritization</Link>
            <span style={{ color: '#6C757D' }}>›</span>
            <span style={{ fontSize: '0.875rem', color: '#0a2540', fontWeight: 500 }}>Opportunities</span>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>Revenue Opportunities</h1>
          <p style={{ color: '#6C757D', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
            High-value themes and features not yet committed to roadmap
          </p>
        </div>
        {totalArrAtRisk > 0 && (
          <div style={{ padding: '0.75rem 1.25rem', background: '#fdecea', borderRadius: '0.75rem', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#c62828', fontWeight: 500 }}>Total ARR at Risk</p>
            <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#c62828' }}>${(totalArrAtRisk / 1000).toFixed(0)}k</p>
          </div>
        )}
      </div>

      <div style={CARD}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6C757D' }}>Computing revenue opportunities…</div>
        ) : opps.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6C757D' }}>
            No high-value opportunities detected. Opportunities appear when high-scoring themes or features are not yet on the roadmap.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e9ecef' }}>
                  {['Type', 'Title', 'Opportunity Score', 'Revenue Opp', 'Urgency', 'ARR at Risk', 'Deals', 'Reason'].map(h => (
                    <th key={h} style={{ padding: '0.625rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#6C757D', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {opps.map((opp) => {
                  const typeMeta = TYPE_META[opp.type] ?? TYPE_META.feature;
                  return (
                    <tr key={opp.entityId} style={{ borderBottom: '1px solid #f0f4f8' }}>
                      <td style={{ padding: '0.625rem 0.75rem' }}>
                        <span style={{ padding: '0.25rem 0.625rem', borderRadius: '0.375rem', fontSize: '0.75rem', fontWeight: 600, background: typeMeta.bg, color: typeMeta.color }}>
                          {typeMeta.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: '#0a2540', minWidth: 200 }}>{opp.title}</td>
                      <td style={{ padding: '0.625rem 0.75rem', minWidth: 120 }}>
                        <ScoreBar score={opp.opportunityScore} />
                      </td>
                      <td style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: '#20A4A4' }}>
                        {opp.revenueOpportunityScore.toFixed(0)}
                      </td>
                      <td style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: opp.urgencyScore >= 70 ? '#c62828' : opp.urgencyScore >= 40 ? '#f57c00' : '#6C757D' }}>
                        {opp.urgencyScore.toFixed(0)}
                      </td>
                      <td style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: opp.arrAtRisk > 0 ? '#c62828' : '#6C757D', whiteSpace: 'nowrap' }}>
                        {opp.arrAtRisk > 0 ? `$${(opp.arrAtRisk / 1000).toFixed(0)}k` : '—'}
                      </td>
                      <td style={{ padding: '0.625rem 0.75rem', color: '#6C757D' }}>{opp.dealCount}</td>
                      <td style={{ padding: '0.625rem 0.75rem', color: '#6C757D', fontSize: '0.8125rem', maxWidth: 280 }}>{opp.reason}</td>
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

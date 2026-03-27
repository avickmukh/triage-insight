'use client';
/**
 * Prioritization Engine Hub — /:orgSlug/app/prioritization
 *
 * Displays:
 *   - KPI row: top-priority theme, highest-urgency feature, ARR at risk, opportunities count
 *   - Top 5 themes by 4-dimension priority score
 *   - Top 5 revenue opportunities
 *   - Roadmap recommendations (promote / deprioritise)
 *   - Recompute button (ADMIN)
 */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { usePrioritizedThemes, usePrioritizationOpportunities, useRoadmapRecommendations, useRecompute } from '@/hooks/use-prioritization';
import { useWorkspace } from '@/hooks/use-workspace';
import { appRoutes } from '@/lib/routes';
import { RoadmapRecommendationType } from '@/lib/api-types';

// ─── Design tokens ────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};
const RECOMMENDATION_META: Record<RoadmapRecommendationType, { bg: string; color: string; label: string }> = {
  promote_to_committed: { bg: '#fff3cd', color: '#b8860b', label: 'Promote to Committed' },
  promote_to_planned:   { bg: '#e8f7f7', color: '#20A4A4', label: 'Promote to Planned' },
  keep_current:         { bg: '#f0f4f8', color: '#6C757D', label: 'Keep Current' },
  deprioritise:         { bg: '#fdecea', color: '#c62828', label: 'Deprioritise' },
  already_shipped:      { bg: '#e8f5e9', color: '#2e7d32', label: 'Already Shipped' },
};
const STRATEGIC_TAG_META: Record<string, { bg: string; color: string }> = {
  strategic:      { bg: '#fff3cd', color: '#b8860b' },
  core:           { bg: '#e8f7f7', color: '#20A4A4' },
  'nice-to-have': { bg: '#f0f4f8', color: '#6C757D' },
  deprioritised:  { bg: '#fdecea', color: '#c62828' },
};

function ScoreBar({ score, max = 100 }: { score: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (score / max) * 100));
  const color = pct >= 70 ? '#20A4A4' : pct >= 40 ? '#f57c00' : '#c62828';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ flex: 1, height: 6, background: '#e9ecef', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color, minWidth: 28, textAlign: 'right' }}>{Math.round(score)}</span>
    </div>
  );
}

function KpiCard({ label, value, sub, color = '#0a2540' }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ ...CARD, flex: 1, minWidth: 160 }}>
      <p style={{ margin: 0, fontSize: '0.75rem', color: '#6C757D', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ margin: '0.25rem 0 0', fontSize: '1.5rem', fontWeight: 700, color }}>{value}</p>
      {sub && <p style={{ margin: '0.125rem 0 0', fontSize: '0.75rem', color: '#6C757D' }}>{sub}</p>}
    </div>
  );
}

export default function PrioritizationPage() {
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;
  const routes = appRoutes(orgSlug);
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';

  const { data: themesData, isLoading: themesLoading } = usePrioritizedThemes(workspaceId, { limit: 5 });
  const { data: oppsData, isLoading: oppsLoading } = usePrioritizationOpportunities(workspaceId, 5);
  const { data: roadmapData, isLoading: roadmapLoading } = useRoadmapRecommendations(workspaceId, 5);
  const recompute = useRecompute(workspaceId);

  const isLoading = themesLoading || oppsLoading || roadmapLoading;
  const themes = themesData?.data ?? [];
  const opps = oppsData?.data ?? [];
  const roadmapItems = roadmapData?.data ?? [];

  const topTheme = themes[0];
  const arrAtRisk = opps.reduce((s, o) => s + o.arrAtRisk, 0);
  const actionableRoadmap = roadmapItems.filter(r => r.recommendation === 'promote_to_committed' || r.recommendation === 'promote_to_planned').length;

  return (
    <div style={{ padding: '2rem', maxWidth: 1400, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>
            Prioritization Engine
          </h1>
          <p style={{ color: '#6C757D', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
            4-dimension CIQ scoring: Demand Strength · Revenue Impact · Strategic Importance · Urgency Signals
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link href={routes.prioritizationFeatures}
            style={{ padding: '0.5rem 1rem', background: '#f0f4f8', color: '#0a2540', borderRadius: '0.5rem', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500 }}>
            Feature Ranking
          </Link>
          <Link href={routes.prioritizationOpportunities}
            style={{ padding: '0.5rem 1rem', background: '#f0f4f8', color: '#0a2540', borderRadius: '0.5rem', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500 }}>
            Opportunities
          </Link>
          <Link href={routes.prioritizationRoadmap}
            style={{ padding: '0.5rem 1rem', background: '#f0f4f8', color: '#0a2540', borderRadius: '0.5rem', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500 }}>
            Roadmap Recs
          </Link>
          <Link href={routes.prioritizationBoard}
            style={{ padding: '0.5rem 1rem', background: '#e8f0fe', color: '#1a73e8', borderRadius: '0.5rem', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600, border: '1px solid #c5d8fc' }}>
            Priority Board
          </Link>
          <button
            onClick={() => recompute.mutate()}
            disabled={recompute.isPending}
            style={{ padding: '0.5rem 1rem', background: '#20A4A4', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, opacity: recompute.isPending ? 0.7 : 1 }}>
            {recompute.isPending ? 'Queuing…' : '⟳ Recompute All'}
          </button>
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <KpiCard label="Top Priority Theme" value={topTheme?.title ? (topTheme.title.length > 22 ? topTheme.title.slice(0, 22) + '…' : topTheme.title) : '—'} sub={topTheme ? `Score: ${topTheme.priorityScore}` : undefined} color="#20A4A4" />
        <KpiCard label="ARR at Risk" value={arrAtRisk > 0 ? `$${(arrAtRisk / 1000).toFixed(0)}k` : '—'} sub={`${opps.length} opportunities`} color="#c62828" />
        <KpiCard label="Roadmap Actions" value={actionableRoadmap} sub="promote or deprioritise" color="#b8860b" />
        <KpiCard label="Active Themes" value={themesData?.total ?? '—'} sub="ACTIVE status" />
      </div>

      {isLoading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6C757D' }}>
          Computing prioritization scores…
        </div>
      )}

      {!isLoading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
          {/* ── Top Themes ── */}
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>Top Themes by Priority</h2>
              <Link href={routes.prioritization} style={{ fontSize: '0.75rem', color: '#20A4A4', textDecoration: 'none' }}>View all →</Link>
            </div>
            {themes.length === 0 ? (
              <p style={{ color: '#6C757D', fontSize: '0.875rem' }}>No themes scored yet. Run Recompute to generate scores.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                {themes.map((t, i) => (
                  <div key={t.themeId} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6C757D', minWidth: 18 }}>#{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0a2540', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                        {t.strategicTag && (
                          <span style={{ fontSize: '0.625rem', padding: '0.125rem 0.375rem', borderRadius: '0.25rem', fontWeight: 600, background: STRATEGIC_TAG_META[t.strategicTag]?.bg ?? '#f0f4f8', color: STRATEGIC_TAG_META[t.strategicTag]?.color ?? '#6C757D' }}>
                            {t.strategicTag}
                          </span>
                        )}
                        {t.hasManualOverride && (
                          <span style={{ fontSize: '0.625rem', padding: '0.125rem 0.375rem', borderRadius: '0.25rem', fontWeight: 600, background: '#fce8ff', color: '#7c3aed' }}>override</span>
                        )}
                      </div>
                      <ScoreBar score={t.priorityScore} />
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 80 }}>
                      <div style={{ fontSize: '0.75rem', color: '#6C757D' }}>{t.feedbackCount} req</div>
                      <div style={{ fontSize: '0.75rem', color: '#6C757D' }}>${(t.revenueInfluence / 1000).toFixed(0)}k ARR</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Revenue Opportunities ── */}
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>Revenue Opportunities</h2>
              <Link href={routes.prioritizationOpportunities} style={{ fontSize: '0.75rem', color: '#20A4A4', textDecoration: 'none' }}>View all →</Link>
            </div>
            {opps.length === 0 ? (
              <p style={{ color: '#6C757D', fontSize: '0.875rem' }}>No high-value opportunities detected yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                {opps.map((opp) => (
                  <div key={opp.entityId} style={{ padding: '0.75rem', background: '#f8f9fa', borderRadius: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0a2540', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{opp.title}</span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#20A4A4' }}>{opp.opportunityScore.toFixed(0)}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#6C757D', lineHeight: 1.4 }}>{opp.reason}</p>
                    {opp.arrAtRisk > 0 && (
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#c62828', fontWeight: 600 }}>
                        ${(opp.arrAtRisk / 1000).toFixed(0)}k ARR at risk
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Roadmap Recommendations ── */}
          <div style={{ ...CARD, gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>Roadmap Recommendations</h2>
              <Link href={routes.prioritizationRoadmap} style={{ fontSize: '0.75rem', color: '#20A4A4', textDecoration: 'none' }}>View all →</Link>
            </div>
            {roadmapItems.length === 0 ? (
              <p style={{ color: '#6C757D', fontSize: '0.875rem' }}>No roadmap items to recommend on yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e9ecef' }}>
                      {['Roadmap Item', 'Theme', 'Score', 'Recommendation', 'Rationale'].map(h => (
                        <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#6C757D', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {roadmapItems.map((r) => {
                      const meta = RECOMMENDATION_META[r.recommendation];
                      return (
                        <tr key={r.roadmapItemId} style={{ borderBottom: '1px solid #f0f4f8' }}>
                          <td style={{ padding: '0.625rem 0.75rem', fontWeight: 500, color: '#0a2540' }}>{r.title}</td>
                          <td style={{ padding: '0.625rem 0.75rem', color: '#6C757D' }}>{r.themeTitle ?? '—'}</td>
                          <td style={{ padding: '0.625rem 0.75rem' }}>
                            <span style={{ fontWeight: 700, color: r.roadmapRecommendationScore >= 70 ? '#20A4A4' : r.roadmapRecommendationScore >= 40 ? '#f57c00' : '#c62828' }}>
                              {r.roadmapRecommendationScore.toFixed(0)}
                            </span>
                          </td>
                          <td style={{ padding: '0.625rem 0.75rem' }}>
                            <span style={{ padding: '0.25rem 0.625rem', borderRadius: '0.375rem', fontSize: '0.75rem', fontWeight: 600, background: meta.bg, color: meta.color }}>
                              {meta.label}
                            </span>
                          </td>
                          <td style={{ padding: '0.625rem 0.75rem', color: '#6C757D', fontSize: '0.8125rem' }}>{r.rationale}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

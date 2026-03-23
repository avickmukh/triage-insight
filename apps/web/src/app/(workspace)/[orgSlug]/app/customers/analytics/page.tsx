'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useCustomerAnalytics } from '@/hooks/use-customers';
import { appRoutes } from '@/lib/routes';

// ─── Design tokens ────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

function formatARR(value: number | null | undefined): string {
  if (!value) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function Skeleton({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'linear-gradient(90deg, #f0f4f8 25%, #e4eaf0 50%, #f0f4f8 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite', borderRadius: '0.5rem', ...style }} />
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, accent, sub }: { label: string; value: string | number; accent: string; sub?: string }) {
  return (
    <div style={{ ...CARD, padding: '1.25rem' }}>
      <div style={{ fontSize: '0.72rem', color: '#6C757D', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>{label}</div>
      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: accent, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: '#6C757D', marginTop: '0.4rem' }}>{sub}</div>}
    </div>
  );
}

// ─── Segment Bar Chart ────────────────────────────────────────────────────────
function SegmentBreakdown({ data }: { data: Array<{ segment: string; count: number; totalARR: number; avgCIQ: number }> }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const SEGMENT_COLORS: Record<string, string> = {
    ENTERPRISE: '#0a2540',
    MID_MARKET: '#20A4A4',
    SMB: '#f4a261',
    STARTUP: '#6a1b9a',
    PARTNER: '#2e7d32',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {data.map((seg) => {
        const pct = Math.round((seg.count / maxCount) * 100);
        const color = SEGMENT_COLORS[seg.segment] ?? '#6C757D';
        return (
          <div key={seg.segment}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0a2540' }}>{seg.segment.replace('_', ' ')}</span>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: '#6C757D' }}>
                <span>{seg.count} customers</span>
                <span style={{ color: '#2e7d32', fontWeight: 600 }}>{formatARR(seg.totalARR)}</span>
                <span style={{ color: '#20A4A4', fontWeight: 600 }}>CIQ {seg.avgCIQ.toFixed(0)}</span>
              </div>
            </div>
            <div style={{ height: '8px', background: '#e9ecef', borderRadius: '4px' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.4s ease' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Lifecycle Donut ─────────────────────────────────────────────────────────
function LifecycleDistribution({ data }: { data: Record<string, number> }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  const LIFECYCLE_COLORS: Record<string, { color: string; label: string }> = {
    LEAD:      { color: '#94a3b8', label: 'Lead' },
    PROSPECT:  { color: '#1565c0', label: 'Prospect' },
    ACTIVE:    { color: '#059669', label: 'Active' },
    EXPANDING: { color: '#1b5e20', label: 'Expanding' },
    AT_RISK:   { color: '#f59e0b', label: 'At Risk' },
    CHURNED:   { color: '#dc2626', label: 'Churned' },
  };
  const entries = Object.entries(data).filter(([, v]) => v > 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {entries.map(([stage, count]) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const { color, label } = LIFECYCLE_COLORS[stage] ?? { color: '#6C757D', label: stage };
        return (
          <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#0a2540' }}>{label}</span>
                <span style={{ fontSize: '0.75rem', color: '#6C757D' }}>{count} ({pct}%)</span>
              </div>
              <div style={{ height: '5px', background: '#e9ecef', borderRadius: '3px' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '3px' }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Churn Risk Distribution ──────────────────────────────────────────────────
function ChurnRiskDistribution({ data }: { data: { low: number; medium: number; high: number; critical: number } }) {
  const total = data.low + data.medium + data.high + data.critical;
  const bands = [
    { label: 'Low', value: data.low, color: '#059669' },
    { label: 'Medium', value: data.medium, color: '#f59e0b' },
    { label: 'High', value: data.high, color: '#e63946' },
    { label: 'Critical', value: data.critical, color: '#7f1d1d' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Stacked bar */}
      <div style={{ display: 'flex', height: '14px', borderRadius: '7px', overflow: 'hidden', gap: '2px' }}>
        {bands.map((b) => {
          const pct = total > 0 ? Math.round((b.value / total) * 100) : 0;
          return pct > 0 ? <div key={b.label} style={{ width: `${pct}%`, background: b.color }} /> : null;
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
        {bands.map((b) => {
          const pct = total > 0 ? Math.round((b.value / total) * 100) : 0;
          return (
            <div key={b.label} style={{ background: '#f8f9fa', borderRadius: '0.5rem', padding: '0.625rem 0.75rem', borderLeft: `3px solid ${b.color}` }}>
              <div style={{ fontSize: '0.7rem', color: '#6C757D', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>{b.label}</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: b.color }}>{b.value}</div>
              <div style={{ fontSize: '0.7rem', color: '#adb5bd' }}>{pct}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ARR-Weighted Demand ──────────────────────────────────────────────────────
function ArrWeightedDemand({ data }: { data: Array<{ customerId: string; name: string; arrValue: number; featureDemandScore: number; weightedScore: number }> }) {
  const maxScore = Math.max(...data.map((d) => d.weightedScore), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {data.slice(0, 10).map((item) => {
        const pct = Math.round((item.weightedScore / maxScore) * 100);
        return (
          <div key={item.customerId} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0a2540', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>{item.name}</span>
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.72rem', color: '#6C757D', flexShrink: 0 }}>
                  <span style={{ color: '#2e7d32', fontWeight: 600 }}>{formatARR(item.arrValue)}</span>
                  <span>Demand {item.featureDemandScore.toFixed(0)}</span>
                  <span style={{ color: '#6a1b9a', fontWeight: 700 }}>Score {item.weightedScore.toFixed(0)}</span>
                </div>
              </div>
              <div style={{ height: '5px', background: '#e9ecef', borderRadius: '3px' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: '#6a1b9a', borderRadius: '3px' }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Top by CIQ Table ─────────────────────────────────────────────────────────
function TopByCIQTable({ data, orgSlug }: { data: Array<{ id: string; name: string; segment?: string | null; arrValue: number; ciqInfluenceScore: number; healthScore: number; lifecycleStage: string; feedbackCount: number }>; orgSlug: string }) {
  const r = appRoutes(orgSlug);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f8f9fa', borderBottom: '1px solid #e9ecef' }}>
            {['Customer', 'Segment', 'ARR', 'CIQ Score', 'Health', 'Lifecycle', 'Feedback', ''].map((h) => (
              <th key={h} style={{ padding: '0.625rem 0.875rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: 600, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((c, idx) => {
            const healthPct = Math.round(c.healthScore * 100);
            const healthColor = healthPct >= 70 ? '#059669' : healthPct >= 40 ? '#f59e0b' : '#dc2626';
            return (
              <tr key={c.id} style={{ borderBottom: '1px solid #f0f4f8' }}>
                <td style={{ padding: '0.75rem 0.875rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: '20px', height: '20px', background: '#f0f4f8', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: '#6C757D', flexShrink: 0 }}>
                      {idx + 1}
                    </span>
                    <Link href={`${r.customers}/${c.id}`} style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0a2540', textDecoration: 'none' }}>
                      {c.name}
                    </Link>
                  </div>
                </td>
                <td style={{ padding: '0.75rem 0.875rem' }}>
                  {c.segment ? (
                    <span style={{ background: '#f3e5f5', color: '#6a1b9a', padding: '0.15rem 0.5rem', borderRadius: '1rem', fontSize: '0.7rem', fontWeight: 600 }}>
                      {c.segment.replace('_', ' ')}
                    </span>
                  ) : <span style={{ color: '#adb5bd' }}>—</span>}
                </td>
                <td style={{ padding: '0.75rem 0.875rem', fontWeight: 700, color: '#0a2540', fontSize: '0.875rem' }}>
                  {formatARR(c.arrValue)}
                </td>
                <td style={{ padding: '0.75rem 0.875rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ width: '40px', height: '5px', background: '#e9ecef', borderRadius: '3px' }}>
                      <div style={{ width: `${Math.min(100, c.ciqInfluenceScore)}%`, height: '100%', background: '#20A4A4', borderRadius: '3px' }} />
                    </div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#20A4A4' }}>{Math.round(c.ciqInfluenceScore)}</span>
                  </div>
                </td>
                <td style={{ padding: '0.75rem 0.875rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: healthColor }}>
                    {healthPct}%
                  </span>
                </td>
                <td style={{ padding: '0.75rem 0.875rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#6C757D' }}>{c.lifecycleStage.replace('_', ' ')}</span>
                </td>
                <td style={{ padding: '0.75rem 0.875rem', fontSize: '0.8rem', color: '#6C757D' }}>
                  {c.feedbackCount}
                </td>
                <td style={{ padding: '0.75rem 0.875rem' }}>
                  <Link href={`${r.customers}/${c.id}`} style={{ fontSize: '0.75rem', color: '#20A4A4', textDecoration: 'none', fontWeight: 500 }}>
                    View →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CustomerAnalyticsPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const r = appRoutes(orgSlug);
  const { data, isLoading, isError } = useCustomerAnalytics();

  if (isLoading) {
    return (
      <>
        <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
        <div style={{ marginBottom: '1.5rem' }}>
          <Skeleton style={{ height: '1.5rem', width: '30%', marginBottom: '0.5rem' }} />
          <Skeleton style={{ height: '0.875rem', width: '50%' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} style={{ height: '100px' }} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <Skeleton style={{ height: '300px' }} />
          <Skeleton style={{ height: '300px' }} />
        </div>
      </>
    );
  }

  if (isError || !data) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <div style={{ color: '#c62828', fontWeight: 600, marginBottom: '0.5rem' }}>Failed to load analytics.</div>
        <Link href={r.customers} style={{ color: '#20A4A4', fontSize: '0.875rem' }}>← Back to Customers</Link>
      </div>
    );
  }

  const atRiskPct = data.totalARR > 0 ? Math.round((data.atRiskARR / data.totalARR) * 100) : 0;

  return (
    <>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>

      {/* ── Breadcrumb ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '1rem', fontSize: '0.8rem', color: '#6C757D' }}>
        <Link href={r.customers} style={{ color: '#20A4A4', textDecoration: 'none' }}>Customers</Link>
        <span style={{ margin: '0 0.4rem' }}>›</span>
        <span style={{ color: '#0a2540' }}>Analytics</span>
      </div>

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#0a2540' }}>Customer 360 Analytics</h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#6C757D' }}>
            Intelligence-driven view of your customer base — CIQ scores, health, churn risk, and ARR-weighted demand.
          </p>
        </div>
        <Link
          href={r.customers}
          style={{ padding: '0.5rem 1rem', border: '1px solid #dee2e6', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#0a2540', textDecoration: 'none', fontWeight: 500, background: '#fff' }}
        >
          ← Customer List
        </Link>
      </div>

      {/* ── KPI Row ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard label="Total Customers" value={data.totalCustomers.toLocaleString()} accent="#0a2540" />
        <StatCard label="Total ARR" value={formatARR(data.totalARR)} accent="#20A4A4" />
        <StatCard label="At-Risk ARR" value={formatARR(data.atRiskARR)} accent="#dc2626" sub={`${atRiskPct}% of total ARR`} />
        <StatCard
          label="Churn Risk: Critical"
          value={data.churnRiskDistribution.critical}
          accent="#7f1d1d"
          sub={`${data.churnRiskDistribution.high} high-risk customers`}
        />
      </div>

      {/* ── Row 2: Segment + Lifecycle ───────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#0a2540' }}>Demand by Segment</h3>
            <span style={{ background: '#e9ecef', color: '#495057', borderRadius: '1rem', padding: '0.1rem 0.5rem', fontSize: '0.75rem', fontWeight: 600 }}>{data.segmentBreakdown.length}</span>
          </div>
          {data.segmentBreakdown.length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: '#adb5bd', fontStyle: 'italic' }}>No segment data available yet.</div>
          ) : (
            <SegmentBreakdown data={data.segmentBreakdown} />
          )}
        </div>

        <div style={CARD}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 700, color: '#0a2540' }}>Lifecycle Distribution</h3>
          {Object.keys(data.lifecycleDistribution).length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: '#adb5bd', fontStyle: 'italic' }}>No lifecycle data available yet.</div>
          ) : (
            <LifecycleDistribution data={data.lifecycleDistribution} />
          )}
        </div>
      </div>

      {/* ── Row 3: Churn Risk + ARR-Weighted Demand ─────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={CARD}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 700, color: '#0a2540' }}>Churn Risk Distribution</h3>
          <ChurnRiskDistribution data={data.churnRiskDistribution} />
        </div>

        <div style={CARD}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 700, color: '#0a2540' }}>ARR-Weighted Feature Demand</h3>
          <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: '#6C757D' }}>
            Customers ranked by (ARR × Feature Demand Score) — highest-value unmet demand at the top.
          </p>
          {data.arrWeightedDemand.length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: '#adb5bd', fontStyle: 'italic' }}>No demand data available yet. Run rescore to populate.</div>
          ) : (
            <ArrWeightedDemand data={data.arrWeightedDemand} />
          )}
        </div>
      </div>

      {/* ── Row 4: Top by CIQ ────────────────────────────────────────────── */}
      <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e9ecef' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#0a2540' }}>Top Customers by CIQ Influence Score</h3>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#6C757D' }}>
            Customers with the highest Customer Intelligence Quotient — most influential voices in your feedback pipeline.
          </p>
        </div>
        {data.topByCIQ.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', fontSize: '0.875rem', color: '#adb5bd', fontStyle: 'italic' }}>
            No CIQ data yet. Add customers and run rescore to populate.
          </div>
        ) : (
          <TopByCIQTable data={data.topByCIQ} orgSlug={orgSlug} />
        )}
      </div>
    </>
  );
}

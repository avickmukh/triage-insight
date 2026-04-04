'use client';
/**
 * CIQ Customer Ranking — /:orgSlug/app/intelligence/customers
 *
 * Shows customers ranked by CIQ influence score (ARR × segment × demand × health).
 */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCiqCustomerRanking } from '@/hooks/use-ciq';
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

function ChurnBadge({ risk }: { risk: number }) {
  const pct = Math.round(risk * 100);
  const color = pct >= 70 ? '#c62828' : pct >= 40 ? '#f57c00' : '#2e7d32';
  const bg = pct >= 70 ? '#fdecea' : pct >= 40 ? '#fff3cd' : '#e8f5e9';
  return (
    <span style={{ padding: '0.2rem 0.5rem', background: bg, color, borderRadius: '0.375rem', fontSize: '0.7rem', fontWeight: 600 }}>
      {pct}%
    </span>
  );
}

export default function IntelligenceCustomersPage() {
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;
  const routes = appRoutes(orgSlug);

  const { data: customers, isLoading, error } = useCiqCustomerRanking(100);

  return (
    <div style={{ padding: '2rem', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0a2540', margin: '0 0 0.25rem' }}>Customer CIQ Ranking</h1>
        <p style={{ color: '#6C757D', margin: 0, fontSize: '0.875rem' }}>
          <strong>CIQ Influence Score = strategic weight.</strong> Customers ranked by ARR weight, feature demand, support intensity, and health score.
        </p>
        <p style={{ fontSize: '0.8rem', color: '#6C757D', margin: '0.3rem 0 0' }}>
          For the full customer profile and feedback history, see{' '}
          <a href="../../customers" style={{ color: '#20A4A4', textDecoration: 'underline', fontWeight: 600 }}>Customers</a>.
        </p>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#6C757D' }}>Loading customer rankings…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#c62828' }}>Failed to load customer rankings.</div>
      ) : !customers || customers.length === 0 ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '4rem', color: '#6C757D' }}>
          No customer ranking data yet.
        </div>
      ) : (
        <div style={CARD}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e9ecef' }}>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', width: 36 }}>#</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 140 }}>CIQ Score</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ARR</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Demand</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Support</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Health</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Churn Risk</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Signals</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Segment</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c, i) => (
                  <tr key={c.customerId} style={{ borderBottom: '1px solid #f0f4f8' }}>
                    <td style={{ padding: '0.875rem 0.5rem', color: '#6C757D', fontWeight: 700, textAlign: 'center' }}>{i + 1}</td>
                    <td style={{ padding: '0.875rem 0.5rem' }}>
                      <Link href={routes.customerItem(c.customerId)}
                        style={{ fontWeight: 600, color: '#0a2540', textDecoration: 'none' }}>
                        {c.name}
                      </Link>
                      {c.companyName && (
                        <div style={{ fontSize: '0.75rem', color: '#6C757D' }}>{c.companyName}</div>
                      )}
                    </td>
                    <td style={{ padding: '0.875rem 0.5rem', minWidth: 140 }}>
                      <ScoreBar score={c.ciqScore} />
                    </td>
                    <td style={{ padding: '0.875rem 0.5rem', textAlign: 'right', color: '#0a2540', fontWeight: 500 }}>
                      {c.arrValue > 0 ? `$${(c.arrValue / 1000).toFixed(0)}k` : '—'}
                    </td>
                    <td style={{ padding: '0.875rem 0.5rem', textAlign: 'right', color: '#0a2540', fontWeight: 500 }}>
                      {Math.round(c.featureDemandScore)}
                    </td>
                    <td style={{ padding: '0.875rem 0.5rem', textAlign: 'right', color: '#0a2540', fontWeight: 500 }}>
                      {Math.round(c.supportIntensityScore)}
                    </td>
                    <td style={{ padding: '0.875rem 0.5rem', textAlign: 'right', color: '#0a2540', fontWeight: 500 }}>
                      {Math.round(c.healthScore)}
                    </td>
                    <td style={{ padding: '0.875rem 0.5rem', textAlign: 'right' }}>
                      <ChurnBadge risk={c.churnRisk} />
                    </td>
                    <td style={{ padding: '0.875rem 0.5rem', textAlign: 'right', color: '#6C757D' }}>
                      {c.feedbackCount}
                    </td>
                    <td style={{ padding: '0.875rem 0.5rem' }}>
                      {c.segment ? (
                        <span style={{ padding: '0.2rem 0.5rem', background: '#f0f4f8', color: '#6C757D', borderRadius: '0.375rem', fontSize: '0.7rem', fontWeight: 600 }}>
                          {c.segment}
                        </span>
                      ) : '—'}
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

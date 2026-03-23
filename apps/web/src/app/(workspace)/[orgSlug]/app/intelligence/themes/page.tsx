'use client';
/**
 * CIQ Theme Ranking — /:orgSlug/app/intelligence/themes
 *
 * Shows all ACTIVE themes ranked by 6-dimension CIQ score, with
 * voice / survey / support signal enrichment columns.
 */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCiqThemeRanking } from '@/hooks/use-ciq';
import { appRoutes } from '@/lib/routes';

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

function ScoreBar({ score, max = 100 }: { score: number; max?: number }) {
  const pct = Math.min(100, (score / max) * 100);
  const color = pct >= 70 ? '#20A4A4' : pct >= 40 ? '#f57c00' : '#c62828';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ flex: 1, height: 6, background: '#e9ecef', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color, minWidth: 28, textAlign: 'right' }}>
        {Math.round(score)}
      </span>
    </div>
  );
}

export default function IntelligenceThemesPage() {
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;
  const routes = appRoutes(orgSlug);

  const { data: themes, isLoading, error } = useCiqThemeRanking(100);

  return (
    <div style={{ padding: '2rem', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <Link href={routes.intelligence} style={{ color: '#20A4A4', textDecoration: 'none', fontSize: '0.875rem' }}>
          ← Intelligence Hub
        </Link>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>Theme CIQ Ranking</h1>
          <p style={{ color: '#6C757D', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
            ACTIVE themes ranked by composite CIQ score — feedback frequency, ARR influence, voice signals, survey demand, and support spikes
          </p>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#6C757D' }}>Loading theme rankings…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#c62828' }}>Failed to load theme rankings.</div>
      ) : !themes || themes.length === 0 ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '4rem', color: '#6C757D' }}>
          No theme ranking data yet. CIQ scores are computed asynchronously as signals accumulate.
        </div>
      ) : (
        <div style={CARD}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e9ecef' }}>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', width: 36 }}>#</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Theme</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 140 }}>CIQ Score</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Signals</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customers</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ARR Influence</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Voice</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Survey</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Support</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: '#6C757D', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {themes.map((theme, i) => (
                  <tr key={theme.themeId} style={{ borderBottom: '1px solid #f0f4f8' }}>
                    <td style={{ padding: '0.875rem 0.5rem', color: '#6C757D', fontWeight: 700, textAlign: 'center' }}>{i + 1}</td>
                    <td style={{ padding: '0.875rem 0.5rem' }}>
                      <Link href={routes.themeItem(theme.themeId)}
                        style={{ fontWeight: 600, color: '#0a2540', textDecoration: 'none' }}>
                        {theme.title}
                      </Link>
                      {theme.lastScoredAt && (
                        <div style={{ fontSize: '0.7rem', color: '#6C757D', marginTop: '0.125rem' }}>
                          Scored {new Date(theme.lastScoredAt).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.875rem 0.5rem', minWidth: 140 }}>
                      <ScoreBar score={theme.ciqScore} />
                    </td>
                    <td style={{ padding: '0.875rem 0.5rem', textAlign: 'right', color: '#0a2540', fontWeight: 500 }}>
                      {theme.feedbackCount}
                    </td>
                    <td style={{ padding: '0.875rem 0.5rem', textAlign: 'right', color: '#0a2540', fontWeight: 500 }}>
                      {theme.uniqueCustomerCount}
                    </td>
                    <td style={{ padding: '0.875rem 0.5rem', textAlign: 'right', color: '#0a2540', fontWeight: 500 }}>
                      ${(theme.revenueInfluence / 1000).toFixed(0)}k
                    </td>
                    <td style={{ padding: '0.875rem 0.5rem', textAlign: 'right' }}>
                      <span style={{ color: theme.voiceSignalScore > 0 ? '#2e7d32' : '#6C757D', fontWeight: 500 }}>
                        {theme.voiceSignalScore.toFixed(1)}
                      </span>
                    </td>
                    <td style={{ padding: '0.875rem 0.5rem', textAlign: 'right' }}>
                      <span style={{ color: theme.surveySignalScore > 0 ? '#f57c00' : '#6C757D', fontWeight: 500 }}>
                        {theme.surveySignalScore.toFixed(1)}
                      </span>
                    </td>
                    <td style={{ padding: '0.875rem 0.5rem', textAlign: 'right' }}>
                      <span style={{ color: theme.supportSignalScore > 0 ? '#c62828' : '#6C757D', fontWeight: 500 }}>
                        {theme.supportSignalScore.toFixed(1)}
                      </span>
                    </td>
                    <td style={{ padding: '0.875rem 0.5rem' }}>
                      <span style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '0.375rem',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        background: theme.status === 'ACTIVE' ? '#e8f7f7' : '#f0f4f8',
                        color: theme.status === 'ACTIVE' ? '#20A4A4' : '#6C757D',
                      }}>
                        {theme.status}
                      </span>
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

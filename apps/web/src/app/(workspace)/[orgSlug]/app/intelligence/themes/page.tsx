'use client';
/**
 * CIQ Theme Ranking — /:orgSlug/app/intelligence/themes
 *
 * Shows all ACTIVE themes ranked by 6-dimension CIQ score, with
 * voice / survey / support signal enrichment columns.
 *
 * UX hardening (Step 1):
 * - Trend indicator derived from score position and signal velocity
 * - Signal hint chips: feedback volume, sentiment intensity, spike indicator
 * - "Why this theme matters" explanation line per row
 */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCiqThemeRanking } from '@/hooks/use-ciq';
import { ThemeRankingItem } from '@/lib/api-types';
import { appRoutes } from '@/lib/routes';

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

// ─── Score bar ────────────────────────────────────────────────────────────────
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

// ─── Trend indicator ─────────────────────────────────────────────────────────
/**
 * Derives a trend from available signals:
 * - Rising  → support spike OR high voice signal OR top-quartile CIQ
 * - Declining → very low feedback count and low CIQ
 * - Stable  → everything else
 */
function trendFromItem(item: ThemeRankingItem, rank: number, total: number): {
  label: 'Rising' | 'Stable' | 'Declining';
  arrow: string;
  color: string;
  bg: string;
} {
  const topQuartile = rank <= Math.ceil(total * 0.25);
  const hasSpike = item.supportSignalScore > 5;
  const hasVoice = item.voiceSignalScore > 3;
  const isLowActivity = item.feedbackCount <= 2 && item.ciqScore < 30;

  if (topQuartile || hasSpike || hasVoice) {
    return { label: 'Rising', arrow: '↑', color: '#2e7d32', bg: '#e8f5e9' };
  }
  if (isLowActivity) {
    return { label: 'Declining', arrow: '↓', color: '#c62828', bg: '#fdecea' };
  }
  return { label: 'Stable', arrow: '→', color: '#6C757D', bg: '#f0f4f8' };
}

// ─── Signal hint chips ────────────────────────────────────────────────────────
function SignalHints({ item }: { item: ThemeRankingItem }) {
  const chips: { label: string; color: string; bg: string }[] = [];

  // Feedback volume hint
  if (item.feedbackCount >= 20) {
    chips.push({ label: `${item.feedbackCount} signals`, color: '#0369a1', bg: '#e0f2fe' });
  } else if (item.feedbackCount >= 5) {
    chips.push({ label: `${item.feedbackCount} signals`, color: '#6C757D', bg: '#f0f4f8' });
  }

  // Support spike
  if (item.supportSignalScore > 5) {
    chips.push({ label: '⚡ Support spike', color: '#b8860b', bg: '#fff8e1' });
  }

  // Voice signal
  if (item.voiceSignalScore > 3) {
    chips.push({ label: '🎙 Voice signal', color: '#7c3aed', bg: '#faf5ff' });
  }

  // Survey demand
  if (item.surveySignalScore > 3) {
    chips.push({ label: '📋 Survey demand', color: '#0369a1', bg: '#e0f2fe' });
  }

  // Revenue influence
  if (item.revenueInfluence >= 50_000) {
    chips.push({ label: `$${(item.revenueInfluence / 1000).toFixed(0)}k ARR`, color: '#2e7d32', bg: '#e8f5e9' });
  }

  if (chips.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
      {chips.map((c) => (
        <span
          key={c.label}
          style={{
            fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.4rem',
            borderRadius: '999px', background: c.bg, color: c.color,
            whiteSpace: 'nowrap',
          }}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}

// ─── Why this theme matters ───────────────────────────────────────────────────
function whyItMatters(item: ThemeRankingItem): string {
  const parts: string[] = [];

  if (item.uniqueCustomerCount >= 5) {
    parts.push(`${item.uniqueCustomerCount} customers are asking for this`);
  } else if (item.uniqueCustomerCount > 0) {
    parts.push(`${item.uniqueCustomerCount} customer${item.uniqueCustomerCount > 1 ? 's' : ''} mentioned this`);
  }

  if (item.revenueInfluence >= 10_000) {
    parts.push(`$${(item.revenueInfluence / 1000).toFixed(0)}k ARR at stake`);
  }

  if (item.supportSignalScore > 5) {
    parts.push('support tickets are spiking');
  }

  if (item.voiceSignalScore > 3) {
    parts.push('customers are raising this on calls');
  }

  if (item.surveySignalScore > 3) {
    parts.push('validated by survey responses');
  }

  if (parts.length === 0) {
    if (item.feedbackCount > 0) {
      return `${item.feedbackCount} signal${item.feedbackCount > 1 ? 's' : ''} collected — needs more data to fully rank.`;
    }
    return 'No signals yet — add feedback to start ranking.'
  }

  return parts.join(' · ') + '.';
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function IntelligenceThemesPage() {
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;
  const routes = appRoutes(orgSlug);

  const { data: themes, isLoading, error } = useCiqThemeRanking(100);

  return (
    <div style={{ padding: '2rem', maxWidth: 1400, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <Link href={routes.intelligence} style={{ color: '#20A4A4', textDecoration: 'none', fontSize: '0.875rem' }}>
          ← Intelligence Hub
        </Link>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>Theme CIQ Ranking</h1>
          <p style={{ color: '#6C757D', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
            All non-archived themes ranked by composite CIQ score — feedback frequency, ARR influence, voice signals, survey demand, and support spikes.
            Trend indicators show momentum based on signal velocity.
          </p>
        </div>
      </div>

      {/* ── Loading ── */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#6C757D' }}>Loading theme rankings…</div>

      ) : error ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#c62828' }}>Failed to load theme rankings.</div>

      ) : !themes || themes.length === 0 ? (
        /* ── Empty state ── */
        <div style={{ ...CARD, textAlign: 'center', padding: '3.5rem 2rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📊</div>
          <p style={{ fontWeight: 700, color: '#0a2540', fontSize: '1.05rem', margin: '0 0 0.5rem' }}>No theme rankings yet</p>
          <p style={{ color: '#6C757D', fontSize: '0.875rem', maxWidth: '440px', margin: '0 auto 0.5rem', lineHeight: 1.6 }}>
            CIQ scores are calculated automatically once themes have linked feedback.
          </p>
          <p style={{ color: '#6C757D', fontSize: '0.825rem', maxWidth: '440px', margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
            <strong>How it works:</strong> Add feedback → AI clusters it into themes → CIQ scoring runs automatically → rankings appear here within minutes.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              href={routes.inboxNew}
              style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', background: '#0a2540', color: '#fff', fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none' }}
            >
              Add feedback
            </Link>
            <Link
              href={routes.themes}
              style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #ced4da', background: '#fff', color: '#495057', fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none' }}
            >
              View themes
            </Link>
          </div>
        </div>

      ) : (
        /* ── Rankings table ── */
        <div style={CARD}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e9ecef' }}>
                  <th style={TH}>#</th>
                  <th style={{ ...TH, textAlign: 'left' }}>Theme</th>
                  <th style={{ ...TH, textAlign: 'left', minWidth: 140 }}>CIQ Score</th>
                  <th style={{ ...TH, textAlign: 'center' }}>Trend</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Signals</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Customers</th>
                  <th style={{ ...TH, textAlign: 'right' }}>ARR Influence</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Voice</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Survey</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Support</th>
                  <th style={{ ...TH, textAlign: 'left' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {themes.map((theme, i) => {
                  const trend = trendFromItem(theme, i + 1, themes.length);
                  const why = whyItMatters(theme);
                  return (
                    <tr key={theme.themeId} style={{ borderBottom: '1px solid #f0f4f8' }}>
                      {/* Rank */}
                      <td style={{ padding: '0.875rem 0.5rem', color: '#6C757D', fontWeight: 700, textAlign: 'center' }}>
                        {i + 1}
                      </td>

                      {/* Theme name + why it matters + signal hints */}
                      <td style={{ padding: '0.875rem 0.5rem' }}>
                        <Link
                          href={routes.themeItem(theme.themeId)}
                          style={{ fontWeight: 600, color: '#0a2540', textDecoration: 'none' }}
                        >
                          {theme.title}
                        </Link>
                        {/* Why this theme matters */}
                        <p style={{
                          fontSize: '0.72rem', color: '#6C757D', margin: '0.15rem 0 0',
                          lineHeight: 1.4, maxWidth: '340px',
                        }}>
                          {why}
                        </p>
                        {/* Signal hint chips */}
                        <SignalHints item={theme} />
                        {/* Scored date */}
                        {theme.lastScoredAt && (
                          <div style={{ fontSize: '0.65rem', color: '#adb5bd', marginTop: '0.2rem' }}>
                            Scored {new Date(theme.lastScoredAt).toLocaleDateString()}
                          </div>
                        )}
                      </td>

                      {/* CIQ score bar */}
                      <td style={{ padding: '0.875rem 0.5rem', minWidth: 140 }}>
                        <ScoreBar score={theme.ciqScore} />
                      </td>

                      {/* Trend badge */}
                      <td style={{ padding: '0.875rem 0.5rem', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                          fontSize: '0.7rem', fontWeight: 700,
                          padding: '0.2rem 0.55rem', borderRadius: '999px',
                          background: trend.bg, color: trend.color,
                          whiteSpace: 'nowrap',
                        }}>
                          {trend.arrow} {trend.label}
                        </span>
                      </td>

                      {/* Numeric columns */}
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

                      {/* Status badge */}
                      <td style={{ padding: '0.875rem 0.5rem' }}>
                        <span style={{
                          padding: '0.2rem 0.5rem', borderRadius: '0.375rem',
                          fontSize: '0.7rem', fontWeight: 600,
                          background: theme.status === 'VERIFIED' ? '#e8f5e9' : theme.status === 'AI_GENERATED' ? '#e8f7f7' : '#f0f4f8',
                          color: theme.status === 'VERIFIED' ? '#2e7d32' : theme.status === 'AI_GENERATED' ? '#20A4A4' : '#6C757D',
                        }}>
                          {theme.status === 'AI_GENERATED' ? 'AI Generated' : theme.status === 'VERIFIED' ? 'Verified' : theme.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div style={{
            marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #f0f4f8',
            display: 'flex', gap: '1.5rem', flexWrap: 'wrap',
          }}>
            <p style={{ fontSize: '0.72rem', color: '#6C757D', margin: 0, fontWeight: 600 }}>Trend key:</p>
            {[
              { arrow: '↑', label: 'Rising', color: '#2e7d32', bg: '#e8f5e9' },
              { arrow: '→', label: 'Stable', color: '#6C757D', bg: '#f0f4f8' },
              { arrow: '↓', label: 'Declining', color: '#c62828', bg: '#fdecea' },
            ].map((t) => (
              <span key={t.label} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: '#6C757D' }}>
                <span style={{ padding: '0.1rem 0.4rem', borderRadius: '999px', background: t.bg, color: t.color, fontWeight: 700, fontSize: '0.65rem' }}>
                  {t.arrow} {t.label}
                </span>
                {t.label === 'Rising' && '— top quartile, support spike, or voice signal'}
                {t.label === 'Stable' && '— consistent signal level'}
                {t.label === 'Declining' && '— low activity and low score'}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const TH: React.CSSProperties = {
  padding: '0.75rem 0.5rem',
  textAlign: 'left',
  color: '#6C757D',
  fontWeight: 600,
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

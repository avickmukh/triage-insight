'use client';
/**
 * CIQ Intelligence Hub — /:orgSlug/app/intelligence
 *
 * Strategic overview combining:
 *   - Roadmap recommendations from strategic signals
 *   - Top themes by CIQ score
 *   - Voice / survey / support signal summaries
 *   - Signal feed (recent strategic events)
 */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCiqStrategicSignals, useCiqThemeRanking } from '@/hooks/use-ciq';
import { appRoutes } from '@/lib/routes';

// ─── Design tokens ────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const RECOMMENDATION_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  promote_to_planned:    { bg: '#e8f7f7', color: '#20A4A4', label: 'Promote to Planned' },
  promote_to_committed:  { bg: '#fff3cd', color: '#b8860b', label: 'Promote to Committed' },
  already_committed:     { bg: '#e8f5e9', color: '#2e7d32', label: 'Already Committed' },
  monitor:               { bg: '#f0f4f8', color: '#6C757D', label: 'Monitor' },
};

const SIGNAL_COLORS: Record<string, { bg: string; color: string }> = {
  theme:    { bg: '#e8f7f7', color: '#20A4A4' },
  feedback: { bg: '#e8f0fe', color: '#1a73e8' },
  deal:     { bg: '#fff3cd', color: '#b8860b' },
  customer: { bg: '#fce8ff', color: '#7c3aed' },
  voice:    { bg: '#e8f5e9', color: '#2e7d32' },
  survey:   { bg: '#fff8e1', color: '#f57c00' },
  support:  { bg: '#fdecea', color: '#c62828' },
};

function CiqScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 70 ? '#20A4A4' : pct >= 40 ? '#f57c00' : '#c62828';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ flex: 1, height: 6, background: '#e9ecef', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color, minWidth: 28, textAlign: 'right' }}>{Math.round(pct)}</span>
    </div>
  );
}

export default function IntelligencePage() {
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;
  const routes = appRoutes(orgSlug);

  const { data: signals, isLoading: signalsLoading } = useCiqStrategicSignals();
  const { data: themeRanking, isLoading: themesLoading } = useCiqThemeRanking(10);

  const isLoading = signalsLoading || themesLoading;

  return (
    <div style={{ padding: '2rem', maxWidth: 1400, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>
            CIQ Intelligence Hub
          </h1>
          <p style={{ color: '#6C757D', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
            Strategic signals, roadmap recommendations, and cross-channel demand intelligence
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href={routes.intelligenceThemes}
            style={{ padding: '0.5rem 1rem', background: '#f0f4f8', color: '#0a2540', borderRadius: '0.5rem', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500 }}>
            Theme Ranking
          </Link>
          <Link href={routes.intelligenceFeatures}
            style={{ padding: '0.5rem 1rem', background: '#f0f4f8', color: '#0a2540', borderRadius: '0.5rem', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500 }}>
            Feature Ranking
          </Link>
          <Link href={routes.intelligenceCustomers}
            style={{ padding: '0.5rem 1rem', background: '#f0f4f8', color: '#0a2540', borderRadius: '0.5rem', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500 }}>
            Customer Ranking
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#6C757D' }}>Loading intelligence data…</div>
      ) : (
        <div style={{ display: 'grid', gap: '1.5rem' }}>

          {/* ── Signal Summary Row ── */}
          {signals && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              {/* Voice */}
              <div style={{ ...CARD, borderLeft: '4px solid #2e7d32' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Voice Signals</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0a2540' }}>
                  {signals.voiceSentimentSummary.urgentCount + signals.voiceSentimentSummary.complaintCount}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6C757D', marginTop: '0.25rem' }}>
                  {signals.voiceSentimentSummary.urgentCount} urgent · {signals.voiceSentimentSummary.complaintCount} complaints
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6C757D' }}>
                  Avg sentiment: {(signals.voiceSentimentSummary.avgSentiment * 100).toFixed(0)}%
                </div>
              </div>

              {/* Survey */}
              <div style={{ ...CARD, borderLeft: '4px solid #f57c00' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Survey Demand</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0a2540' }}>
                  {signals.surveyDemandSummary.validationCount}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6C757D', marginTop: '0.25rem' }}>
                  {signals.surveyDemandSummary.featureValidationCount} feature validations
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6C757D' }}>
                  Avg CIQ weight: {(signals.surveyDemandSummary.avgCiqWeight * 100).toFixed(0)}%
                </div>
              </div>

              {/* Support */}
              <div style={{ ...CARD, borderLeft: '4px solid #c62828' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Support Spikes</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0a2540' }}>
                  {signals.supportSpikeSummary.spikeCount}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6C757D', marginTop: '0.25rem' }}>
                  {signals.supportSpikeSummary.negativeSentimentCount} negative sentiment
                </div>
              </div>

              {/* Roadmap Recommendations */}
              <div style={{ ...CARD, borderLeft: '4px solid #20A4A4' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Roadmap Actions</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0a2540' }}>
                  {signals.roadmapRecommendations.filter(r => r.recommendation !== 'monitor').length}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6C757D', marginTop: '0.25rem' }}>
                  items ready for promotion
                </div>
              </div>
            </div>
          )}

          {/* ── Main Content: Roadmap Recommendations + Top Themes ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

            {/* Roadmap Recommendations */}
            <div style={CARD}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', margin: '0 0 1rem' }}>
                Roadmap Recommendations
              </h2>
              {signals?.roadmapRecommendations && signals.roadmapRecommendations.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {signals.roadmapRecommendations.slice(0, 8).map((rec) => {
                    const style = RECOMMENDATION_COLORS[rec.recommendation] ?? RECOMMENDATION_COLORS.monitor;
                    return (
                      <div key={rec.themeId} style={{ padding: '0.875rem', background: '#f8f9fa', borderRadius: '0.5rem', borderLeft: `3px solid ${style.color}` }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.375rem' }}>
                          <Link href={routes.themeItem(rec.themeId)}
                            style={{ fontWeight: 600, color: '#0a2540', textDecoration: 'none', fontSize: '0.875rem', flex: 1 }}>
                            {rec.title}
                          </Link>
                          <span style={{ padding: '0.2rem 0.5rem', background: style.bg, color: style.color, borderRadius: '0.375rem', fontSize: '0.7rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {style.label}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6C757D', marginBottom: '0.375rem' }}>{rec.rationale}</div>
                        <CiqScoreBar score={rec.ciqScore} />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#6C757D', fontSize: '0.875rem' }}>
                  No recommendations available yet. CIQ scoring will generate recommendations as signals accumulate.
                </div>
              )}
            </div>

            {/* Top Themes by CIQ */}
            <div style={CARD}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>
                  Top Themes by CIQ
                </h2>
                <Link href={routes.intelligenceThemes}
                  style={{ fontSize: '0.8rem', color: '#20A4A4', textDecoration: 'none', fontWeight: 500 }}>
                  View all →
                </Link>
              </div>
              {themeRanking && themeRanking.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {themeRanking.slice(0, 8).map((theme, i) => (
                    <div key={theme.themeId} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ width: 20, fontSize: '0.75rem', fontWeight: 700, color: '#6C757D', textAlign: 'right', flexShrink: 0 }}>
                        {i + 1}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <Link href={routes.themeItem(theme.themeId)}
                            style={{ fontWeight: 600, color: '#0a2540', textDecoration: 'none', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {theme.title}
                          </Link>
                          <span style={{ fontSize: '0.75rem', color: '#6C757D', marginLeft: '0.5rem', flexShrink: 0 }}>
                            {theme.feedbackCount} signals
                          </span>
                        </div>
                        <CiqScoreBar score={theme.ciqScore} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#6C757D', fontSize: '0.875rem' }}>
                  No theme ranking data yet.
                </div>
              )}
            </div>
          </div>

          {/* ── Signal Feed ── */}
          {signals && signals.signals.length > 0 && (
            <div style={CARD}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', margin: '0 0 1rem' }}>
                Strategic Signal Feed
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.75rem' }}>
                {signals.signals.slice(0, 12).map((sig, i) => {
                  const sc = SIGNAL_COLORS[sig.type] ?? { bg: '#f0f4f8', color: '#6C757D' };
                  return (
                    <div key={i} style={{ padding: '0.875rem', background: '#f8f9fa', borderRadius: '0.5rem', borderLeft: `3px solid ${sc.color}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                        <span style={{ padding: '0.15rem 0.4rem', background: sc.bg, color: sc.color, borderRadius: '0.25rem', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>
                          {sig.type}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0a2540', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sig.entityTitle}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#6C757D', flexShrink: 0 }}>
                          str: {(sig.strength * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0a2540', marginBottom: '0.25rem' }}>{sig.signal}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6C757D' }}>{sig.detail}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

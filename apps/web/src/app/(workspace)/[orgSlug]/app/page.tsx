'use client';
/**
 * Home Dashboard — /:orgSlug/app
 *
 * A simple, founder-friendly overview of what is happening across your product.
 * No jargon. No metric clutter. Just the things you need to act on today.
 *
 * Sections:
 *   1. Today's Summary         — one plain-English sentence about what matters most
 *   2. Quick Actions           — 4 large buttons to the two power features
 *   3. Charts Row              — Roadmap Status donut + Top Features bar + Sentiment gauge
 *   4. What customers are asking about  (Emerging Themes)
 *   5. Customers at risk                (Revenue Risk)
 *   6. Support pressure                 (Support Pressure)
 *   7. Roadmap health                   (Roadmap Health)
 *   8. Voice & survey sentiment         (Voice Sentiment)
 */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useExecutiveDashboard, useDashboardRefresh } from '@/hooks/use-dashboard';
import { appRoutes, orgAdminRoutes } from '@/lib/routes';
import { useWorkspace } from '@/hooks/use-workspace';
import { useFeedbackCount } from '@/hooks/use-feedback';
import { useThemeCount } from '@/hooks/use-themes';
import { useOnboarding } from '@/components/onboarding/use-onboarding';
import { OnboardingChecklist } from '@/components/onboarding/OnboardingChecklist';
import { AiProcessingBanner } from '@/components/onboarding/AiProcessingBanner';
import { AIPipelineProgress } from '@/components/pipeline/AIPipelineProgress';
import { FirstInsightHighlight } from '@/components/onboarding/FirstInsightHighlight';
import { TeamInvitePrompt, DigestExpectationBanner, PortalActivationPrompt } from '@/components/onboarding/OnboardingPrompts';
import {
  ProductDirectionSummary,
  EmergingThemeRadar,
  RevenueRiskIndicator,
  VoiceSentimentSignal,
  SupportPressureIndicator,
  SupportPressureCluster,
  RoadmapHealthPanel,
  ExecutiveSummary,
} from '@/lib/api-types';

// ─── Design tokens ────────────────────────────────────────────────────────────
const NAVY   = '#0A2540';
const TEAL   = '#20A4A4';
const TEAL_L = '#e8f7f7';
const AMBER  = '#b8860b';
const AMBER_L= '#fff8e1';
const RED    = '#e63946';
const RED_L  = '#fdecea';
const GREEN  = '#2e7d32';
const GREEN_L= '#e8f5e9';
const GRAY   = '#6C757D';
const BORDER = '#e9ecef';
const PURPLE = '#7c3aed';
const BLUE   = '#0369a1';

const CARD: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${BORDER}`,
  borderRadius: '0.875rem',
  padding: '1.25rem 1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const cardAccent = (color: string): React.CSSProperties => ({
  ...CARD,
  borderLeft: `3px solid ${color}`,
});

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ h = '1rem', w = '100%' }: { h?: string; w?: string }) {
  return (
    <div style={{
      height: h, width: w, borderRadius: '0.4rem',
      background: 'linear-gradient(90deg, #f0f4f8 25%, #e2e8f0 50%, #f0f4f8 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
    }} />
  );
}

function CardSkeleton() {
  return (
    <div style={CARD}>
      <Skeleton h="0.8rem" w="40%" />
      <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <Skeleton h="1.4rem" w="70%" />
        <Skeleton h="0.75rem" w="90%" />
        <Skeleton h="0.75rem" w="80%" />
      </div>
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{
      fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.6rem',
      borderRadius: '999px', background: bg, color, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({
  label, href, accent = TEAL,
}: { label: string; href?: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ width: '3px', height: '1rem', background: accent, borderRadius: '2px' }} />
        <h2 style={{ fontSize: '0.82rem', fontWeight: 700, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
          {label}
        </h2>
      </div>
      {href && (
        <Link href={href} style={{ fontSize: '0.8rem', color: TEAL, textDecoration: 'none', fontWeight: 600 }}>
          View all →
        </Link>
      )}
    </div>
  );
}

// ─── 1. Today's Summary ───────────────────────────────────────────────────────
function TodaySummaryCard({ summary }: { summary: ExecutiveSummary | undefined }) {
  if (!summary) return null;
  return (
    <div style={{ ...CARD, borderLeft: `3px solid ${TEAL}`, background: TEAL_L }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', flex: 1 }}>
          <div style={{ fontSize: '1.25rem', flexShrink: 0 }}>📋</div>
          <div>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, color: TEAL, margin: '0 0 0.2rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>This week&apos;s summary</p>
            <p style={{ fontSize: '0.95rem', fontWeight: 600, color: NAVY, margin: 0, lineHeight: 1.5 }}>
              {summary.weekSummary}
            </p>
          </div>
        </div>
        {summary.generatedAt && (
          <p style={{ fontSize: '0.7rem', color: GRAY, margin: 0, flexShrink: 0, alignSelf: 'flex-start', paddingTop: '0.1rem' }}>
            {new Date(summary.generatedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </p>
        )}
      </div>

      {/* Key insights row */}
      {summary.keyInsights?.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.5rem', marginBottom: '0.875rem' }}>
          {summary.keyInsights.slice(0, 3).map((insight: string, i: number) => (
            <div key={i} style={{ background: '#fff', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', border: `1px solid ${TEAL}22`, display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
              <span style={{ color: TEAL, fontWeight: 700, fontSize: '0.8rem', flexShrink: 0, marginTop: '0.05rem' }}>→</span>
              <p style={{ fontSize: '0.82rem', color: '#374151', margin: 0, lineHeight: 1.5 }}>{insight}</p>
            </div>
          ))}
        </div>
      )}

      {/* Bottom row: risk alert + momentum + top action */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'stretch' }}>
        {summary.riskAlert && (
          <div style={{ flex: 1, minWidth: '200px', background: '#fff5f5', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.5rem 0.75rem' }}>
            <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#e63946', margin: '0 0 0.15rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Risk alert</p>
            <p style={{ fontSize: '0.82rem', color: '#7f1d1d', margin: 0, lineHeight: 1.4 }}>{summary.riskAlert}</p>
          </div>
        )}
        {summary.momentumSignal && (
          <div style={{ flex: 1, minWidth: '200px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.5rem', padding: '0.5rem 0.75rem' }}>
            <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#2e7d32', margin: '0 0 0.15rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Momentum</p>
            <p style={{ fontSize: '0.82rem', color: '#14532d', margin: 0, lineHeight: 1.4 }}>{summary.momentumSignal}</p>
          </div>
        )}
        {summary.topAction && (
          <div style={{ flex: 2, minWidth: '240px', background: '#fff', border: `1px solid ${TEAL}33`, borderRadius: '0.5rem', padding: '0.5rem 0.875rem' }}>
            <p style={{ fontSize: '0.68rem', fontWeight: 700, color: TEAL, margin: '0 0 0.15rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Suggested next step</p>
            <p style={{ fontSize: '0.875rem', color: NAVY, margin: 0, lineHeight: 1.4 }}>{summary.topAction}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 2. Quick Actions ─────────────────────────────────────────────────────────
function QuickActions({ r }: { r: ReturnType<typeof appRoutes> }) {
  const actions = [
    {
      href: r.intelligence,
      emoji: '🧠',
      label: 'Intelligence Hub',
      desc: 'See what your customers really want — ranked by revenue impact',
      accent: TEAL,
      bg: TEAL_L,
    },
    {
      href: r.prioritization,
      emoji: '🎯',
      label: 'Prioritization Engine',
      desc: 'Score every feature request and decide what to build next',
      accent: PURPLE,
      bg: '#faf5ff',
    },
    {
      href: r.intelligenceFeatures,
      emoji: '📊',
      label: 'Feature Ranking',
      desc: 'All feature requests ranked by customer demand and revenue',
      accent: BLUE,
      bg: '#f0f9ff',
    },
    {
      href: r.prioritizationOpportunities,
      emoji: '💡',
      label: 'Revenue Opportunities',
      desc: 'High-value features not yet on your roadmap',
      accent: AMBER,
      bg: AMBER_L,
    },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.875rem' }}>
      {actions.map((a) => (
        <Link key={a.href} href={a.href} style={{
          ...CARD, textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem',
          borderLeft: `3px solid ${a.accent}`, background: a.bg, transition: 'box-shadow 0.15s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.1rem' }}>{a.emoji}</span>
            <p style={{ fontSize: '0.875rem', fontWeight: 700, color: NAVY, margin: 0 }}>{a.label}</p>
          </div>
          <p style={{ fontSize: '0.78rem', color: GRAY, margin: 0, lineHeight: 1.5 }}>{a.desc}</p>
        </Link>
      ))}
    </div>
  );
}

// ─── 3a. Roadmap Status Donut Chart ──────────────────────────────────────────
function RoadmapDonutChart({ roadmap, href }: { roadmap: RoadmapHealthPanel; href: string }) {
  const segments = [
    { label: 'Shipped',     count: roadmap.shippedCount,   color: GREEN },
    { label: 'In Progress', count: roadmap.committedCount, color: TEAL },
    { label: 'Planned',     count: roadmap.plannedCount,   color: BLUE },
    { label: 'Backlog',     count: roadmap.backlogCount,   color: '#adb5bd' },
  ];
  const total = segments.reduce((s, x) => s + x.count, 0);

  // Build SVG donut arcs
  const cx = 60; const cy = 60; const r = 44; const innerR = 28;
  const circumference = 2 * Math.PI * r;

  let cumulativeAngle = -Math.PI / 2; // start at top
  const arcs = total === 0 ? [] : segments.map((seg) => {
    const fraction = seg.count / total;
    const startAngle = cumulativeAngle;
    const sweepAngle = fraction * 2 * Math.PI;
    cumulativeAngle += sweepAngle;
    const endAngle = cumulativeAngle;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(endAngle);
    const iy1 = cy + innerR * Math.sin(endAngle);
    const ix2 = cx + innerR * Math.cos(startAngle);
    const iy2 = cy + innerR * Math.sin(startAngle);
    const largeArc = sweepAngle > Math.PI ? 1 : 0;

    if (fraction === 0) return null;
    const d = [
      `M ${x1} ${y1}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${ix1} ${iy1}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2}`,
      'Z',
    ].join(' ');
    return { d, color: seg.color, label: seg.label, count: seg.count };
  }).filter(Boolean);

  const healthColor = roadmap.healthScore >= 70 ? GREEN : roadmap.healthScore >= 40 ? AMBER : RED;

  return (
    <div style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
      <SectionHeader label="Roadmap Status" href={href} accent={healthColor} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <svg width="120" height="120" viewBox="0 0 120 120">
            {total === 0 ? (
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={BORDER} strokeWidth={r - innerR} />
            ) : (
              arcs.map((arc, i) => arc && (
                <path key={i} d={arc.d} fill={arc.color} />
              ))
            )}
            {/* Inner label */}
            <text x={cx} y={cy - 4} textAnchor="middle" fontSize="14" fontWeight="700" fill={healthColor}>{roadmap.healthScore}</text>
            <text x={cx} y={cy + 10} textAnchor="middle" fontSize="8" fill={GRAY}>/ 100</text>
          </svg>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: 120 }}>
          {segments.map((s) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                <span style={{ fontSize: '0.78rem', color: GRAY }}>{s.label}</span>
              </div>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: NAVY }}>{s.count}</span>
            </div>
          ))}
          <div style={{ marginTop: '0.25rem', paddingTop: '0.5rem', borderTop: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: '0.75rem', color: GRAY }}>Total items: </span>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: NAVY }}>{total}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 3b. Top Feature Requests Bar Chart ──────────────────────────────────────
function TopFeaturesChart({ direction, href }: { direction: ProductDirectionSummary; href: string }) {
  const features = direction.topFeatures.slice(0, 5);
  const maxScore = features.length > 0 ? Math.max(...features.map((f) => f.ciqScore)) : 100;

  return (
    <div style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
      <SectionHeader label="Top Feature Requests" href={href} accent={BLUE} />
      {features.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: GRAY, margin: 0 }}>No scored features yet. Add customer feedback to see rankings.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {features.map((f, i) => {
            const pct = maxScore > 0 ? (f.ciqScore / maxScore) * 100 : 0;
            const barColor = pct >= 70 ? TEAL : pct >= 40 ? BLUE : GRAY;
            return (
              <div key={f.feedbackId}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: GRAY, minWidth: 16 }}>#{i + 1}</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.title}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: barColor, flexShrink: 0, marginLeft: '0.5rem' }}>
                    {Math.round(f.ciqScore)}
                  </span>
                </div>
                <div style={{ height: 6, background: BORDER, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`, background: barColor,
                    borderRadius: 3, transition: 'width 0.6s ease',
                  }} />
                </div>
                {f.themeTitle && (
                  <span style={{ fontSize: '0.68rem', color: GRAY }}>{f.themeTitle}</span>
                )}
              </div>
            );
          })}
          <p style={{ fontSize: '0.72rem', color: GRAY, margin: '0.25rem 0 0' }}>
            {direction.scoredFeedbackCount} of {direction.totalFeedbackCount} items scored
          </p>
        </div>
      )}
    </div>
  );
}

// ─── 3c. Sentiment Gauge ─────────────────────────────────────────────────────
function SentimentGauge({ sentiment, href }: { sentiment: VoiceSentimentSignal; href: string }) {
  const score = sentiment.overallSentimentScore;
  const sentColor = score >= 70 ? GREEN : score >= 40 ? AMBER : RED;
  const trendLabel = sentiment.sentimentTrend === 'improving' ? '↑ Improving'
    : sentiment.sentimentTrend === 'declining' ? '↓ Declining' : '→ Stable';
  const trendColor = sentiment.sentimentTrend === 'improving' ? GREEN
    : sentiment.sentimentTrend === 'declining' ? RED : GRAY;

  // Arc gauge: semicircle from 180° to 0° (left to right)
  const cx = 80; const cy = 80; const radius = 60;
  const startAngle = Math.PI; // 180°
  const endAngle = 0;         // 0°
  const scoreAngle = Math.PI - (score / 100) * Math.PI; // maps 0→180°, 100→0°

  const arcX = (angle: number) => cx + radius * Math.cos(angle);
  const arcY = (angle: number) => cy + radius * Math.sin(angle);

  // Background arc (full semicircle)
  const bgD = `M ${arcX(startAngle)} ${arcY(startAngle)} A ${radius} ${radius} 0 0 1 ${arcX(endAngle)} ${arcY(endAngle)}`;
  // Filled arc (up to score)
  const fillD = score > 0
    ? `M ${arcX(startAngle)} ${arcY(startAngle)} A ${radius} ${radius} 0 ${score > 50 ? 1 : 0} 1 ${arcX(scoreAngle)} ${arcY(scoreAngle)}`
    : '';

  // Needle
  const needleX = cx + (radius - 10) * Math.cos(scoreAngle);
  const needleY = cy + (radius - 10) * Math.sin(scoreAngle);

  // Theme breakdown bars
  const themeData = sentiment.sentimentByTheme?.slice(0, 4) ?? [];

  return (
    <div style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
      <SectionHeader label="Customer Sentiment" href={href} accent={sentColor} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.25rem', flexWrap: 'wrap' }}>
        {/* Gauge */}
        <div style={{ flexShrink: 0 }}>
          <svg width="160" height="95" viewBox="0 0 160 95">
            {/* Background track */}
            <path d={bgD} fill="none" stroke={BORDER} strokeWidth="12" strokeLinecap="round" />
            {/* Colored fill */}
            {fillD && <path d={fillD} fill="none" stroke={sentColor} strokeWidth="12" strokeLinecap="round" />}
            {/* Needle dot */}
            <circle cx={needleX} cy={needleY} r="5" fill={sentColor} />
            <circle cx={cx} cy={cy} r="4" fill={NAVY} />
            {/* Score label */}
            <text x={cx} y={cy - 8} textAnchor="middle" fontSize="20" fontWeight="800" fill={sentColor}>{score}</text>
            <text x={cx} y={cy + 6} textAnchor="middle" fontSize="9" fill={GRAY}>/ 100</text>
            {/* Min/Max labels */}
            <text x="8" y="88" fontSize="9" fill={GRAY}>0</text>
            <text x="144" y="88" fontSize="9" fill={GRAY}>100</text>
          </svg>
          <div style={{ textAlign: 'center', marginTop: '-0.25rem' }}>
            <Badge label={trendLabel} bg={trendColor + '18'} color={trendColor} />
          </div>
        </div>

        {/* Theme breakdown */}
        <div style={{ flex: 1, minWidth: 120 }}>
          {themeData.length > 0 ? (
            <>
              <p style={{ fontSize: '0.72rem', fontWeight: 700, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem' }}>
                By theme
              </p>
              {themeData.map((t) => {
                const tc = t.avgSentiment >= 70 ? GREEN : t.avgSentiment >= 40 ? AMBER : RED;
                return (
                  <div key={t.themeId} style={{ marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                      <span style={{ fontSize: '0.75rem', color: NAVY, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>{t.title}</span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: tc }}>{Math.round(t.avgSentiment)}</span>
                    </div>
                    <div style={{ height: 4, background: BORDER, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${t.avgSentiment}%`, background: tc, borderRadius: 2 }} />
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <p style={{ fontSize: '0.875rem', color: score >= 70 ? GREEN : score >= 40 ? AMBER : RED, margin: 0, fontWeight: 600 }}>
                {score >= 70 ? '✓ Customers are happy' : score >= 40 ? '⚠ Mixed signals' : '✗ Needs attention'}
              </p>
              <p style={{ fontSize: '0.8rem', color: GRAY, margin: 0 }}>
                {sentiment.voiceCallCount} voice recordings analysed
              </p>
              {sentiment.unresolvedPainSummary && (
                <p style={{ fontSize: '0.78rem', color: NAVY, margin: 0, lineHeight: 1.5 }}>
                  {sentiment.unresolvedPainSummary}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 4. What customers are asking about ──────────────────────────────────────
function ThemesCard({ data, href }: { data: EmergingThemeRadar; href: string }) {
  return (
    <div style={cardAccent(PURPLE)}>
      <SectionHeader label="What customers are asking about" href={href} accent={PURPLE} />
      {/* ── Urgency: support spike alert ── */}
      {data.spikeEvents.length > 0 && (
        <div style={{ background: AMBER_L, border: `1px solid ${AMBER}55`, borderRadius: '0.6rem', padding: '0.6rem 0.875rem', marginBottom: '0.875rem' }}>
          <p style={{ fontSize: '0.78rem', fontWeight: 700, color: AMBER, margin: '0 0 0.2rem' }}>
            ⚡ {data.spikeEvents.length} sudden spike{data.spikeEvents.length > 1 ? 's' : ''} in support tickets — action needed
          </p>
          <p style={{ fontSize: '0.8rem', color: NAVY, margin: 0 }}>
            <strong>{data.spikeEvents[0].clusterTitle}</strong> — {data.spikeEvents[0].ticketCount} tickets this week
          </p>
        </div>
      )}
      {/* ── Growth callout: fastest-growing theme ── */}
      {(() => {
        const fastest = data.emergingThemes.length > 0
          ? [...data.emergingThemes].sort((a, b) => b.feedbackDelta7d - a.feedbackDelta7d)[0]
          : null;
        return fastest && fastest.feedbackDelta7d >= 3 ? (
          <div style={{ background: '#faf5ff', border: `1px solid ${PURPLE}33`, borderRadius: '0.6rem', padding: '0.5rem 0.875rem', marginBottom: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: PURPLE }}>🚀 Fastest growing:</span>
            <span style={{ fontSize: '0.8rem', color: NAVY, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fastest.title}
            </span>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: PURPLE, flexShrink: 0 }}>+{fastest.feedbackDelta7d} this week</span>
          </div>
        ) : null;
      })()}
      {data.emergingThemes.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: GRAY }}>No new themes this week. Add more feedback to detect patterns.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {data.emergingThemes.slice(0, 4).map((t, idx) => {
            const isUrgent = data.spikeEvents.some((s) => s.clusterTitle === t.title);
            const fastestId = data.emergingThemes.length > 0
              ? [...data.emergingThemes].sort((a, b) => b.feedbackDelta7d - a.feedbackDelta7d)[0].themeId
              : null;
            const isTopGrowing = t.themeId === fastestId && t.feedbackDelta7d >= 3;
            return (
              <div
                key={t.themeId}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem',
                  padding: isUrgent ? '0.4rem 0.6rem' : '0',
                  background: isUrgent ? AMBER_L : 'transparent',
                  borderRadius: isUrgent ? '0.4rem' : 0,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.15rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#adb5bd', minWidth: '1.1rem' }}>#{idx + 1}</span>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, color: NAVY, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.title}
                    </p>
                    {t.isNew && <Badge label="New" bg="#fce8ff" color={PURPLE} />}
                    {isUrgent && <Badge label="⚡ Urgent" bg={AMBER_L} color={AMBER} />}
                    {isTopGrowing && !isUrgent && <Badge label="🚀 Growing" bg="#faf5ff" color={PURPLE} />}
                  </div>
                  <p style={{ fontSize: '0.78rem', color: GRAY, margin: 0 }}>{t.signal}</p>
                  {t.aiSummary && (
                    <p style={{ fontSize: '0.73rem', color: PURPLE, margin: '0.15rem 0 0', fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      ✨ {t.aiSummary}
                    </p>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: '0.85rem', fontWeight: 700, color: t.feedbackDelta7d >= 5 ? RED : PURPLE, margin: 0 }}>+{t.feedbackDelta7d}</p>
                  <p style={{ fontSize: '0.7rem', color: GRAY, margin: 0 }}>this week</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p style={{ fontSize: '0.75rem', color: GRAY, marginTop: '1rem' }}>
        {data.totalActiveThemes} active themes total
      </p>
    </div>
  );
}

// ─── 5. Customers at risk ─────────────────────────────────────────────────────
function CustomersAtRiskCard({ data, href }: { data: RevenueRiskIndicator; href: string }) {
  const arrFormatted = data.totalArrAtRisk >= 1_000_000
    ? `$${(data.totalArrAtRisk / 1_000_000).toFixed(1)}M`
    : data.totalArrAtRisk >= 1000
    ? `$${Math.round(data.totalArrAtRisk / 1000)}k`
    : `$${Math.round(data.totalArrAtRisk)}`;
  return (
    <div style={cardAccent(RED)}>
      <SectionHeader label="Customers at risk of leaving" href={href} accent={RED} />
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.25rem' }}>
        <div>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: data.totalArrAtRisk > 0 ? RED : GREEN, margin: 0 }}>
            {arrFormatted}
          </p>
          <p style={{ fontSize: '0.75rem', color: GRAY, margin: 0 }}>revenue at risk</p>
        </div>
        <div>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: NAVY, margin: 0 }}>
            {data.totalCustomersAtRisk}
          </p>
          <p style={{ fontSize: '0.75rem', color: GRAY, margin: 0 }}>accounts flagged</p>
        </div>
      </div>
      {data.criticalCustomers.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: GREEN }}>✓ No customers at high churn risk right now.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {data.criticalCustomers.slice(0, 3).map((c) => (
            <div key={c.customerId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.6rem 0.875rem', background: RED_L, borderRadius: '0.5rem' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: NAVY, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}
                </p>
                {c.topFeatureRequest && (
                  <p style={{ fontSize: '0.75rem', color: GRAY, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    They want: {c.topFeatureRequest}
                  </p>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '0.75rem' }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 700, color: RED, margin: 0 }}>
                  ${c.arrValue >= 1000 ? `${Math.round(c.arrValue / 1000)}k` : c.arrValue}
                </p>
                <p style={{ fontSize: '0.7rem', color: GRAY, margin: 0 }}>ARR</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 6. Support pressure ──────────────────────────────────────────────────────
function SupportPressureCard({ data, href }: { data: SupportPressureIndicator; href: string }) {
  const delta = data.ticketDelta7d;
  const deltaColor = delta > 0 ? RED : delta < 0 ? GREEN : GRAY;
  const deltaLabel = delta > 0 ? `+${delta} vs last week` : delta < 0 ? `${delta} vs last week` : 'Same as last week';
  return (
    <div style={cardAccent(AMBER)}>
      <SectionHeader label="Support pressure" href={href} accent={AMBER} />
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.25rem' }}>
        <div>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: NAVY, margin: 0 }}>
            {data.openTicketCount}
          </p>
          <p style={{ fontSize: '0.75rem', color: GRAY, margin: 0 }}>open tickets</p>
        </div>
        <div>
          <p style={{ fontSize: '1.25rem', fontWeight: 700, color: deltaColor, margin: 0 }}>
            {deltaLabel}
          </p>
        </div>
      </div>
      {data.topPressureClusters.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: GRAY }}>No support clusters detected yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {data.topPressureClusters.slice(0, 3).map((cl: SupportPressureCluster, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.5rem 0.75rem', background: AMBER_L, borderRadius: '0.5rem' }}>
              <p style={{ fontSize: '0.85rem', color: NAVY, margin: 0, fontWeight: 500 }}>{cl.title}</p>
              <p style={{ fontSize: '0.8rem', color: AMBER, fontWeight: 700, margin: 0, flexShrink: 0, marginLeft: '0.5rem' }}>
                {cl.ticketCount} tickets
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 7. Roadmap health ────────────────────────────────────────────────────────
function RoadmapHealthCard({ data, href }: { data: RoadmapHealthPanel; href: string }) {
  const healthColor = data.healthScore >= 70 ? GREEN : data.healthScore >= 40 ? AMBER : RED;
  const statusLabel = data.healthScore >= 70 ? 'On Track' : data.healthScore >= 40 ? 'At Risk' : 'Needs Attention';
  const deliveryPct = data.committedCount > 0
    ? Math.round((data.shippedCount / (data.shippedCount + data.committedCount)) * 100)
    : 0;
  return (
    <div style={cardAccent(healthColor)}>
      <SectionHeader label="Roadmap health" href={href} accent={healthColor} />
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: healthColor, margin: 0 }}>
            {data.healthScore}/100
          </p>
          <p style={{ fontSize: '0.75rem', color: GRAY, margin: 0 }}>health score</p>
        </div>
        <Badge label={statusLabel} bg={healthColor + '18'} color={healthColor} />
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.875rem' }}>
        {[
          { label: 'Shipped', count: data.shippedCount, color: GREEN },
          { label: 'In Progress', count: data.committedCount, color: TEAL },
          { label: 'Planned', count: data.plannedCount, color: BLUE },
          { label: 'Backlog', count: data.backlogCount, color: GRAY },
        ].map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
            <span style={{ fontSize: '0.75rem', color: GRAY }}>{s.label} ({s.count})</span>
          </div>
        ))}
      </div>
      {data.delayedCriticalItems.length > 0 && (
        <div style={{ background: AMBER_L, borderRadius: '0.5rem', padding: '0.5rem 0.75rem' }}>
          <p style={{ fontSize: '0.78rem', fontWeight: 700, color: AMBER, margin: '0 0 0.2rem' }}>
            {data.delayedCriticalItems.length} item{data.delayedCriticalItems.length > 1 ? 's' : ''} stalled
          </p>
          <p style={{ fontSize: '0.8rem', color: NAVY, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {data.delayedCriticalItems[0].title}
          </p>
        </div>
      )}
      <p style={{ fontSize: '0.75rem', color: GRAY, marginTop: '0.875rem' }}>
        {data.shippedCount} shipped · {deliveryPct}% delivery rate
      </p>
    </div>
  );
}

// ─── 8. Voice & survey sentiment (full-width card) ───────────────────────────
function SentimentCard({ data, href }: { data: VoiceSentimentSignal; href: string }) {
  const sentColor = data.overallSentimentScore >= 70 ? GREEN : data.overallSentimentScore >= 40 ? AMBER : RED;
  return (
    <div style={cardAccent(sentColor)}>
      <SectionHeader label="Customer sentiment" href={href} accent={sentColor} />
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: sentColor, margin: 0 }}>
            {data.overallSentimentScore}/100
          </p>
          <p style={{ fontSize: '0.75rem', color: GRAY, margin: 0 }}>sentiment score</p>
        </div>
        <Badge
          label={data.sentimentTrend === 'improving' ? '↑ Improving' : data.sentimentTrend === 'declining' ? '↓ Declining' : '→ Stable'}
          bg={sentColor + '18'}
          color={sentColor}
        />
      </div>
      {data.recentNegativeSignals.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: GREEN }}>✓ No critical negative signals in the last 30 days.</p>
      ) : (
        <div style={{ background: RED_L, borderRadius: '0.5rem', padding: '0.6rem 0.875rem' }}>
          <p style={{ fontSize: '0.78rem', fontWeight: 700, color: RED, margin: '0 0 0.2rem' }}>
            {data.recentNegativeSignals.length} critical signal{data.recentNegativeSignals.length > 1 ? 's' : ''}
          </p>
          <p style={{ fontSize: '0.8rem', color: NAVY, margin: 0 }}>{data.recentNegativeSignals[0]?.title}</p>
        </div>
      )}
      <p style={{ fontSize: '0.75rem', color: GRAY, marginTop: '1rem' }}>
        {data.voiceCallCount} voice recordings analysed
      </p>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ r, onRefresh, isRefreshing }: { r: ReturnType<typeof appRoutes>; onRefresh: () => void; isRefreshing: boolean }) {
  const steps = [
    {
      num: '1',
      title: 'Add customer feedback',
      desc: 'Paste feedback manually, import a CSV, or connect Slack. Even 5 items will start the AI pipeline.',
      href: r.inboxNew,
      cta: 'Add feedback →',
      color: TEAL,
      bg: TEAL_L,
    },
    {
      num: '2',
      title: 'AI clusters it into themes',
      desc: 'TriageInsight groups similar feedback automatically using semantic similarity. No tagging needed.',
      href: r.themes,
      cta: 'View themes →',
      color: PURPLE,
      bg: '#faf5ff',
    },
    {
      num: '3',
      title: 'CIQ scores rank every theme',
      desc: 'Each theme gets a composite score across frequency, ARR influence, voice signals, and support pressure.',
      href: r.intelligenceThemes,
      cta: 'See rankings →',
      color: BLUE,
      bg: '#f0f9ff',
    },
    {
      num: '4',
      title: 'Decide what to build next',
      desc: 'Use the Prioritization Engine to score feature requests and surface revenue opportunities.',
      href: r.prioritization,
      cta: 'Open engine →',
      color: AMBER,
      bg: AMBER_L,
    },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Welcome banner */}
      <div style={{ ...CARD, borderLeft: `3px solid ${TEAL}`, background: TEAL_L, padding: '1.75rem 2rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '2rem', flexShrink: 0 }}>👋</div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: NAVY, margin: '0 0 0.4rem' }}>
              Welcome to TriageInsight
            </h2>
            <p style={{ fontSize: '0.875rem', color: GRAY, margin: '0 0 1.25rem', lineHeight: 1.6, maxWidth: '560px' }}>
              Your dashboard will populate as soon as you add feedback. Follow the 4 steps below — the AI does the rest.
            </p>
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              style={{
                background: TEAL, color: '#fff', border: 'none', borderRadius: '0.5rem',
                padding: '0.5rem 1.125rem', fontSize: '0.85rem', fontWeight: 600,
                cursor: isRefreshing ? 'not-allowed' : 'pointer', opacity: isRefreshing ? 0.7 : 1,
              }}
            >
              {isRefreshing ? 'Generating…' : '↻ Refresh dashboard'}
            </button>
          </div>
        </div>
      </div>

      {/* 4-step onboarding checklist */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.875rem' }}>
        {steps.map((s) => (
          <div key={s.num} style={{ ...CARD, borderLeft: `3px solid ${s.color}`, background: s.bg, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{
                width: '1.5rem', height: '1.5rem', borderRadius: '50%', background: s.color,
                color: '#fff', fontSize: '0.75rem', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>{s.num}</span>
              <p style={{ fontSize: '0.875rem', fontWeight: 700, color: NAVY, margin: 0 }}>{s.title}</p>
            </div>
            <p style={{ fontSize: '0.78rem', color: GRAY, margin: 0, lineHeight: 1.5 }}>{s.desc}</p>
            <Link href={s.href} style={{ fontSize: '0.78rem', fontWeight: 600, color: s.color, textDecoration: 'none', marginTop: 'auto' }}>
              {s.cta}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function HomeDashboardPage() {
  const params = useParams();
  const slug = Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug ?? '';
  const r = appRoutes(slug);
  const admin = orgAdminRoutes(slug);

  const { data, isLoading, isError, refetch } = useExecutiveDashboard();
  const refresh = useDashboardRefresh();

  const handleRefresh = () => {
    refresh.mutate(undefined, { onSuccess: () => refetch() });
  };

  // ── Onboarding data signals ────────────────────────────────────────────────
  const { workspace } = useWorkspace();
  const { data: feedbackCount = 0 } = useFeedbackCount();
  const { data: themeCount = 0 } = useThemeCount();
  const memberCount = 1; // conservative default; checklist auto-marks when > 1

  // ── Onboarding persistence ────────────────────────────────────────────────
  const { state: ob, hydrated: obHydrated, markStep, update: obUpdate, dismiss: obDismiss } = useOnboarding(workspace?.id);

  // Auto-detect step completion from live data
  const feedbackDone = ob.steps.feedbackImported || feedbackCount > 0;
  const insightsDone = ob.steps.insightsReviewed || themeCount > 0;

  // Top emerging theme for FirstInsightHighlight
  const topTheme = data?.emergingThemes?.emergingThemes?.[0]
    ? {
        id: data.emergingThemes.emergingThemes[0].themeId,
        name: data.emergingThemes.emergingThemes[0].title,
        feedbackCount: data.emergingThemes.emergingThemes[0].totalFeedback,
        priorityScore: data.emergingThemes.emergingThemes[0].urgencyScore,
      }
    : null;

  // Show checklist only when not dismissed and not all steps done
  const showChecklist = obHydrated && !ob.dismissed && !(feedbackDone && insightsDone && ob.steps.teamInvited);

  const hasData = data && (
    (data.productDirection?.topFeatures?.length ?? 0) > 0 ||
    (data.emergingThemes?.emergingThemes?.length ?? 0) > 0 ||
    (data.revenueRisk?.totalCustomersAtRisk ?? 0) > 0 ||
    (data.roadmapHealth?.shippedCount ?? 0) > 0
  );

  return (
    <div>
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: NAVY, margin: '0 0 0.2rem' }}>
            Home
          </h1>
          <p style={{ fontSize: '0.875rem', color: GRAY, margin: 0 }}>
            What is happening across your product today
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {data?.refreshedAt && (
            <p style={{ fontSize: '0.72rem', color: GRAY, margin: 0 }}>
              Updated {new Date(data.refreshedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {data.cached && ' (cached)'}
            </p>
          )}
          <button
            onClick={handleRefresh}
            disabled={refresh.isPending}
            style={{
              background: '#fff', color: TEAL, border: `1px solid ${TEAL}`,
              borderRadius: '0.5rem', padding: '0.4rem 0.875rem',
              fontSize: '0.8rem', fontWeight: 600,
              cursor: refresh.isPending ? 'not-allowed' : 'pointer',
              opacity: refresh.isPending ? 0.7 : 1,
            }}
          >
            {refresh.isPending ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* ── Loading state ─────────────────────────────────────────────────────── */}
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <CardSkeleton />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.875rem' }}>
            {[...Array(4)].map((_, i) => <CardSkeleton key={i} />)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
            {[...Array(3)].map((_, i) => <CardSkeleton key={i} />)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
            {[...Array(4)].map((_, i) => <CardSkeleton key={i} />)}
          </div>
        </div>
      )}

      {/* ── Error state ───────────────────────────────────────────────────────── */}
      {isError && !isLoading && (
        <div style={{ ...CARD, textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: RED, fontWeight: 600, marginBottom: '0.5rem' }}>Could not load your dashboard data</p>
          <button onClick={() => refetch()} style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.875rem' }}>
            Try again
          </button>
        </div>
      )}

      {/* ── Onboarding banners (shown regardless of data state) ────────────── */}
      {obHydrated && (
        <>
          {/* Step 1 + 2: Checklist + data ingestion guidance */}
          {showChecklist && (
            <OnboardingChecklist
              state={ob}
              feedbackCount={feedbackCount}
              themeCount={themeCount}
              memberCount={memberCount}
              routes={{
                inboxNew: r.inboxNew,
                inbox: r.inbox,
                intelligenceThemes: r.intelligenceThemes,
                adminMembers: admin.members,
                adminIntegrations: admin.integrations,
              }}
              onMarkStep={markStep}
              onDismiss={obDismiss}
            />
          )}
          {/* Step 3: AI processing state */}
          {workspace?.id && <AIPipelineProgress workspaceId={workspace.id} />}
          <AiProcessingBanner feedbackCount={feedbackCount} themeCount={themeCount} />
          {/* Step 4: First insight highlight */}
          <FirstInsightHighlight
            topTheme={topTheme}
            themeCount={themeCount}
            insightsReviewed={insightsDone}
            href={r.intelligenceThemes}
            onReview={() => markStep('insightsReviewed')}
            onDismiss={() => markStep('insightsReviewed')}
          />
          {/* Step 5: Team invite prompt */}
          <TeamInvitePrompt
            seen={ob.invitePromptSeen}
            insightsReviewed={insightsDone}
            memberCount={memberCount}
            inviteHref={admin.members}
            onSeen={() => obUpdate({ invitePromptSeen: true })}
          />
          {/* Step 6: Digest expectation */}
          <DigestExpectationBanner
            seen={ob.digestPromptSeen}
            themeCount={themeCount}
            digestHref={r.digest ?? r.intelligenceThemes}
            onSeen={() => obUpdate({ digestPromptSeen: true })}
          />
          {/* Step 7: Portal activation */}
          <PortalActivationPrompt
            seen={ob.portalPromptSeen}
            themeCount={themeCount}
            orgSlug={slug}
            portalSettingsHref={admin.settings}
            onSeen={() => obUpdate({ portalPromptSeen: true })}
          />
        </>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────────── */}
      {!isLoading && !isError && !hasData && (
        <EmptyState r={r} onRefresh={handleRefresh} isRefreshing={refresh.isPending} />
      )}

      {/* ── Dashboard with data ───────────────────────────────────────────────── */}
      {!isLoading && !isError && data && hasData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Today's summary — full width */}
          <TodaySummaryCard summary={data.executiveSummary} />

          {/* Quick actions — always prominent */}
          <QuickActions r={r} />

          {/* ── Charts row ── 3 visual charts side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            <RoadmapDonutChart  roadmap={data.roadmapHealth}    href={r.roadmap} />
            <TopFeaturesChart   direction={data.productDirection} href={r.intelligenceFeatures} />
            <SentimentGauge     sentiment={data.voiceSentiment}  href={r.inbox} />
          </div>

          {/* 2×2 grid of status cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
            <ThemesCard          data={data.emergingThemes}   href={r.intelligenceThemes} />
            <CustomersAtRiskCard data={data.revenueRisk}      href={r.intelligenceCustomers} />
            <SupportPressureCard data={data.supportPressure}  href={r.support.tickets} />
            <RoadmapHealthCard   data={data.roadmapHealth}    href={r.roadmap} />
          </div>

          {/* Sentiment — full width */}
          <SentimentCard data={data.voiceSentiment} href={r.inbox} />
        </div>
      )}

      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

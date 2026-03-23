'use client';
/**
 * Home Dashboard — /:orgSlug/app
 *
 * A simple, founder-friendly overview of what is happening across your product.
 * No jargon. No metric clutter. Just the things you need to act on today.
 *
 * Sections:
 *   1. Today's Summary   — one plain-English sentence about what matters most
 *   2. Quick Actions     — 4 large buttons to the two power features
 *   3. What customers are asking about  (Emerging Themes)
 *   4. Customers at risk                (Revenue Risk)
 *   5. Support pressure                 (Support Pressure)
 *   6. Roadmap health                   (Roadmap Health)
 *   7. Voice & survey sentiment         (Voice Sentiment)
 */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useExecutiveDashboard, useDashboardRefresh } from '@/hooks/use-dashboard';
import { appRoutes } from '@/lib/routes';
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
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{ fontSize: '1.25rem', flexShrink: 0 }}>📋</div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '0.95rem', fontWeight: 600, color: NAVY, margin: '0 0 0.4rem', lineHeight: 1.5 }}>
            {summary.weekSummary}
          </p>
          {summary.keyInsights?.slice(0, 2).map((b: string, i: number) => (
            <p key={i} style={{ fontSize: '0.85rem', color: '#374151', margin: '0 0 0.2rem', lineHeight: 1.5 }}>
              → {b}
            </p>
          ))}
          {summary.topAction && (
            <div style={{ marginTop: '0.75rem', background: '#fff', border: `1px solid ${TEAL}33`, borderRadius: '0.5rem', padding: '0.5rem 0.875rem' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: TEAL, margin: '0 0 0.15rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Suggested next step
              </p>
              <p style={{ fontSize: '0.875rem', color: NAVY, margin: 0 }}>{summary.topAction}</p>
            </div>
          )}
        </div>
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
      accent: '#7c3aed',
      bg: '#faf5ff',
    },
    {
      href: r.intelligenceFeatures,
      emoji: '📊',
      label: 'Feature Ranking',
      desc: 'All feature requests ranked by customer demand and revenue',
      accent: '#0369a1',
      bg: '#f0f9ff',
    },
    {
      href: r.prioritizationOpportunities,
      emoji: '💡',
      label: 'Opportunities',
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

// ─── 3. What customers are asking about ──────────────────────────────────────
function ThemesCard({ data, href }: { data: EmergingThemeRadar; href: string }) {
  return (
    <div style={cardAccent('#7c3aed')}>
      <SectionHeader label="What customers are asking about" href={href} accent="#7c3aed" />
      {data.spikeEvents.length > 0 && (
        <div style={{ background: AMBER_L, border: `1px solid ${AMBER}33`, borderRadius: '0.6rem', padding: '0.6rem 0.875rem', marginBottom: '0.875rem' }}>
          <p style={{ fontSize: '0.78rem', fontWeight: 700, color: AMBER, margin: '0 0 0.2rem' }}>
            ⚡ {data.spikeEvents.length} sudden spike{data.spikeEvents.length > 1 ? 's' : ''} in support tickets
          </p>
          <p style={{ fontSize: '0.8rem', color: NAVY, margin: 0 }}>
            {data.spikeEvents[0].clusterTitle} — {data.spikeEvents[0].ticketCount} tickets this week
          </p>
        </div>
      )}
      {data.emergingThemes.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: GRAY }}>No new themes this week. Add more feedback to detect patterns.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {data.emergingThemes.slice(0, 4).map((t) => (
            <div key={t.themeId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.15rem' }}>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600, color: NAVY, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.title}
                  </p>
                  {t.isNew && <Badge label="New" bg="#fce8ff" color="#7c3aed" />}
                </div>
                <p style={{ fontSize: '0.78rem', color: GRAY, margin: 0 }}>{t.signal}</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#7c3aed', margin: 0 }}>+{t.feedbackDelta7d}</p>
                <p style={{ fontSize: '0.7rem', color: GRAY, margin: 0 }}>this week</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: '0.75rem', color: GRAY, marginTop: '1rem' }}>
        {data.totalActiveThemes} active themes total
      </p>
    </div>
  );
}

// ─── 4. Customers at risk ─────────────────────────────────────────────────────
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

// ─── 5. Support pressure ──────────────────────────────────────────────────────
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

// ─── 6. Roadmap health ────────────────────────────────────────────────────────
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
          { label: 'Planned', count: data.plannedCount, color: '#0369a1' },
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

// ─── 7. Voice & survey sentiment ─────────────────────────────────────────────
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Welcome banner */}
      <div style={{ ...CARD, borderLeft: `3px solid ${TEAL}`, background: TEAL_L, textAlign: 'center', padding: '2rem' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>👋</div>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: NAVY, marginBottom: '0.5rem' }}>
          Welcome to TriageInsight
        </h2>
        <p style={{ fontSize: '0.9rem', color: GRAY, maxWidth: '460px', margin: '0 auto 1.25rem', lineHeight: 1.6 }}>
          Start by adding customer feedback, then TriageInsight will automatically group it into themes,
          score feature requests, and tell you what to build next.
        </p>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          style={{
            background: TEAL, color: '#fff', border: 'none', borderRadius: '0.5rem',
            padding: '0.6rem 1.25rem', fontSize: '0.875rem', fontWeight: 600,
            cursor: isRefreshing ? 'not-allowed' : 'pointer', opacity: isRefreshing ? 0.7 : 1,
          }}
        >
          {isRefreshing ? 'Generating…' : 'Generate my first report'}
        </button>
      </div>

      {/* Quick action cards always visible even when empty */}
      <QuickActions r={r} />
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function HomeDashboardPage() {
  const params = useParams();
  const slug = Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug ?? '';
  const r = appRoutes(slug);

  const { data, isLoading, isError, refetch } = useExecutiveDashboard();
  const refresh = useDashboardRefresh();

  const handleRefresh = () => {
    refresh.mutate(undefined, { onSuccess: () => refetch() });
  };

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

          {/* 2×2 grid of status cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
            <ThemesCard         data={data.emergingThemes}   href={r.intelligenceThemes} />
            <CustomersAtRiskCard data={data.revenueRisk}     href={r.intelligenceCustomers} />
            <SupportPressureCard data={data.supportPressure} href={r.support.tickets} />
            <RoadmapHealthCard   data={data.roadmapHealth}   href={r.roadmap} />
          </div>

          {/* Sentiment — full width */}
          <SentimentCard data={data.voiceSentiment} href={r.voice} />
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

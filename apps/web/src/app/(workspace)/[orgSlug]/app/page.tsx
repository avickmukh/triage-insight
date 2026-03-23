'use client';
/**
 * Executive Intelligence Dashboard — /:orgSlug/app
 *
 * A decision intelligence surface for executives. Not a metrics dashboard.
 * Surfaces 7 AI-powered intelligence cards:
 *   1. Executive Weekly Summary
 *   2. Product Direction Summary
 *   3. Emerging Theme Radar
 *   4. Revenue Risk Indicator
 *   5. Voice Sentiment Signal
 *   6. Support Pressure Indicator
 *   7. Roadmap Health Panel
 *
 * Design principles:
 *   - Calm, intelligent, executive-grade
 *   - Minimal noise, high clarity
 *   - Narrative tone, not metric clutter
 *   - Drilldown navigation to detailed surfaces
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
const BG     = '#F8F9FA';

const CARD: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${BORDER}`,
  borderRadius: '0.875rem',
  padding: '1.5rem',
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

// ─── 1. Executive Weekly Summary ──────────────────────────────────────────────
function ExecutiveSummaryCard({ summary }: { summary: ExecutiveSummary }) {
  return (
    <div style={{ ...CARD, borderTop: `3px solid ${TEAL}` }}>
      <SectionHeader label="Executive Intelligence" />
      <p style={{ fontSize: '0.95rem', color: NAVY, lineHeight: 1.65, marginBottom: '1.25rem', fontWeight: 400 }}>
        {summary.weekSummary}
      </p>

      {summary.riskAlert && (
        <div style={{ background: RED_L, border: `1px solid ${RED}22`, borderRadius: '0.6rem', padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
          <span style={{ color: RED, fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>⚠ Risk Alert</span>
          <p style={{ fontSize: '0.85rem', color: RED, margin: 0 }}>{summary.riskAlert}</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {summary.keyInsights.map((insight, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
            <span style={{ color: TEAL, fontWeight: 700, fontSize: '0.85rem', flexShrink: 0, marginTop: '0.05rem' }}>→</span>
            <p style={{ fontSize: '0.875rem', color: NAVY, margin: 0, lineHeight: 1.55 }}>{insight}</p>
          </div>
        ))}
      </div>

      <div style={{ background: TEAL_L, borderRadius: '0.6rem', padding: '0.75rem 1rem' }}>
        <p style={{ fontSize: '0.8rem', fontWeight: 700, color: TEAL, marginBottom: '0.25rem' }}>Top Action</p>
        <p style={{ fontSize: '0.875rem', color: NAVY, margin: 0 }}>{summary.topAction}</p>
      </div>

      <p style={{ fontSize: '0.78rem', color: GRAY, marginTop: '1rem', margin: '1rem 0 0' }}>
        {summary.momentumSignal}
      </p>
    </div>
  );
}

// ─── 2. Product Direction Summary ─────────────────────────────────────────────
function ProductDirectionCard({
  data, href,
}: { data: ProductDirectionSummary; href: string }) {
  return (
    <div style={cardAccent(TEAL)}>
      <SectionHeader label="Product Direction" href={href} accent={TEAL} />
      {data.topFeatures.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: GRAY }}>No scored features yet. Run a CIQ recompute to generate recommendations.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {data.topFeatures.map((f, i) => (
            <div key={f.feedbackId} style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-start' }}>
              <div style={{
                width: '1.75rem', height: '1.75rem', borderRadius: '50%', flexShrink: 0,
                background: i === 0 ? TEAL : i === 1 ? '#e8f7f7' : '#f0f4f8',
                color: i === 0 ? '#fff' : NAVY,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: 700,
              }}>
                {i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.9rem', fontWeight: 700, color: NAVY, margin: '0 0 0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.title}
                </p>
                <p style={{ fontSize: '0.78rem', color: GRAY, margin: '0 0 0.35rem' }}>{f.rationale}</p>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <Badge label={`CIQ ${f.ciqScore}`} bg={TEAL_L} color={TEAL} />
                  <Badge label={`${f.confidenceScore}% confidence`} bg="#f0f4f8" color={NAVY} />
                  {f.revenueInfluence > 0 && (
                    <Badge label={`$${Math.round(f.revenueInfluence / 1000)}k ARR`} bg={AMBER_L} color={AMBER} />
                  )}
                  {f.themeTitle && (
                    <Badge label={f.themeTitle} bg="#f0f4f8" color={GRAY} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: '0.75rem', color: GRAY, marginTop: '1rem' }}>
        {data.scoredFeedbackCount} of {data.totalFeedbackCount} requests scored
      </p>
    </div>
  );
}

// ─── 3. Emerging Theme Radar ──────────────────────────────────────────────────
function EmergingThemeCard({
  data, href,
}: { data: EmergingThemeRadar; href: string }) {
  return (
    <div style={cardAccent('#7c3aed')}>
      <SectionHeader label="Emerging Themes" href={href} accent="#7c3aed" />

      {data.spikeEvents.length > 0 && (
        <div style={{ background: AMBER_L, border: `1px solid ${AMBER}33`, borderRadius: '0.6rem', padding: '0.6rem 0.875rem', marginBottom: '0.875rem' }}>
          <p style={{ fontSize: '0.78rem', fontWeight: 700, color: AMBER, margin: '0 0 0.2rem' }}>
            ⚡ {data.spikeEvents.length} Active Support Spike{data.spikeEvents.length > 1 ? 's' : ''}
          </p>
          <p style={{ fontSize: '0.8rem', color: NAVY, margin: 0 }}>
            {data.spikeEvents[0].clusterTitle} — {data.spikeEvents[0].ticketCount} tickets (z={data.spikeEvents[0].zScore})
          </p>
        </div>
      )}

      {data.emergingThemes.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: GRAY }}>No emerging themes detected this week.</p>
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

// ─── 4. Revenue Risk Indicator ────────────────────────────────────────────────
function RevenueRiskCard({
  data, href,
}: { data: RevenueRiskIndicator; href: string }) {
  const arrFormatted = data.totalArrAtRisk >= 1_000_000
    ? `$${(data.totalArrAtRisk / 1_000_000).toFixed(1)}M`
    : data.totalArrAtRisk >= 1000
    ? `$${Math.round(data.totalArrAtRisk / 1000)}k`
    : `$${Math.round(data.totalArrAtRisk)}`;

  return (
    <div style={cardAccent(RED)}>
      <SectionHeader label="Revenue Risk" href={href} accent={RED} />

      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.25rem' }}>
        <div>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: data.totalArrAtRisk > 0 ? RED : GREEN, margin: 0 }}>
            {arrFormatted}
          </p>
          <p style={{ fontSize: '0.75rem', color: GRAY, margin: 0 }}>ARR at risk</p>
        </div>
        <div>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: NAVY, margin: 0 }}>
            {data.totalCustomersAtRisk}
          </p>
          <p style={{ fontSize: '0.75rem', color: GRAY, margin: 0 }}>at-risk accounts</p>
        </div>
      </div>

      {data.criticalCustomers.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: GREEN }}>No customers at high churn risk.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {data.criticalCustomers.slice(0, 3).map((c) => (
            <div key={c.customerId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.875rem', background: RED_L, borderRadius: '0.5rem' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: NAVY, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}
                </p>
                {c.topFeatureRequest && (
                  <p style={{ fontSize: '0.75rem', color: GRAY, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Wants: {c.topFeatureRequest}
                  </p>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '0.75rem' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: RED, margin: 0 }}>
                  {Math.round(c.churnRisk * 100)}% risk
                </p>
                <p style={{ fontSize: '0.7rem', color: GRAY, margin: 0 }}>
                  ${Math.round(c.arrValue / 1000)}k ARR
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 5. Voice Sentiment Signal ────────────────────────────────────────────────
function VoiceSentimentCard({
  data, href,
}: { data: VoiceSentimentSignal; href: string }) {
  const trendColor = data.sentimentTrend === 'improving' ? GREEN : data.sentimentTrend === 'declining' ? RED : AMBER;
  const trendLabel = data.sentimentTrend === 'improving' ? '↑ Improving' : data.sentimentTrend === 'declining' ? '↓ Declining' : '→ Stable';
  const trendBg    = data.sentimentTrend === 'improving' ? GREEN_L : data.sentimentTrend === 'declining' ? RED_L : AMBER_L;

  return (
    <div style={cardAccent(trendColor)}>
      <SectionHeader label="Voice & Sentiment" href={href} accent={trendColor} />

      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.25rem', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: NAVY, margin: 0 }}>
            {data.overallSentimentScore.toFixed(0)}<span style={{ fontSize: '0.9rem', fontWeight: 400, color: GRAY }}>/100</span>
          </p>
          <p style={{ fontSize: '0.75rem', color: GRAY, margin: 0 }}>sentiment score</p>
        </div>
        <Badge label={trendLabel} bg={trendBg} color={trendColor} />
        {data.negativeTrendIndicator && (
          <Badge label={`${Math.round(data.negativeFraction * 100)}% negative`} bg={RED_L} color={RED} />
        )}
      </div>

      <div style={{ background: data.negativeTrendIndicator ? RED_L : TEAL_L, borderRadius: '0.6rem', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
        <p style={{ fontSize: '0.85rem', color: NAVY, margin: 0, lineHeight: 1.55 }}>
          {data.unresolvedPainSummary}
        </p>
      </div>

      {data.sentimentByTheme.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {data.sentimentByTheme.slice(0, 3).map((t) => (
            <div key={t.themeId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: '0.8rem', color: NAVY, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {t.title}
              </p>
              <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, marginLeft: '0.5rem' }}>
                <Badge
                  label={t.avgSentiment >= 0 ? 'Positive' : 'Negative'}
                  bg={t.avgSentiment >= 0 ? GREEN_L : RED_L}
                  color={t.avgSentiment >= 0 ? GREEN : RED}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: '0.75rem', color: GRAY, marginTop: '1rem' }}>
        {data.voiceCallCount} voice recordings analysed
      </p>
    </div>
  );
}

// ─── 6. Support Pressure Indicator ───────────────────────────────────────────
function SupportPressureCard({
  data, href,
}: { data: SupportPressureIndicator; href: string }) {
  const trendColor = data.ticketTrend === 'increasing' ? RED : data.ticketTrend === 'decreasing' ? GREEN : AMBER;

  return (
    <div style={cardAccent(trendColor)}>
      <SectionHeader label="Support Pressure" href={href} accent={trendColor} />

      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.25rem' }}>
        <div>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: NAVY, margin: 0 }}>
            {data.openTicketCount}
          </p>
          <p style={{ fontSize: '0.75rem', color: GRAY, margin: 0 }}>open tickets</p>
        </div>
        <div>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: trendColor, margin: 0 }}>
            {data.ticketDelta7d > 0 ? '+' : ''}{data.ticketDelta7d}
          </p>
          <p style={{ fontSize: '0.75rem', color: GRAY, margin: 0 }}>vs last week</p>
        </div>
        {data.activeSpikeCount > 0 && (
          <div>
            <p style={{ fontSize: '1.5rem', fontWeight: 800, color: RED, margin: 0 }}>
              {data.activeSpikeCount}
            </p>
            <p style={{ fontSize: '0.75rem', color: GRAY, margin: 0 }}>active spikes</p>
          </div>
        )}
      </div>

      {data.topPressureClusters.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: GRAY }}>No support clusters detected.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {data.topPressureClusters.slice(0, 3).map((c) => (
            <div key={c.clusterId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: c.isSpike ? RED_L : BG, borderRadius: '0.5rem', border: `1px solid ${c.isSpike ? RED + '33' : BORDER}` }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 600, color: NAVY, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.title}
                </p>
                {c.themeTitle && (
                  <p style={{ fontSize: '0.72rem', color: GRAY, margin: 0 }}>Theme: {c.themeTitle}</p>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '0.75rem' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: c.isSpike ? RED : NAVY, margin: 0 }}>
                  {c.ticketCount} tickets
                </p>
                {c.isSpike && <Badge label="Spike" bg={RED_L} color={RED} />}
              </div>
            </div>
          ))}
        </div>
      )}

      {data.estimatedArrAtRisk > 0 && (
        <p style={{ fontSize: '0.78rem', color: RED, marginTop: '0.875rem', fontWeight: 600 }}>
          ~${Math.round(data.estimatedArrAtRisk / 1000)}k ARR exposure from support clusters
        </p>
      )}
    </div>
  );
}

// ─── 7. Roadmap Health Panel ──────────────────────────────────────────────────
function RoadmapHealthCard({
  data, href,
}: { data: RoadmapHealthPanel; href: string }) {
  const healthColor = data.healthLabel === 'healthy' ? GREEN : data.healthLabel === 'at_risk' ? AMBER : RED;
  const healthBg    = data.healthLabel === 'healthy' ? GREEN_L : data.healthLabel === 'at_risk' ? AMBER_L : RED_L;
  const healthText  = data.healthLabel === 'healthy' ? 'Healthy' : data.healthLabel === 'at_risk' ? 'At Risk' : 'Critical';

  return (
    <div style={cardAccent(healthColor)}>
      <SectionHeader label="Roadmap Health" href={href} accent={healthColor} />

      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.25rem', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: healthColor, margin: 0 }}>
            {data.healthScore}<span style={{ fontSize: '0.9rem', fontWeight: 400, color: GRAY }}>/100</span>
          </p>
          <p style={{ fontSize: '0.75rem', color: GRAY, margin: 0 }}>health score</p>
        </div>
        <Badge label={healthText} bg={healthBg} color={healthColor} />
        <div style={{ marginLeft: 'auto' }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 700, color: GREEN, margin: 0 }}>
            {data.shippedCount} shipped
          </p>
          <p style={{ fontSize: '0.72rem', color: GRAY, margin: 0 }}>
            {Math.round(data.shippedRatio * 100)}% delivery rate
          </p>
        </div>
      </div>

      {/* Delivery bar */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.25rem', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ flex: data.shippedCount || 0.01, background: GREEN }} />
          <div style={{ flex: data.committedCount || 0.01, background: TEAL }} />
          <div style={{ flex: data.plannedCount || 0.01, background: AMBER }} />
          <div style={{ flex: data.backlogCount || 0.01, background: BORDER }} />
        </div>
        <div style={{ display: 'flex', gap: '0.875rem', marginTop: '0.4rem' }}>
          {[
            { label: 'Shipped', count: data.shippedCount, color: GREEN },
            { label: 'Committed', count: data.committedCount, color: TEAL },
            { label: 'Planned', count: data.plannedCount, color: AMBER },
            { label: 'Backlog', count: data.backlogCount, color: GRAY },
          ].map((s) => (
            <div key={s.label} style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: s.color }} />
              <p style={{ fontSize: '0.7rem', color: GRAY, margin: 0 }}>{s.label} ({s.count})</p>
            </div>
          ))}
        </div>
      </div>

      {data.delayedCriticalItems.length > 0 && (
        <div style={{ marginBottom: '0.875rem' }}>
          <p style={{ fontSize: '0.78rem', fontWeight: 700, color: AMBER, marginBottom: '0.4rem' }}>
            {data.delayedCriticalItems.length} Delayed Critical Item{data.delayedCriticalItems.length > 1 ? 's' : ''}
          </p>
          {data.delayedCriticalItems.slice(0, 2).map((item) => (
            <div key={item.roadmapItemId} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: `1px solid ${BORDER}` }}>
              <p style={{ fontSize: '0.82rem', color: NAVY, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {item.title}
              </p>
              <p style={{ fontSize: '0.72rem', color: AMBER, margin: 0, flexShrink: 0, marginLeft: '0.5rem' }}>
                {item.daysInStatus}d stale
              </p>
            </div>
          ))}
        </div>
      )}

      {data.opportunityGaps.length > 0 && (
        <div style={{ background: TEAL_L, borderRadius: '0.5rem', padding: '0.6rem 0.875rem' }}>
          <p style={{ fontSize: '0.78rem', fontWeight: 700, color: TEAL, margin: '0 0 0.25rem' }}>
            {data.opportunityGaps.length} Opportunity Gap{data.opportunityGaps.length > 1 ? 's' : ''}
          </p>
          <p style={{ fontSize: '0.8rem', color: NAVY, margin: 0 }}>
            {data.opportunityGaps[0].title} — high priority, no roadmap commitment
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ onRefresh, isRefreshing }: { onRefresh: () => void; isRefreshing: boolean }) {
  return (
    <div style={{ ...CARD, textAlign: 'center', padding: '3rem 2rem' }}>
      <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🧠</div>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: NAVY, marginBottom: '0.5rem' }}>
        Intelligence surface is warming up
      </h2>
      <p style={{ fontSize: '0.9rem', color: GRAY, maxWidth: '420px', margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
        Add feedback, customers, and roadmap items to generate your first executive intelligence report.
        Once data is available, this surface will automatically populate.
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
        {isRefreshing ? 'Refreshing…' : 'Generate Intelligence'}
      </button>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function ExecutiveDashboardPage() {
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
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: NAVY, margin: '0 0 0.25rem' }}>
            Executive Intelligence
          </h1>
          <p style={{ fontSize: '0.875rem', color: GRAY, margin: 0 }}>
            Decision intelligence surface — not a metrics dashboard
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
          {[...Array(7)].map((_, i) => <CardSkeleton key={i} />)}
        </div>
      )}

      {/* ── Error state ───────────────────────────────────────────────────────── */}
      {isError && !isLoading && (
        <div style={{ ...CARD, textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: RED, fontWeight: 600, marginBottom: '0.5rem' }}>Failed to load intelligence data</p>
          <button onClick={() => refetch()} style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.875rem' }}>
            Retry
          </button>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────────── */}
      {!isLoading && !isError && !hasData && (
        <EmptyState onRefresh={handleRefresh} isRefreshing={refresh.isPending} />
      )}

      {/* ── Intelligence surfaces ─────────────────────────────────────────────── */}
      {!isLoading && !isError && data && hasData && (
        <>
          {/* Row 1: Executive Summary (full width) */}
          <div style={{ marginBottom: '1.25rem' }}>
            <ExecutiveSummaryCard summary={data.executiveSummary} />
          </div>

          {/* Row 2: Product Direction + Emerging Themes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
            <ProductDirectionCard data={data.productDirection} href={r.intelligenceFeatures} />
            <EmergingThemeCard    data={data.emergingThemes}   href={r.intelligenceThemes} />
          </div>

          {/* Row 3: Revenue Risk + Voice Sentiment */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
            <RevenueRiskCard    data={data.revenueRisk}    href={r.intelligenceCustomers} />
            <VoiceSentimentCard data={data.voiceSentiment} href={r.voice} />
          </div>

          {/* Row 4: Support Pressure + Roadmap Health */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
            <SupportPressureCard data={data.supportPressure} href={r.support.tickets} />
            <RoadmapHealthCard   data={data.roadmapHealth}   href={r.roadmap} />
          </div>

          {/* Row 5: Quick navigation to intelligence surfaces */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.875rem' }}>
            {[
              { href: r.intelligence,              label: 'Intelligence Hub',       desc: 'CIQ signals & strategic feed' },
              { href: r.prioritization,            label: 'Prioritization',         desc: '4-dimension scoring engine' },
              { href: r.intelligenceFeatures,      label: 'Feature Ranking',        desc: 'CIQ-ranked feature requests' },
              { href: r.prioritizationOpportunities, label: 'Revenue Opportunities', desc: 'High-value unplanned features' },
            ].map((q) => (
              <Link
                key={q.href}
                href={q.href}
                style={{ ...CARD, textDecoration: 'none', display: 'block', borderLeft: `3px solid ${TEAL}` }}
              >
                <p style={{ fontSize: '0.875rem', fontWeight: 700, color: NAVY, marginBottom: '0.2rem' }}>{q.label}</p>
                <p style={{ fontSize: '0.78rem', color: GRAY, margin: 0 }}>{q.desc}</p>
              </Link>
            ))}
          </div>
        </>
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

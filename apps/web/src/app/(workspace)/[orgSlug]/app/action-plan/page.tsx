'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { appRoutes } from '@/lib/routes';
import type {
  ActionPlanItem,
  ActionPriority,
  ActionType,
  TrendAlert,
  AlertType,
  UrgencyLevel,
  AiRoadmapSuggestion,
} from '@/lib/api-types';

// ─── Design tokens ────────────────────────────────────────────────────────────

const PRIORITY_DOT: Record<ActionPriority, { dot: string; bg: string; color: string; border: string }> = {
  CRITICAL: { dot: '🔴', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  HIGH:     { dot: '🔴', bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  MEDIUM:   { dot: '🟡', bg: '#fefce8', color: '#a16207', border: '#fde68a' },
  LOW:      { dot: '🟢', bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
};

const ACTION_STYLE: Record<ActionType, { bg: string; color: string; label: string; cta: string }> = {
  ADD_TO_ROADMAP:    { bg: '#ede9fe', color: '#7c3aed', label: 'Add to Roadmap',    cta: '+ Add to Roadmap →' },
  INCREASE_PRIORITY: { bg: '#fef3c7', color: '#b45309', label: 'Increase Priority', cta: '↑ Increase Priority →' },
  INVESTIGATE:       { bg: '#fce7f3', color: '#9d174d', label: 'Investigate',        cta: '🔍 Investigate →' },
  MONITOR:           { bg: '#f0f4f8', color: '#475569', label: 'Monitor',            cta: '👁 Monitor →' },
};

const ALERT_STYLE: Record<AlertType, { icon: string; label: string; bg: string; color: string; border: string }> = {
  VELOCITY_SPIKE: { icon: '⚡', label: 'Velocity Spike',  bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  RESURFACED:     { icon: '🔄', label: 'Resurfaced',       bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  SENTIMENT_DROP: { icon: '📉', label: 'Sentiment Drop',   bg: '#fce7f3', color: '#9d174d', border: '#f9a8d4' },
};

const URGENCY_DOT: Record<UrgencyLevel, string> = {
  CRITICAL: '🔴',
  HIGH:     '🟠',
  MEDIUM:   '🟡',
};

const CARD: React.CSSProperties = {
  background: '#fff',
  borderRadius: '0.75rem',
  border: '1px solid #e9ecef',
  padding: '1.25rem 1.5rem',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};

/** Visual styling for each signal quality label chip */
const SIGNAL_LABEL_META: Record<string, { bg: string; color: string }> = {
  'Strong signal':       { bg: '#e8f5e9', color: '#2e7d32' },
  'Multi-source':        { bg: '#e0f2fe', color: '#0369a1' },
  'Rising':              { bg: '#fff7ed', color: '#c2410c' },
  'Declining':           { bg: '#f0f9ff', color: '#0369a1' },
  'High revenue impact': { bg: '#f0fdf4', color: '#15803d' },
  'Resurfaced':          { bg: '#fce7f3', color: '#9d174d' },
  'Emerging issue':      { bg: '#fefce8', color: '#a16207' },
  'Needs more data':     { bg: '#f8fafc', color: '#6C757D' },
  'Near-duplicate':      { bg: '#fef2f2', color: '#b91c1c' },
};

const LABEL: React.CSSProperties = {
  fontSize: '0.68rem',
  fontWeight: 800,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  color: '#adb5bd',
  marginBottom: '0.15rem',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildWhatChanged(item: ActionPlanItem): string {
  const parts: string[] = [];
  const total = (item.signals.feedbackCount ?? 0)
    + (item.signals.supportCount ?? 0)
    + (item.signals.voiceCount ?? 0)
    + (item.signals.surveyCount ?? 0);
  if (total > 0) parts.push(`${total} signal${total !== 1 ? 's' : ''} across all sources`);
  if (item.signals.trendDelta != null && Math.abs(item.signals.trendDelta) >= 10) {
    parts.push(`${item.signals.trendDelta > 0 ? '+' : ''}${Math.round(item.signals.trendDelta)}% signal velocity WoW`);
  }
  if (item.signals.resurfaceCount > 0) {
    parts.push(`resurfaced ${item.signals.resurfaceCount}× after being shipped`);
  }
  if (item.signals.lastEvidenceAt) {
    const days = Math.round((Date.now() - new Date(item.signals.lastEvidenceAt).getTime()) / 86_400_000);
    if (days <= 7) parts.push(`last signal ${days === 0 ? 'today' : `${days}d ago`}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'No recent change detected.';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ActionPlanPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const r = appRoutes(orgSlug);

  const { data, isLoading, error } = useQuery({
    queryKey: ['action-plan', orgSlug],
    queryFn: () => apiClient.prioritization.getActionPlan(orgSlug),
    staleTime: 5 * 60 * 1000,
  });

  const { data: alertData, isLoading: alertsLoading } = useQuery({
    queryKey: ['trend-alerts', orgSlug],
    queryFn: () => apiClient.prioritization.getTrendAlerts(orgSlug),
    staleTime: 5 * 60 * 1000,
  });

  const { data: roadmapCandidatesData, isLoading: candidatesLoading } = useQuery({
    queryKey: ['roadmap-ai-suggestions', orgSlug],
    queryFn: () => apiClient.roadmap.getAiSuggestions(orgSlug, 5),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '860px', margin: '0 auto' }}>
        <div style={{ height: '2rem', width: '14rem', borderRadius: '0.5rem', background: '#f0f4f8', marginBottom: '2rem' }} />
        {[1, 2, 3].map((n) => (
          <div key={n} style={{ ...CARD, marginBottom: '1rem', height: '8rem', background: '#f8fafc' }} />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: '2rem', maxWidth: '860px', margin: '0 auto' }}>
        <div style={{ ...CARD, textAlign: 'center', color: '#6C757D' }}>
          <p style={{ fontSize: '1rem', fontWeight: 600 }}>Could not load action plan.</p>
          <p style={{ fontSize: '0.875rem' }}>Ensure themes have been scored by the CIQ engine at least once.</p>
        </div>
      </div>
    );
  }

  const alerts = alertData?.alerts ?? [];

  return (
    <div style={{ padding: '2rem', maxWidth: '860px', margin: '0 auto' }}>

      {/* ── 🚨 What needs attention right now ── */}
      {(alertsLoading || alerts.length > 0) && (
        <section style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
            <span style={{ fontSize: '1.15rem' }}>🚨</span>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0A2540', margin: 0 }}>
              What needs attention right now
            </h2>
            {alerts.length > 0 && (
              <span style={{
                fontSize: '0.68rem', fontWeight: 800,
                padding: '0.1rem 0.5rem', borderRadius: '999px',
                background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca',
              }}>
                {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {alertsLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[1, 2].map((n) => (
                <div key={n} style={{ ...CARD, height: '4rem', background: '#f8fafc' }} />
              ))}
            </div>
          )}

          {!alertsLoading && alerts.length === 0 && (
            <div style={{ ...CARD, color: '#6C757D', fontSize: '0.875rem', textAlign: 'center', padding: '1.25rem' }}>
              No active alerts. All themes are within normal velocity and sentiment ranges.
            </div>
          )}

          {!alertsLoading && alerts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {alerts.map((alert: TrendAlert) => (
                <AlertCard key={`${alert.themeId}-${alert.alertType}`} alert={alert} r={r} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Weekly Action Plan header ── */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0A2540', margin: '0 0 0.25rem' }}>
          Weekly Action Plan
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#6C757D', margin: 0 }}>
          {data.items.length} theme{data.items.length !== 1 ? 's' : ''} need your attention this week.
          Ranked by urgency — act on 🔴 items first.
        </p>
      </div>

      {/* Empty state */}
      {data.items.length === 0 && (
        <div style={{ ...CARD, textAlign: 'center', color: '#6C757D', padding: '3rem' }}>
          <p style={{ fontSize: '1rem', fontWeight: 700, color: '#0A2540', margin: '0 0 0.5rem' }}>Nothing urgent this week.</p>
          <p style={{ fontSize: '0.875rem', margin: '0 0 0.5rem' }}>
            The Action Plan requires themes to have at least 1 signal (feedback, voice, support, or survey)
            and a CIQ score. Once the CIQ engine has scored your themes, this list will populate automatically.
          </p>
          <p style={{ fontSize: '0.8rem', margin: 0 }}>
            Tip: Go to <strong>CIQ Scoring</strong> and trigger a recompute, or verify that feedback has been ingested and themes have been clustered.
          </p>
        </div>
      )}

      {/* Action cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        {data.items.map((item: ActionPlanItem, idx: number) => (
          <ActionCard key={item.themeId} item={item} rank={idx + 1} r={r} />
        ))}
      </div>

      {/* ── 🗺️ Roadmap Candidates ── */}
      <section style={{ marginTop: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
          <span style={{ fontSize: '1.15rem' }}>🗺️</span>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0A2540', margin: 0 }}>
            Recommended Roadmap Candidates
          </h2>
          <span style={{
            fontSize: '0.68rem', fontWeight: 800,
            padding: '0.1rem 0.5rem', borderRadius: '999px',
            background: '#ede9fe', color: '#7c3aed', border: '1px solid #c4b5fd',
          }}>AI</span>
        </div>
        <p style={{ fontSize: '0.82rem', color: '#6C757D', margin: '0 0 1rem' }}>
          Themes not yet on the roadmap, ranked by Roadmap Priority Score. Click to view the theme and add it.
        </p>

        {candidatesLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[1, 2, 3].map((n) => (
              <div key={n} style={{ ...CARD, height: '5rem', background: '#f8fafc' }} />
            ))}
          </div>
        )}

        {!candidatesLoading && (() => {
          const candidates = (roadmapCandidatesData?.data ?? []).filter(
            (s: AiRoadmapSuggestion) => s.suggestionType === 'ADD_TO_ROADMAP'
          );
          if (candidates.length === 0) {
            return (
              <div style={{ ...CARD, color: '#6C757D', fontSize: '0.875rem', textAlign: 'center', padding: '1.25rem' }}>
                No unroadmapped themes with sufficient signal right now.
              </div>
            );
          }
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {candidates.map((s: AiRoadmapSuggestion, idx: number) => (
                <RoadmapCandidateCard key={s.themeId} suggestion={s} rank={idx + 1} r={r} />
              ))}
            </div>
          );
        })()}
      </section>
    </div>
  );
}

// ─── Alert Card ───────────────────────────────────────────────────────────────

function AlertCard({ alert, r }: { alert: TrendAlert; r: ReturnType<typeof appRoutes> }) {
  const as_ = ALERT_STYLE[alert.alertType] ?? ALERT_STYLE.VELOCITY_SPIKE;
  const urgencyDot = URGENCY_DOT[alert.urgency] ?? '🟡';

  return (
    <Link
      href={r.themeItem(alert.themeId)}
      style={{ textDecoration: 'none' }}
    >
      <div
        style={{
          ...CARD,
          borderLeft: `4px solid ${as_.border}`,
          background: as_.bg,
          padding: '0.875rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          cursor: 'pointer',
          transition: 'box-shadow 0.15s',
        }}
      >
        {/* Alert type icon */}
        <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{as_.icon}</span>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Top row: urgency dot + theme name + alert type badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem' }}>{urgencyDot}</span>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0A2540', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {alert.shortLabel ?? alert.themeName}
            </span>
            <span style={{
              fontSize: '0.65rem', fontWeight: 800,
              padding: '0.1rem 0.45rem', borderRadius: '999px',
              background: '#fff', color: as_.color, border: `1px solid ${as_.border}`,
              whiteSpace: 'nowrap',
            }}>
              {as_.label}
            </span>
            {alert.changePercent != null && (
              <span style={{
                fontSize: '0.72rem', fontWeight: 700,
                color: as_.color,
              }}>
                {alert.alertType === 'SENTIMENT_DROP'
                  ? `${alert.changePercent}% negative`
                  : `+${alert.changePercent}% WoW`}
              </span>
            )}
          </div>

          {/* Reason sentence */}
          <p style={{ fontSize: '0.8rem', color: '#475569', margin: 0, lineHeight: 1.5 }}>
            <span style={{ ...LABEL, display: 'inline', marginRight: '0.3rem' }}>Why this matters</span>
            {alert.reason}
          </p>
        </div>

        {/* CIQ badge */}
        {alert.signals.ciqScore > 0 && (
          <div style={{ flexShrink: 0, textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: as_.color, lineHeight: 1 }}>
              {alert.signals.ciqScore}
            </div>
            <div style={{ fontSize: '0.6rem', color: '#adb5bd', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              CIQ
            </div>
          </div>
        )}

        {/* Arrow */}
        <span style={{ color: as_.color, fontSize: '0.9rem', flexShrink: 0 }}>→</span>
      </div>
    </Link>
  );
}

// ─── Action Card ──────────────────────────────────────────────────────────────

function ActionCard({ item, rank, r }: { item: ActionPlanItem; rank: number; r: ReturnType<typeof appRoutes> }) {
  const [expanded, setExpanded] = useState(false);
  const pd = PRIORITY_DOT[item.priority] ?? PRIORITY_DOT.LOW;
  const as_ = ACTION_STYLE[item.recommendedAction] ?? ACTION_STYLE.MONITOR;
  const whatChanged = buildWhatChanged(item);

  return (
    <div style={{ ...CARD, borderLeft: `4px solid ${pd.border}` }}>
      {/* ── Row 1: priority dot + theme name + action badge + CTA ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Theme name line */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1rem', lineHeight: 1 }}>{pd.dot}</span>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#adb5bd' }}>#{rank}</span>
            <Link
              href={r.themeItem(item.themeId)}
              style={{ fontSize: '0.975rem', fontWeight: 700, color: '#0A2540', textDecoration: 'none' }}
            >
              {item.shortLabel ?? item.themeName}
            </Link>
            <span
              style={{
                fontSize: '0.68rem', fontWeight: 700,
                padding: '0.12rem 0.5rem', borderRadius: '999px',
                background: as_.bg, color: as_.color,
              }}
            >
              {as_.label}
            </span>
          </div>

          {/* ── Signal quality labels ── */}
          {item.signalLabels && item.signalLabels.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.6rem', paddingLeft: '1.6rem' }}>
              {item.signalLabels.map((label) => {
                const meta = SIGNAL_LABEL_META[label] ?? { bg: '#f0f4f8', color: '#475569' };
                return (
                  <span key={label} style={{
                    fontSize: '0.65rem', fontWeight: 700,
                    padding: '0.15rem 0.5rem', borderRadius: '999px',
                    background: meta.bg, color: meta.color,
                    whiteSpace: 'nowrap',
                  }}>
                    {label}
                  </span>
                );
              })}
            </div>
          )}

          {/* ── Decision language block ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingLeft: '1.6rem' }}>
            <div>
              <p style={{ ...LABEL, display: 'inline' }}>Why this matters&nbsp;</p>
              <span style={{ fontSize: '0.82rem', color: '#1e293b', lineHeight: 1.5 }}>{item.reason}</span>
            </div>
            <div>
              <p style={{ ...LABEL, display: 'inline' }}>What changed&nbsp;</p>
              <span style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>{whatChanged}</span>
            </div>
            <div>
              <p style={{ ...LABEL, display: 'inline' }}>What to do&nbsp;</p>
              <span style={{ fontSize: '0.82rem', color: as_.color, fontWeight: 600, lineHeight: 1.5 }}>{as_.label} this theme.</span>
            </div>
          </div>
        </div>

        {/* CTA button */}
        <Link
          href={r.themeItem(item.themeId)}
          style={{
            fontSize: '0.78rem', fontWeight: 700,
            padding: '0.45rem 1rem', borderRadius: '0.5rem',
            background: as_.bg, color: as_.color,
            textDecoration: 'none', border: `1px solid ${as_.color}33`,
            whiteSpace: 'nowrap', flexShrink: 0, alignSelf: 'flex-start',
          }}
        >
          {as_.cta}
        </Link>
      </div>

      {/* ── Expand toggle (score breakdown hidden by default) ── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          marginTop: '0.75rem', marginLeft: '1.6rem',
          fontSize: '0.7rem', color: '#adb5bd',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        }}
      >
        {expanded ? '▲ Hide score breakdown' : '▼ Show score breakdown'}
      </button>

      {expanded && (
        <div style={{ marginTop: '0.75rem', marginLeft: '1.6rem', background: '#f8fafc', borderRadius: '0.5rem', padding: '0.75rem 1rem', fontSize: '0.78rem', color: '#475569' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e9ecef' }}>
                <th style={{ textAlign: 'left', paddingBottom: '0.3rem', fontWeight: 700, color: '#0A2540' }}>Factor</th>
                <th style={{ textAlign: 'right', paddingBottom: '0.3rem', fontWeight: 700, color: '#0A2540' }}>Weight</th>
                <th style={{ textAlign: 'right', paddingBottom: '0.3rem', fontWeight: 700, color: '#0A2540' }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {item.drsBreakdown ? (
                <>
                  <ScoreRow label="CIQ Score"              weight={item.drsBreakdown.ciq.weight}             value={item.drsBreakdown.ciq.value} />
                  <ScoreRow label="Signal Velocity (WoW)"  weight={item.drsBreakdown.velocity.weight}        value={item.drsBreakdown.velocity.value} />
                  <ScoreRow label="Recency"                weight={item.drsBreakdown.recency.weight}         value={item.drsBreakdown.recency.value} />
                  <ScoreRow label="Resurfacing bonus"      weight={item.drsBreakdown.resurfacing.weight}     value={item.drsBreakdown.resurfacing.value} />
                  <ScoreRow label="Source diversity"       weight={item.drsBreakdown.sourceDiversity.weight} value={item.drsBreakdown.sourceDiversity.value} />
                  <ScoreRow label="AI confidence"          weight={item.drsBreakdown.aiConfidence.weight}    value={item.drsBreakdown.aiConfidence.value} />
                  {item.drsBreakdown.penalties && (
                    <tr>
                      <td colSpan={3} style={{ padding: '0.22rem 0', color: '#c2410c', fontSize: '0.72rem' }}>
                        ⚠ Penalties applied: {item.drsBreakdown.penalties}
                      </td>
                    </tr>
                  )}
                </>
              ) : (
                <>
                  <ScoreRow label="CIQ Score"              weight="30%" value={`${item.ciqScore}/100`} />
                  <ScoreRow label="Signal Velocity (WoW)"  weight="20%" value={item.signals.trendDelta != null ? `${item.signals.trendDelta > 0 ? '+' : ''}${Math.round(item.signals.trendDelta)}%` : 'n/a'} />
                  <ScoreRow label="Recency"                weight="18%" value={item.signals.lastEvidenceAt ? new Date(item.signals.lastEvidenceAt).toLocaleDateString() : 'n/a'} />
                  <ScoreRow label="Resurfacing bonus"      weight="15%" value={item.signals.resurfaceCount > 0 ? `×${item.signals.resurfaceCount}` : 'none'} />
                </>
              )}
              <tr style={{ borderTop: '1px solid #e9ecef' }}>
                <td style={{ paddingTop: '0.3rem', fontWeight: 700, color: '#0A2540' }}>Decision Ranking Score</td>
                <td />
                <td style={{ paddingTop: '0.3rem', fontWeight: 700, color: '#0A2540', textAlign: 'right' }}>{item.decisionPriorityScore}/100</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ScoreRow({ label, weight, value }: { label: string; weight: string; value: string }) {
  return (
    <tr>
      <td style={{ padding: '0.22rem 0', color: '#475569' }}>{label}</td>
      <td style={{ padding: '0.22rem 0', textAlign: 'right', color: '#adb5bd' }}>{weight}</td>
      <td style={{ padding: '0.22rem 0', textAlign: 'right', fontWeight: 600, color: '#0A2540' }}>{value}</td>
    </tr>
  );
}

// ─── Roadmap Candidate Card ───────────────────────────────────────────────────

function RoadmapCandidateCard({
  suggestion,
  rank,
  r,
}: {
  suggestion: AiRoadmapSuggestion;
  rank: number;
  r: ReturnType<typeof appRoutes>;
}) {
  const confColor =
    suggestion.confidence === 'HIGH' ? '#15803d'
    : suggestion.confidence === 'MEDIUM' ? '#a16207'
    : '#6C757D';
  const confBg =
    suggestion.confidence === 'HIGH' ? '#f0fdf4'
    : suggestion.confidence === 'MEDIUM' ? '#fefce8'
    : '#f8fafc';

  return (
    <Link
      href={r.themeItem(suggestion.themeId)}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <div
        style={{
          ...CARD,
          display: 'flex',
          alignItems: 'flex-start',
          gap: '1rem',
          cursor: 'pointer',
          transition: 'box-shadow 0.15s',
          borderLeft: '3px solid #7c3aed',
        }}
      >
        {/* Rank */}
        <div style={{
          minWidth: '1.75rem', height: '1.75rem',
          borderRadius: '50%', background: '#ede9fe',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.72rem', fontWeight: 800, color: '#7c3aed', flexShrink: 0,
        }}>
          #{rank}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Theme name + confidence badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0A2540' }}>
              {suggestion.themeTitle}
            </span>
            <span style={{
              fontSize: '0.68rem', fontWeight: 700,
              padding: '0.1rem 0.45rem', borderRadius: '999px',
              background: confBg, color: confColor,
            }}>
              {suggestion.confidence} confidence
            </span>
            {suggestion.dominantDriver && (
              <span style={{
                fontSize: '0.68rem', fontWeight: 600,
                padding: '0.1rem 0.45rem', borderRadius: '999px',
                background: '#f0f4f8', color: '#475569',
              }}>
                {suggestion.dominantDriver}
              </span>
            )}
          </div>

          {/* Why this matters */}
          <div style={{ marginBottom: '0.2rem' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: '#adb5bd' }}>Why this matters&nbsp;</span>
            <span style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>{suggestion.reason}</span>
          </div>

          {/* Confidence explanation */}
          {suggestion.confidenceExplanation && (
            <div>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: '#adb5bd' }}>Confidence&nbsp;</span>
              <span style={{ fontSize: '0.78rem', color: '#6C757D', lineHeight: 1.5 }}>{suggestion.confidenceExplanation}</span>
            </div>
          )}
        </div>

        {/* RPS score + CTA */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem', flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#adb5bd', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>RPS</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#7c3aed' }}>
              {Math.round(suggestion.roadmapPriorityScore)}
            </div>
          </div>
          <span style={{
            fontSize: '0.72rem', fontWeight: 700,
            padding: '0.3rem 0.75rem', borderRadius: '0.4rem',
            background: '#7c3aed', color: '#fff',
            whiteSpace: 'nowrap',
          }}>
            + Add to Roadmap →
          </span>
        </div>
      </div>
    </Link>
  );
}

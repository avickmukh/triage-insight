'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { appRoutes } from '@/lib/routes';
import type { ActionPlanItem, ActionPriority, ActionType } from '@/lib/api-types';

// ─── Colour maps ──────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<ActionPriority, { bg: string; color: string; border: string }> = {
  CRITICAL: { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  HIGH:     { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  MEDIUM:   { bg: '#fefce8', color: '#a16207', border: '#fde68a' },
  LOW:      { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
};

const ACTION_COLORS: Record<ActionType, { bg: string; color: string; label: string }> = {
  ADD_TO_ROADMAP:    { bg: '#ede9fe', color: '#7c3aed', label: 'Add to Roadmap' },
  INCREASE_PRIORITY: { bg: '#fef3c7', color: '#b45309', label: 'Increase Priority' },
  INVESTIGATE:       { bg: '#fce7f3', color: '#9d174d', label: 'Investigate' },
  MONITOR:           { bg: '#f0f4f8', color: '#475569', label: 'Monitor' },
};

const CARD: React.CSSProperties = {
  background: '#fff',
  borderRadius: '0.75rem',
  border: '1px solid #e9ecef',
  padding: '1.5rem',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ActionPlanPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const r = appRoutes(orgSlug);

  const { data, isLoading, error } = useQuery({
    queryKey: ['action-plan', orgSlug],
    queryFn: () => apiClient.prioritization.getActionPlan(orgSlug),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ height: '2rem', width: '14rem', borderRadius: '0.5rem', background: 'linear-gradient(90deg, #f0f4f8 25%, #e9ecef 50%, #f0f4f8 75%)', backgroundSize: '200% 100%', marginBottom: '2rem' }} />
        {[1, 2, 3].map((n) => (
          <div key={n} style={{ ...CARD, marginBottom: '1rem', height: '7rem', background: 'linear-gradient(90deg, #f0f4f8 25%, #e9ecef 50%, #f0f4f8 75%)', backgroundSize: '200% 100%' }} />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ ...CARD, textAlign: 'center', color: '#6C757D' }}>
          <p style={{ fontSize: '1rem', fontWeight: 600 }}>Could not load action plan.</p>
          <p style={{ fontSize: '0.875rem' }}>Ensure themes have been scored by the CIQ engine at least once.</p>
        </div>
      </div>
    );
  }

  const generatedAt = new Date(data.generatedAt).toLocaleString();

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0A2540', margin: 0 }}>
              Weekly Action Plan
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#6C757D', marginTop: '0.25rem' }}>
              Top {data.items.length} themes ranked by Decision Priority Score (CIQ · velocity · recency · resurfacing)
            </p>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#adb5bd' }}>Generated {generatedAt}</span>
        </div>
      </div>

      {/* Empty state */}
      {data.items.length === 0 && (
        <div style={{ ...CARD, textAlign: 'center', color: '#6C757D', padding: '3rem' }}>
          <p style={{ fontSize: '1rem', fontWeight: 600 }}>No themes to act on yet.</p>
          <p style={{ fontSize: '0.875rem' }}>Upload feedback or run the AI pipeline to generate themes.</p>
        </div>
      )}

      {/* Action items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {data.items.map((item: ActionPlanItem, idx: number) => (
          <ActionCard key={item.themeId} item={item} rank={idx + 1} r={r} />
        ))}
      </div>
    </div>
  );
}

// ─── Action Card ──────────────────────────────────────────────────────────────

function ActionCard({ item, rank, r }: { item: ActionPlanItem; rank: number; r: ReturnType<typeof appRoutes> }) {
  const [expanded, setExpanded] = useState(false);
  const pc = PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.LOW;
  const ac = ACTION_COLORS[item.recommendedAction] ?? ACTION_COLORS.MONITOR;

  return (
    <div style={{ ...CARD, borderLeft: `4px solid ${pc.border}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        {/* Left: rank + name */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#adb5bd', minWidth: '1.2rem' }}>#{rank}</span>
            <Link
              href={r.themeItem(item.themeId)}
              style={{ fontSize: '1rem', fontWeight: 700, color: '#0A2540', textDecoration: 'none' }}
            >
              {item.shortLabel ?? item.themeName}
            </Link>
            {/* Priority badge */}
            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.12rem 0.5rem', borderRadius: '999px', background: pc.bg, color: pc.color, border: `1px solid ${pc.border}` }}>
              {item.priority}
            </span>
            {/* Action badge */}
            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.12rem 0.5rem', borderRadius: '999px', background: ac.bg, color: ac.color }}>
              {ac.label}
            </span>
          </div>

          {/* Reason */}
          <p style={{ fontSize: '0.82rem', color: '#475569', margin: '0 0 0.5rem 1.8rem', lineHeight: 1.5 }}>
            {item.reason}
          </p>

          {/* Signal pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginLeft: '1.8rem' }}>
            {item.signals.feedbackCount > 0 && (
              <Pill label={`${item.signals.feedbackCount} feedback`} bg="#e8f7f7" color="#20A4A4" />
            )}
            {item.signals.supportCount > 0 && (
              <Pill label={`${item.signals.supportCount} support`} bg="#fff7ed" color="#c2410c" />
            )}
            {item.signals.voiceCount > 0 && (
              <Pill label={`${item.signals.voiceCount} voice`} bg="#fce7f3" color="#9d174d" />
            )}
            {item.signals.surveyCount > 0 && (
              <Pill label={`${item.signals.surveyCount} survey`} bg="#ede9fe" color="#7c3aed" />
            )}
            {item.signals.trendDelta !== null && item.signals.trendDelta > 10 && (
              <Pill label={`+${Math.round(item.signals.trendDelta)}% WoW`} bg="#f0fdf4" color="#15803d" />
            )}
            {item.signals.trendDelta !== null && item.signals.trendDelta < -10 && (
              <Pill label={`${Math.round(item.signals.trendDelta)}% WoW`} bg="#fef2f2" color="#b91c1c" />
            )}
            {item.signals.resurfaceCount > 0 && (
              <Pill label={`Resurfaced ×${item.signals.resurfaceCount}`} bg="#fef3c7" color="#b45309" />
            )}
          </div>
        </div>

        {/* Right: scores + CTA */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem', flexShrink: 0 }}>
          {/* DPS gauge */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0A2540', lineHeight: 1 }}>
              {item.decisionPriorityScore}
            </div>
            <div style={{ fontSize: '0.65rem', color: '#adb5bd', fontWeight: 600 }}>DPS</div>
          </div>
          {/* CIQ score */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#20A4A4', lineHeight: 1 }}>
              {item.ciqScore}
            </div>
            <div style={{ fontSize: '0.65rem', color: '#adb5bd', fontWeight: 600 }}>CIQ</div>
          </div>
          {/* CTA */}
          <Link
            href={r.themeItem(item.themeId)}
            style={{
              fontSize: '0.78rem',
              fontWeight: 700,
              padding: '0.4rem 0.9rem',
              borderRadius: '0.5rem',
              background: ac.bg,
              color: ac.color,
              textDecoration: 'none',
              border: `1px solid ${ac.color}22`,
              whiteSpace: 'nowrap',
            }}
          >
            {ac.label} →
          </Link>
        </div>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{ marginTop: '0.75rem', marginLeft: '1.8rem', fontSize: '0.72rem', color: '#adb5bd', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        {expanded ? '▲ Hide details' : '▼ Show score breakdown'}
      </button>

      {expanded && (
        <div style={{ marginTop: '0.75rem', marginLeft: '1.8rem', background: '#f8fafc', borderRadius: '0.5rem', padding: '0.75rem 1rem', fontSize: '0.78rem', color: '#475569' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e9ecef' }}>
                <th style={{ textAlign: 'left', paddingBottom: '0.35rem', fontWeight: 700, color: '#0A2540' }}>Factor</th>
                <th style={{ textAlign: 'right', paddingBottom: '0.35rem', fontWeight: 700, color: '#0A2540' }}>Weight</th>
                <th style={{ textAlign: 'right', paddingBottom: '0.35rem', fontWeight: 700, color: '#0A2540' }}>Value</th>
              </tr>
            </thead>
            <tbody>
              <ScoreRow label="CIQ Score" weight="35%" value={`${item.ciqScore}/100`} />
              <ScoreRow label="Signal Velocity (WoW)" weight="25%" value={item.signals.trendDelta !== null ? `${item.signals.trendDelta > 0 ? '+' : ''}${Math.round(item.signals.trendDelta)}%` : 'n/a'} />
              <ScoreRow label="Recency (last evidence)" weight="20%" value={item.signals.lastEvidenceAt ? new Date(item.signals.lastEvidenceAt).toLocaleDateString() : 'n/a'} />
              <ScoreRow label="Resurfacing bonus" weight="20%" value={item.signals.resurfaceCount > 0 ? `×${item.signals.resurfaceCount}` : 'none'} />
              <tr style={{ borderTop: '1px solid #e9ecef' }}>
                <td style={{ paddingTop: '0.35rem', fontWeight: 700, color: '#0A2540' }}>Decision Priority Score</td>
                <td />
                <td style={{ paddingTop: '0.35rem', fontWeight: 700, color: '#0A2540', textAlign: 'right' }}>{item.decisionPriorityScore}/100</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Pill({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '0.1rem 0.45rem', borderRadius: '999px', background: bg, color }}>
      {label}
    </span>
  );
}

function ScoreRow({ label, weight, value }: { label: string; weight: string; value: string }) {
  return (
    <tr>
      <td style={{ padding: '0.25rem 0', color: '#475569' }}>{label}</td>
      <td style={{ padding: '0.25rem 0', textAlign: 'right', color: '#adb5bd' }}>{weight}</td>
      <td style={{ padding: '0.25rem 0', textAlign: 'right', fontWeight: 600, color: '#0A2540' }}>{value}</td>
    </tr>
  );
}

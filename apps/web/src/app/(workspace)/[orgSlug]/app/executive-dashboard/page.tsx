'use client';

/**
 * Executive Decision Dashboard
 *
 * Single scrollable page with five decision-grade sections:
 *   1. 🔥 Top Problems        — top 5 themes by CIQ score
 *   2. 🚨 Rising Issues       — top 5 themes with fastest positive velocity
 *   3. 📉 What Is Declining   — top 5 themes with steepest negative velocity
 *   4. 🧠 Recommended Actions — top 5 themes by Decision Priority Score
 *   5. 💰 Revenue Impact      — top 5 themes by ARR exposure
 *
 * Every item: theme name · CIQ score · deterministic reason · action badge
 */

import React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { appRoutes } from '@/lib/routes';
import type { ExecDashboardItem, ExecActionType, ExecutiveDashboardResponse } from '@/lib/api-types';

// ─── Design tokens ────────────────────────────────────────────────────────────

const ACTION_META: Record<ExecActionType, { label: string; bg: string; color: string; icon: string }> = {
  ADD_TO_ROADMAP:    { label: 'Add to Roadmap',    bg: '#ede9fe', color: '#7c3aed', icon: '🗺️' },
  INCREASE_PRIORITY: { label: 'Increase Priority', bg: '#fef3c7', color: '#b45309', icon: '↑' },
  INVESTIGATE:       { label: 'Investigate',        bg: '#fce7f3', color: '#9d174d', icon: '🔍' },
  MONITOR:           { label: 'Monitor',            bg: '#f0f4f8', color: '#475569', icon: '👁' },
  WATCH_DECLINE:     { label: 'Watch Decline',      bg: '#fef2f2', color: '#b91c1c', icon: '📉' },
};

const SECTION_META: Array<{
  key: keyof Omit<ExecutiveDashboardResponse, 'generatedAt'>;
  icon: string;
  title: string;
  subtitle: string;
  accentColor: string;
  accentBg: string;
  borderColor: string;
}> = [
  {
    key: 'topProblems',
    icon: '🔥',
    title: 'Top Problems',
    subtitle: 'Highest CIQ score — these themes have the most signal, customer impact, and urgency.',
    accentColor: '#b91c1c',
    accentBg: '#fef2f2',
    borderColor: '#fecaca',
  },
  {
    key: 'risingIssues',
    icon: '🚨',
    title: 'Rising Issues',
    subtitle: 'Fastest-growing signal velocity week-over-week — act before they become top problems.',
    accentColor: '#c2410c',
    accentBg: '#fff7ed',
    borderColor: '#fed7aa',
  },
  {
    key: 'decliningThemes',
    icon: '📉',
    title: 'What Is Declining',
    subtitle: 'Themes losing signal volume — monitor for resolution or re-emergence.',
    accentColor: '#0369a1',
    accentBg: '#f0f9ff',
    borderColor: '#bae6fd',
  },
  {
    key: 'recommendedActions',
    icon: '🧠',
    title: 'Recommended Actions',
    subtitle: 'Ranked by Decision Priority Score (CIQ + velocity + recency + resurfacing) — act on these first.',
    accentColor: '#7c3aed',
    accentBg: '#ede9fe',
    borderColor: '#c4b5fd',
  },
  {
    key: 'revenueImpact',
    icon: '💰',
    title: 'Revenue Impact Themes',
    subtitle: 'Highest ARR exposure — resolving these directly protects or expands revenue.',
    accentColor: '#15803d',
    accentBg: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
];

const CARD: React.CSSProperties = {
  background: '#fff',
  borderRadius: '0.75rem',
  border: '1px solid #e9ecef',
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
  fontSize: '0.67rem',
  fontWeight: 800,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  color: '#adb5bd',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatArr(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function ciqColor(score: number): string {
  if (score >= 75) return '#b91c1c';
  if (score >= 50) return '#c2410c';
  if (score >= 30) return '#a16207';
  return '#15803d';
}

// ─── Item card ────────────────────────────────────────────────────────────────

function ItemCard({
  item,
  rank,
  accentColor,
  r,
}: {
  item: ExecDashboardItem;
  rank: number;
  accentColor: string;
  r: ReturnType<typeof appRoutes>;
}) {
  const am = ACTION_META[item.action] ?? ACTION_META.MONITOR;
  const cColor = ciqColor(item.ciqScore);

  return (
    <Link href={r.themeItem(item.themeId)} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div
        style={{
          ...CARD,
          borderLeft: `4px solid ${accentColor}`,
          padding: '1rem 1.25rem',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '1rem',
          cursor: 'pointer',
          transition: 'box-shadow 0.15s',
        }}
      >
        {/* Rank badge */}
        <div
          style={{
            minWidth: '1.75rem',
            height: '1.75rem',
            borderRadius: '50%',
            background: '#f0f4f8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.72rem',
            fontWeight: 800,
            color: '#475569',
            flexShrink: 0,
            marginTop: '0.1rem',
          }}
        >
          #{rank}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Theme name + action badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flexWrap: 'wrap',
              marginBottom: '0.5rem',
            }}
          >
            <span
              style={{
                fontSize: '0.95rem',
                fontWeight: 700,
                color: '#0A2540',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.shortLabel ?? item.themeName}
            </span>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '0.1rem 0.45rem',
                borderRadius: '999px',
                background: am.bg,
                color: am.color,
                whiteSpace: 'nowrap',
              }}
            >
              {am.icon} {am.label}
            </span>
          </div>

          {/* Decision language: Why this matters */}
          <div style={{ marginBottom: '0.35rem' }}>
            <span style={{ ...LABEL, marginRight: '0.3rem' }}>Why this matters</span>
            <span style={{ fontSize: '0.82rem', color: '#1e293b', lineHeight: 1.5 }}>
              {item.reason}
            </span>
          </div>

          {/* What to do */}
          <div>
            <span style={{ ...LABEL, marginRight: '0.3rem' }}>What to do</span>
            <span style={{ fontSize: '0.82rem', color: am.color, fontWeight: 600, lineHeight: 1.5 }}>
              {am.label} this theme.
            </span>
          </div>

          {/* Signal quality labels */}
          {item.signalLabels && item.signalLabels.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.5rem', marginBottom: '0.25rem' }}>
              {item.signalLabels.map((lbl) => {
                const meta = SIGNAL_LABEL_META[lbl] ?? { bg: '#f0f4f8', color: '#475569' };
                return (
                  <span key={lbl} style={{
                    fontSize: '0.63rem', fontWeight: 700,
                    padding: '0.12rem 0.45rem', borderRadius: '999px',
                    background: meta.bg, color: meta.color,
                    whiteSpace: 'nowrap',
                  }}>
                    {lbl}
                  </span>
                );
              })}
            </div>
          )}

          {/* Signal pills row */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.4rem',
              marginTop: '0.6rem',
            }}
          >
            {item.signals.totalSignalCount > 0 && (
              <Pill label={`${item.signals.totalSignalCount} signals`} />
            )}
            {item.signals.trendDelta != null && Math.abs(item.signals.trendDelta) >= 5 && (
              <Pill
                label={`${item.signals.trendDelta > 0 ? '+' : ''}${Math.round(item.signals.trendDelta)}% WoW`}
                color={item.signals.trendDelta > 0 ? '#c2410c' : '#0369a1'}
                bg={item.signals.trendDelta > 0 ? '#fff7ed' : '#f0f9ff'}
              />
            )}
            {item.signals.resurfaceCount > 0 && (
              <Pill label={`🔄 Resurfaced ×${item.signals.resurfaceCount}`} color="#9d174d" bg="#fce7f3" />
            )}
            {(item.signals.revenueInfluence ?? 0) > 0 && (
              <Pill
                label={`${formatArr(item.signals.revenueInfluence!)} ARR`}
                color="#15803d"
                bg="#f0fdf4"
              />
            )}
            {item.signals.negativePct != null && item.signals.negativePct >= 0.4 && (
              <Pill
                label={`${Math.round(item.signals.negativePct * 100)}% negative`}
                color="#b91c1c"
                bg="#fef2f2"
              />
            )}
          </div>
        </div>

        {/* CIQ score badge */}
        <div style={{ flexShrink: 0, textAlign: 'center', minWidth: '2.5rem' }}>
          <div
            style={{
              fontSize: '1.35rem',
              fontWeight: 800,
              color: cColor,
              lineHeight: 1,
            }}
          >
            {item.ciqScore}
          </div>
          <div
            style={{
              fontSize: '0.58rem',
              color: '#adb5bd',
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            CIQ
          </div>
        </div>

        {/* Arrow */}
        <span style={{ color: accentColor, fontSize: '0.9rem', flexShrink: 0, marginTop: '0.2rem' }}>
          →
        </span>
      </div>
    </Link>
  );
}

function Pill({
  label,
  color = '#475569',
  bg = '#f0f4f8',
}: {
  label: string;
  color?: string;
  bg?: string;
}) {
  return (
    <span
      style={{
        fontSize: '0.68rem',
        fontWeight: 600,
        padding: '0.1rem 0.5rem',
        borderRadius: '999px',
        background: bg,
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  subtitle,
  items,
  accentColor,
  accentBg,
  borderColor,
  r,
}: {
  icon: string;
  title: string;
  subtitle: string;
  items: ExecDashboardItem[];
  accentColor: string;
  accentBg: string;
  borderColor: string;
  r: ReturnType<typeof appRoutes>;
}) {
  return (
    <section style={{ marginBottom: '2.5rem' }}>
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.625rem',
          marginBottom: '0.75rem',
          padding: '0.75rem 1rem',
          background: accentBg,
          borderRadius: '0.625rem',
          border: `1px solid ${borderColor}`,
        }}
      >
        <span style={{ fontSize: '1.25rem', lineHeight: 1, flexShrink: 0 }}>{icon}</span>
        <div>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0A2540', margin: '0 0 0.2rem' }}>
            {title}
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#475569', margin: 0, lineHeight: 1.5 }}>
            {subtitle}
          </p>
        </div>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: '0.68rem',
            fontWeight: 800,
            padding: '0.15rem 0.55rem',
            borderRadius: '999px',
            background: '#fff',
            color: accentColor,
            border: `1px solid ${borderColor}`,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            alignSelf: 'center',
          }}
        >
          {items.length} theme{items.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <div
          style={{
            ...CARD,
            padding: '1.25rem',
            textAlign: 'center',
            color: '#6C757D',
            fontSize: '0.875rem',
          }}
        >
          No themes in this section right now.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {items.map((item, idx) => (
            <ItemCard
              key={item.themeId}
              item={item}
              rank={idx + 1}
              accentColor={accentColor}
              r={r}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header skeleton */}
      <div
        style={{
          height: '2rem',
          width: '18rem',
          borderRadius: '0.5rem',
          background: '#f0f4f8',
          marginBottom: '0.5rem',
        }}
      />
      <div
        style={{
          height: '1rem',
          width: '28rem',
          borderRadius: '0.5rem',
          background: '#f0f4f8',
          marginBottom: '2rem',
        }}
      />
      {[1, 2, 3, 4, 5].map((n) => (
        <div key={n} style={{ marginBottom: '2rem' }}>
          <div
            style={{
              height: '3.5rem',
              borderRadius: '0.625rem',
              background: '#f8fafc',
              marginBottom: '0.625rem',
            }}
          />
          {[1, 2, 3].map((m) => (
            <div
              key={m}
              style={{
                height: '5rem',
                borderRadius: '0.75rem',
                background: '#f8fafc',
                marginBottom: '0.5rem',
                border: '1px solid #e9ecef',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExecutiveDashboardPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const r = appRoutes(orgSlug);

  const { data, isLoading, error } = useQuery({
    queryKey: ['executive-dashboard', orgSlug],
    queryFn: () => apiClient.prioritization.getExecutiveDashboard(orgSlug),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <Skeleton />;

  if (error || !data) {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div
          style={{
            ...CARD,
            padding: '2.5rem',
            textAlign: 'center',
            color: '#6C757D',
          }}
        >
          <p style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
            Could not load the Executive Dashboard.
          </p>
          <p style={{ fontSize: '0.875rem', margin: 0 }}>
            Ensure themes have been scored by the CIQ engine at least once.
          </p>
        </div>
      </div>
    );
  }

  const totalThemes =
    data.topProblems.length +
    data.risingIssues.length +
    data.decliningThemes.length +
    data.recommendedActions.length +
    data.revenueImpact.length;

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0A2540', margin: 0 }}>
            Executive Decision Dashboard
          </h1>
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 800,
              padding: '0.15rem 0.55rem',
              borderRadius: '999px',
              background: '#f0f4f8',
              color: '#475569',
              border: '1px solid #e9ecef',
            }}
          >
            {totalThemes} signals
          </span>
        </div>
        <p style={{ fontSize: '0.875rem', color: '#6C757D', margin: '0 0 0.25rem' }}>
          <strong>Decision-grade intelligence for leadership.</strong> Grouped by Top Problems, Rising Issues, Revenue Impact, and Recommended Actions. Every reason is derived directly from your data — no hallucination.
        </p>
        <p style={{ fontSize: '0.8rem', color: '#6C757D', margin: '0.2rem 0 0' }}>
          For a weekly narrative digest, see{' '}
          <a href="../digest" style={{ color: '#20A4A4', textDecoration: 'underline', fontWeight: 600 }}>Weekly AI Digest</a>.
        </p>
        <p style={{ fontSize: '0.75rem', color: '#adb5bd', margin: 0 }}>
          Generated {new Date(data.generatedAt).toLocaleString()} · Scores: CIQ (0–100) · Actions: 🔴 High / 🟡 Medium / 🟢 Low
        </p>
      </div>

      {/* ── Jump links ── */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
          marginBottom: '2rem',
          padding: '0.75rem 1rem',
          background: '#f8fafc',
          borderRadius: '0.625rem',
          border: '1px solid #e9ecef',
        }}
      >
        {SECTION_META.map((s) => (
          <a
            key={s.key}
            href={`#section-${s.key}`}
            style={{
              fontSize: '0.78rem',
              fontWeight: 600,
              padding: '0.25rem 0.75rem',
              borderRadius: '999px',
              background: s.accentBg,
              color: s.accentColor,
              textDecoration: 'none',
              border: `1px solid ${s.borderColor}`,
              whiteSpace: 'nowrap',
            }}
          >
            {s.icon} {s.title}
          </a>
        ))}
      </div>

      {/* ── Five sections ── */}
      {SECTION_META.map((s) => (
        <div key={s.key} id={`section-${s.key}`}>
          <Section
            icon={s.icon}
            title={s.title}
            subtitle={s.subtitle}
            items={(data[s.key] as ExecDashboardItem[])}
            accentColor={s.accentColor}
            accentBg={s.accentBg}
            borderColor={s.borderColor}
            r={r}
          />
        </div>
      ))}

      {/* ── Footer ── */}
      <div
        style={{
          marginTop: '1rem',
          padding: '1rem 1.25rem',
          background: '#f8fafc',
          borderRadius: '0.625rem',
          border: '1px solid #e9ecef',
          fontSize: '0.78rem',
          color: '#6C757D',
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: '#0A2540' }}>Score methodology</strong>
        {' '}· CIQ (Customer Intelligence Quotient) is a composite of 14+ factors including signal
        frequency, source diversity, ARR exposure, sentiment, velocity, and recency.
        Decision Priority Score (DPS) = 35% CIQ + 25% velocity + 20% recency + 20% resurfacing bonus.
        All reasons are deterministic — built from database values, not AI-generated text.
        {' '}
        <Link href={r.actionPlan} style={{ color: '#7c3aed', fontWeight: 600 }}>
          View Weekly Action Plan →
        </Link>
      </div>
    </div>
  );
}

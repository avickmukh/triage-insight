'use client';
/**
 * Enterprise Reports Page
 *
 * Provides executive-level product intelligence across 5 dimensions:
 *  1. Executive Summary Cards
 *  2. Theme Trends (CIQ + priority)
 *  3. Priority Distribution (CIQ score buckets)
 *  4. Revenue Impact (top themes by ARR influence)
 *  5. Roadmap Progress (by status)
 *  6. Feedback Volume (daily series)
 *
 * All data is workspace-scoped and fetched from real backend aggregation endpoints.
 * Export actions stream CSV or JSON files directly from the API.
 */
import { useState, useMemo } from 'react';
import { useWorkspace } from '@/hooks/use-workspace';
import {
  useThemeTrendsReport,
  usePriorityDistributionReport,
  useRevenueImpactReport,
  useRoadmapProgressReport,
  useFeedbackVolumeReport,
  type ReportDateFilter,
} from '@/hooks/use-reports';
import apiClient from '@/lib/api-client';

// ─── Design tokens (consistent with existing admin pages) ─────────────────────

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
  color: '#0A2540',
  margin: '0 0 1rem 0',
};

const LABEL: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 600,
  color: '#6C757D',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const BTN_PRIMARY: React.CSSProperties = {
  background: '#0A2540',
  color: '#fff',
  border: 'none',
  borderRadius: '0.5rem',
  padding: '0.45rem 1rem',
  fontSize: '0.82rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const BTN_SECONDARY: React.CSSProperties = {
  background: '#fff',
  color: '#0A2540',
  border: '1px solid #dee2e6',
  borderRadius: '0.5rem',
  padding: '0.45rem 1rem',
  fontSize: '0.82rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const BTN_EXPORT: React.CSSProperties = {
  background: '#f0fafa',
  color: '#20A4A4',
  border: '1px solid #b2e4e4',
  borderRadius: '0.5rem',
  padding: '0.35rem 0.75rem',
  fontSize: '0.78rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const SKELETON_LINE: React.CSSProperties = {
  height: '0.75rem',
  background: '#e9ecef',
  borderRadius: '0.25rem',
  marginBottom: '0.5rem',
};

// ─── Skeleton shimmer ─────────────────────────────────────────────────────────

function SkeletonCard({ lines = 4 }: { lines?: number }) {
  return (
    <div style={CARD}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          style={{ ...SKELETON_LINE, width: i % 2 === 0 ? '80%' : '55%' }}
        />
      ))}
    </div>
  );
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({
  value,
  max = 100,
  color = '#20A4A4',
}: {
  value: number;
  max?: number;
  color?: string;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div
        style={{
          flex: 1,
          height: 6,
          background: '#e9ecef',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            borderRadius: 3,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
      <span
        style={{ fontSize: '0.72rem', fontWeight: 700, color, minWidth: 28, textAlign: 'right' }}
      >
        {Math.round(value)}
      </span>
    </div>
  );
}

// ─── Inline bar chart (SVG) ───────────────────────────────────────────────────

function BarChart({
  data,
  color = '#20A4A4',
  height = 80,
}: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#adb5bd',
          fontSize: '0.8rem',
        }}
      >
        No data
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  const barW = Math.floor(300 / data.length) - 4;
  return (
    <svg
      viewBox={`0 0 300 ${height + 20}`}
      style={{ width: '100%', height: height + 20 }}
      aria-label="Bar chart"
    >
      {data.map((d, i) => {
        const barH = Math.max(2, Math.round((d.value / max) * height));
        const x = i * (barW + 4) + 2;
        const y = height - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} fill={color} rx={2} opacity={0.85} />
            <text
              x={x + barW / 2}
              y={height + 14}
              textAnchor="middle"
              fontSize={9}
              fill="#6C757D"
            >
              {d.label.length > 8 ? d.label.slice(0, 7) + '…' : d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Inline sparkline (SVG) ───────────────────────────────────────────────────

function Sparkline({
  values,
  color = '#20A4A4',
  height = 40,
}: {
  values: number[];
  color?: string;
  height?: number;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const w = 200;
  const step = w / (values.length - 1);
  const pts = values
    .map((v, i) => `${i * step},${height - (v / max) * (height - 4)}`)
    .join(' ');
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      style={{ width: '100%', height }}
      aria-label="Sparkline"
    >
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
    </svg>
  );
}

// ─── Export button with auth token ───────────────────────────────────────────

function ExportButton({
  workspaceId,
  report,
  format,
  filter,
  label,
}: {
  workspaceId: string;
  report: string;
  format: 'csv' | 'json';
  filter?: ReportDateFilter;
  label: string;
}) {
  const handleExport = () => {
    const url = apiClient.reports.exportUrl(workspaceId, report, format, filter);
    // Open in same tab — browser will download the file
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  return (
    <button style={BTN_EXPORT} onClick={handleExport}>
      {label}
    </button>
  );
}

// ─── Date range filter bar ────────────────────────────────────────────────────

function DateRangeFilter({
  filter,
  onChange,
}: {
  filter: ReportDateFilter;
  onChange: (f: ReportDateFilter) => void;
}) {
  const presets = [
    { label: '7d',  days: 7 },
    { label: '30d', days: 30 },
    { label: '90d', days: 90 },
    { label: 'All', days: 0 },
  ];
  const setPreset = (days: number) => {
    if (days === 0) {
      onChange({});
      return;
    }
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    onChange({
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    });
  };
  const isActive = (days: number) => {
    if (days === 0) return !filter.from && !filter.to;
    if (!filter.from) return false;
    const diff = Math.round(
      (new Date().getTime() - new Date(filter.from).getTime()) / 86400000,
    );
    return diff === days;
  };
  return (
    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={LABEL}>Range:</span>
      {presets.map((p) => (
        <button
          key={p.label}
          style={{
            ...BTN_SECONDARY,
            padding: '0.25rem 0.6rem',
            fontSize: '0.75rem',
            background: isActive(p.days) ? '#0A2540' : '#fff',
            color: isActive(p.days) ? '#fff' : '#0A2540',
          }}
          onClick={() => setPreset(p.days)}
        >
          {p.label}
        </button>
      ))}
      <input
        type="date"
        value={filter.from ?? ''}
        onChange={(e) => onChange({ ...filter, from: e.target.value || undefined })}
        style={{ fontSize: '0.78rem', border: '1px solid #dee2e6', borderRadius: '0.4rem', padding: '0.25rem 0.4rem' }}
      />
      <span style={{ color: '#adb5bd', fontSize: '0.8rem' }}>–</span>
      <input
        type="date"
        value={filter.to ?? ''}
        onChange={(e) => onChange({ ...filter, to: e.target.value || undefined })}
        style={{ fontSize: '0.78rem', border: '1px solid #dee2e6', borderRadius: '0.4rem', padding: '0.25rem 0.4rem' }}
      />
    </div>
  );
}

// ─── Executive Summary Cards ──────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        ...CARD,
        padding: '1.25rem',
        borderLeft: `4px solid ${accent ?? '#20A4A4'}`,
      }}
    >
      <p style={{ ...LABEL, margin: '0 0 0.4rem 0' }}>{label}</p>
      <p
        style={{
          fontSize: '1.75rem',
          fontWeight: 800,
          color: '#0A2540',
          margin: 0,
          lineHeight: 1.1,
        }}
      >
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: '0.75rem', color: '#6C757D', margin: '0.25rem 0 0 0' }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';

  const [filter, setFilter] = useState<ReportDateFilter>({});

  const { data: themeTrends, isLoading: loadingThemes } = useThemeTrendsReport(filter, 15);
  const { data: priorityDist, isLoading: loadingPriority } = usePriorityDistributionReport(filter);
  const { data: revenueImpact, isLoading: loadingRevenue } = useRevenueImpactReport(filter, 10);
  const { data: roadmapProgress, isLoading: loadingRoadmap } = useRoadmapProgressReport(filter);
  const { data: feedbackVolume, isLoading: loadingVolume } = useFeedbackVolumeReport(filter);

  // ── Derived summary values ─────────────────────────────────────────────────
  const totalFeedback = feedbackVolume?.totalFeedback ?? 0;
  const avgCiqScore = priorityDist?.avgCiqScore ?? 0;
  const totalArrInfluenced = revenueImpact?.totalArrInfluenced ?? 0;
  const shippedFraction = roadmapProgress?.shippedFraction ?? 0;

  const formatArr = (v: number) =>
    v >= 1_000_000
      ? `$${(v / 1_000_000).toFixed(1)}M`
      : v >= 1_000
      ? `$${(v / 1_000).toFixed(0)}K`
      : `$${v.toFixed(0)}`;

  // ── Roadmap bar chart data ─────────────────────────────────────────────────
  const roadmapChartData = useMemo(
    () =>
      (roadmapProgress?.byStatus ?? []).map((b) => ({
        label: b.status.charAt(0) + b.status.slice(1).toLowerCase(),
        value: b.count,
      })),
    [roadmapProgress],
  );

  // ── Priority distribution bar data ────────────────────────────────────────
  const priorityChartData = useMemo(
    () =>
      (priorityDist?.buckets ?? []).map((b) => ({
        label: b.label.split(' ')[0],
        value: b.count,
      })),
    [priorityDist],
  );

  // ── Feedback volume sparkline ─────────────────────────────────────────────
  const volumeValues = useMemo(
    () => (feedbackVolume?.series ?? []).map((s) => s.total),
    [feedbackVolume],
  );

  const isAnyLoading =
    loadingThemes || loadingPriority || loadingRevenue || loadingRoadmap || loadingVolume;

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '2rem 1.5rem',
        fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif",
      }}
    >
      {/* ── Page header ───────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 800,
              color: '#0A2540',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            Enterprise Reports
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#6C757D', margin: '0.25rem 0 0 0' }}>
            Revenue-aware product intelligence derived from CIQ scoring outputs.
          </p>
        </div>
        <DateRangeFilter filter={filter} onChange={setFilter} />
      </div>

      {/* ── Executive Summary Cards ───────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        <SummaryCard
          label="Total Feedback"
          value={totalFeedback.toLocaleString()}
          sub={feedbackVolume ? `avg ${feedbackVolume.avgPerDay}/day` : undefined}
          accent="#20A4A4"
        />
        <SummaryCard
          label="Avg CIQ Score"
          value={avgCiqScore.toFixed(1)}
          sub={priorityDist ? `${priorityDist.totalScored} scored items` : undefined}
          accent="#1a56db"
        />
        <SummaryCard
          label="ARR Influenced"
          value={formatArr(totalArrInfluenced)}
          sub={revenueImpact ? `${revenueImpact.topThemes.length} themes` : undefined}
          accent="#7c3aed"
        />
        <SummaryCard
          label="Shipped Rate"
          value={`${(shippedFraction * 100).toFixed(0)}%`}
          sub={roadmapProgress ? `${roadmapProgress.shippedCount} of ${roadmapProgress.totalItems} items` : undefined}
          accent="#10b981"
        />
        <SummaryCard
          label="Active Themes"
          value={themeTrends?.totalActiveThemes ?? '—'}
          sub="CIQ-scored"
          accent="#f59e0b"
        />
      </div>

      {/* ── Two-column layout for charts ──────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(520px, 1fr))',
          gap: '1.5rem',
          marginBottom: '1.5rem',
        }}
      >
        {/* ── Theme Trends ─────────────────────────────────────────── */}
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={SECTION_TITLE}>Theme Trends</h2>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <ExportButton workspaceId={workspaceId} report="theme-trends" format="csv" filter={filter} label="CSV" />
              <ExportButton workspaceId={workspaceId} report="theme-trends" format="json" filter={filter} label="JSON" />
            </div>
          </div>
          {loadingThemes ? (
            <SkeletonCard lines={6} />
          ) : !themeTrends || themeTrends.themes.length === 0 ? (
            <p style={{ color: '#adb5bd', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>
              No active themes found. Score themes via the CIQ engine to see trends.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {themeTrends.themes.slice(0, 10).map((t) => (
                <div key={t.themeId}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0A2540', maxWidth: '65%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.title}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#6C757D' }}>
                      {t.feedbackCount} signals
                    </span>
                  </div>
                  <ScoreBar
                    value={t.priorityScore ?? t.ciqScore ?? 0}
                    color={
                      (t.priorityScore ?? 0) >= 70
                        ? '#e63946'
                        : (t.priorityScore ?? 0) >= 40
                        ? '#f59e0b'
                        : '#20A4A4'
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Priority Distribution ─────────────────────────────────── */}
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={SECTION_TITLE}>Priority Distribution</h2>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <ExportButton workspaceId={workspaceId} report="priority-distribution" format="csv" filter={filter} label="CSV" />
              <ExportButton workspaceId={workspaceId} report="priority-distribution" format="json" filter={filter} label="JSON" />
            </div>
          </div>
          {loadingPriority ? (
            <SkeletonCard lines={5} />
          ) : !priorityDist ? (
            <p style={{ color: '#adb5bd', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>No data</p>
          ) : (
            <>
              <BarChart
                data={priorityChartData}
                color="#1a56db"
                height={90}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                {priorityDist.buckets.map((b) => (
                  <div key={b.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', color: '#0A2540' }}>{b.label}</span>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0A2540' }}>{b.count}</span>
                      <span style={{ fontSize: '0.7rem', color: '#6C757D' }}>avg {b.avgCiqScore.toFixed(1)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e9ecef', display: 'flex', gap: '1.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#6C757D' }}>Scored: <strong>{priorityDist.totalScored}</strong></span>
                <span style={{ fontSize: '0.75rem', color: '#6C757D' }}>Unscored: <strong>{priorityDist.totalUnscored}</strong></span>
                <span style={{ fontSize: '0.75rem', color: '#6C757D' }}>Avg CIQ: <strong>{priorityDist.avgCiqScore.toFixed(1)}</strong></span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Revenue Impact ────────────────────────────────────────────── */}
      <div style={{ ...CARD, marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ ...SECTION_TITLE, margin: 0 }}>Revenue Impact</h2>
            <p style={{ fontSize: '0.78rem', color: '#6C757D', margin: '0.2rem 0 0 0' }}>
              Top themes ranked by ARR influence from linked customers and deals.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <ExportButton workspaceId={workspaceId} report="revenue-impact" format="csv" filter={filter} label="CSV" />
            <ExportButton workspaceId={workspaceId} report="revenue-impact" format="json" filter={filter} label="JSON" />
          </div>
        </div>
        {loadingRevenue ? (
          <SkeletonCard lines={5} />
        ) : !revenueImpact || revenueImpact.topThemes.length === 0 ? (
          <p style={{ color: '#adb5bd', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>
            No revenue data yet. Link customers with ARR values to themes to see impact.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e9ecef' }}>
                  {['Theme', 'ARR Influence', 'Revenue Score', 'CIQ Score', 'Feedback', 'Customers', 'Deals', 'Deal Value'].map((h) => (
                    <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', ...LABEL }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {revenueImpact.topThemes.map((t, i) => (
                  <tr
                    key={t.themeId}
                    style={{ borderBottom: '1px solid #f0f4f8', background: i % 2 === 0 ? '#fff' : '#fafbfc' }}
                  >
                    <td style={{ padding: '0.6rem 0.75rem', fontWeight: 600, color: '#0A2540', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.title}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', fontWeight: 700, color: '#7c3aed' }}>
                      {formatArr(t.revenueInfluence)}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      {t.revenueScore != null ? (
                        <span style={{ background: '#f0fafa', color: '#20A4A4', padding: '0.1rem 0.4rem', borderRadius: '999px', fontWeight: 700, fontSize: '0.75rem' }}>
                          {t.revenueScore.toFixed(0)}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      {t.ciqScore != null ? (
                        <span style={{ background: '#f0f5ff', color: '#1a56db', padding: '0.1rem 0.4rem', borderRadius: '999px', fontWeight: 700, fontSize: '0.75rem' }}>
                          {t.ciqScore.toFixed(0)}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', color: '#6C757D' }}>{t.feedbackCount}</td>
                    <td style={{ padding: '0.6rem 0.75rem', color: '#6C757D' }}>{t.customerCount}</td>
                    <td style={{ padding: '0.6rem 0.75rem', color: '#6C757D' }}>{t.dealCount}</td>
                    <td style={{ padding: '0.6rem 0.75rem', color: '#6C757D' }}>{formatArr(t.totalDealValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e9ecef', display: 'flex', gap: '2rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#6C757D' }}>
                Total ARR Influenced: <strong style={{ color: '#7c3aed' }}>{formatArr(revenueImpact.totalArrInfluenced)}</strong>
              </span>
              <span style={{ fontSize: '0.75rem', color: '#6C757D' }}>
                Total Deal Value: <strong style={{ color: '#0A2540' }}>{formatArr(revenueImpact.totalDealValue)}</strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom row: Roadmap Progress + Feedback Volume ────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))',
          gap: '1.5rem',
        }}
      >
        {/* ── Roadmap Progress ─────────────────────────────────────── */}
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={SECTION_TITLE}>Roadmap Progress</h2>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <ExportButton workspaceId={workspaceId} report="roadmap-progress" format="csv" filter={filter} label="CSV" />
              <ExportButton workspaceId={workspaceId} report="roadmap-progress" format="json" filter={filter} label="JSON" />
            </div>
          </div>
          {loadingRoadmap ? (
            <SkeletonCard lines={5} />
          ) : !roadmapProgress ? (
            <p style={{ color: '#adb5bd', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>No data</p>
          ) : (
            <>
              <BarChart data={roadmapChartData} color="#7c3aed" height={80} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                {roadmapProgress.byStatus.map((b) => (
                  <div key={b.status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: '#0A2540', fontWeight: b.status === 'SHIPPED' ? 700 : 400 }}>
                      {b.status.charAt(0) + b.status.slice(1).toLowerCase()}
                    </span>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0A2540' }}>{b.count}</span>
                      {b.avgPriorityScore != null && (
                        <span style={{ fontSize: '0.7rem', color: '#6C757D' }}>P {b.avgPriorityScore.toFixed(0)}</span>
                      )}
                      <span style={{ fontSize: '0.7rem', color: '#6C757D' }}>{b.totalSignalCount} signals</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e9ecef', display: 'flex', gap: '1.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#6C757D' }}>
                  Shipped: <strong style={{ color: '#10b981' }}>{(roadmapProgress.shippedFraction * 100).toFixed(0)}%</strong>
                </span>
                <span style={{ fontSize: '0.75rem', color: '#6C757D' }}>
                  Committed: <strong>{roadmapProgress.committedCount}</strong>
                </span>
                <span style={{ fontSize: '0.75rem', color: '#6C757D' }}>
                  Total: <strong>{roadmapProgress.totalItems}</strong>
                </span>
              </div>
            </>
          )}
        </div>

        {/* ── Feedback Volume ───────────────────────────────────────── */}
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={SECTION_TITLE}>Feedback Volume</h2>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <ExportButton workspaceId={workspaceId} report="feedback-volume" format="csv" filter={filter} label="CSV" />
              <ExportButton workspaceId={workspaceId} report="feedback-volume" format="json" filter={filter} label="JSON" />
            </div>
          </div>
          {loadingVolume ? (
            <SkeletonCard lines={4} />
          ) : !feedbackVolume || feedbackVolume.series.length === 0 ? (
            <p style={{ color: '#adb5bd', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>
              No feedback in this date range.
            </p>
          ) : (
            <>
              <Sparkline values={volumeValues} color="#20A4A4" height={60} />
              <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                <div>
                  <p style={{ ...LABEL, margin: '0 0 0.2rem 0' }}>Total</p>
                  <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0A2540', margin: 0 }}>
                    {feedbackVolume.totalFeedback.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p style={{ ...LABEL, margin: '0 0 0.2rem 0' }}>Avg / Day</p>
                  <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0A2540', margin: 0 }}>
                    {feedbackVolume.avgPerDay}
                  </p>
                </div>
                {feedbackVolume.topSource && (
                  <div>
                    <p style={{ ...LABEL, margin: '0 0 0.2rem 0' }}>Top Source</p>
                    <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0A2540', margin: 0 }}>
                      {feedbackVolume.topSource.replace(/_/g, ' ')}
                    </p>
                  </div>
                )}
              </div>
              {/* Source breakdown */}
              {feedbackVolume.series.length > 0 && (() => {
                const totals: Record<string, number> = {};
                for (const s of feedbackVolume.series) {
                  for (const [src, cnt] of Object.entries(s.bySource)) {
                    totals[src] = (totals[src] ?? 0) + cnt;
                  }
                }
                const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
                return (
                  <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e9ecef', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {sorted.map(([src, cnt]) => (
                      <span key={src} style={{ fontSize: '0.72rem', background: '#f8f9fa', border: '1px solid #e9ecef', borderRadius: '999px', padding: '0.15rem 0.5rem', color: '#0A2540' }}>
                        {src.replace(/_/g, ' ')}: <strong>{cnt}</strong>
                      </span>
                    ))}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>

      {/* ── Footer note ───────────────────────────────────────────────── */}
      <p style={{ fontSize: '0.72rem', color: '#adb5bd', textAlign: 'center', marginTop: '2rem' }}>
        All data is workspace-scoped and derived from CIQ scoring outputs. Scores update as new feedback is processed.
      </p>
    </div>
  );
}

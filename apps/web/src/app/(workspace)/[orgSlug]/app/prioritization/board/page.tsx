'use client';
/**
 * Roadmap Prioritization Board — /:orgSlug/app/prioritization/board
 *
 * A sortable table view of all roadmap items ranked by CIQ impact score,
 * feedback volume, or manual rank. Supports inline manual-rank editing.
 *
 * Columns:
 *   # | Title | Status | Impact (CIQ) | Confidence | Feedback | AI Recommendation | Target | Manual Rank
 *
 * Sort signals:
 *   - priorityScore  (default) — AI-computed CIQ composite 0–100
 *   - feedbackCount            — number of linked feedback items
 *   - manualRank               — user-set integer rank (1 = highest priority)
 *   - createdAt / updatedAt    — temporal fallbacks
 *
 * Trust signals:
 *   - AI confidence badge (from theme.aiConfidence) shows how reliable the AI output is
 *   - Score bar gives visual weight to the numeric CIQ score
 *   - AI Recommendation column shows the LLM-generated action item
 *   - Hovering the Impact cell shows a tooltip explaining what drives the score
 */
import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  useRoadmapPrioritizationBoard,
  useUpdateRoadmapRank,
  RoadmapSortField,
} from '@/hooks/use-roadmap';
import { appRoutes } from '@/lib/routes';
import { CiqImpactBadge } from '@/components/ciq/CiqImpactBadge';
import { RoadmapItem, RoadmapStatus } from '@/lib/api-types';

// ─── Style constants ──────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const STATUS_COLORS: Record<string, string> = {
  BACKLOG:   '#6C757D',
  EXPLORING: '#1a73e8',
  PLANNED:   '#f57c00',
  COMMITTED: '#b8860b',
  SHIPPED:   '#2e7d32',
};

const STATUS_BG: Record<string, string> = {
  BACKLOG:   '#f8f9fa',
  EXPLORING: '#e8f0fe',
  PLANNED:   '#fff3e0',
  COMMITTED: '#fff8e1',
  SHIPPED:   '#e8f5e9',
};

const TH: React.CSSProperties = {
  padding: '0.625rem 0.75rem',
  textAlign: 'left',
  fontWeight: 600,
  color: '#6C757D',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
  userSelect: 'none',
};

const TD: React.CSSProperties = {
  padding: '0.625rem 0.75rem',
  verticalAlign: 'middle',
};

// ─── Sort options ─────────────────────────────────────────────────────────────

const SORT_OPTIONS: { value: RoadmapSortField; label: string }[] = [
  { value: 'priorityScore',  label: 'Impact Score (CIQ)' },
  { value: 'feedbackCount',  label: 'Feedback Volume' },
  { value: 'manualRank',     label: 'Manual Rank' },
  { value: 'createdAt',      label: 'Date Created' },
  { value: 'updatedAt',      label: 'Last Updated' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number | null | undefined }) {
  if (score == null) return <span style={{ color: '#adb5bd', fontSize: '0.75rem' }}>—</span>;
  const pct = Math.min(100, Math.max(0, score));
  // Thresholds aligned with CiqImpactBadge: ≥80 Critical, ≥55 High, ≥30 Medium, <30 Low
  const color = pct >= 80 ? '#b91c1c' : pct >= 55 ? '#c2410c' : pct >= 30 ? '#b45309' : '#15803d';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ flex: 1, height: 6, background: '#e9ecef', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, color, minWidth: 28, textAlign: 'right' }}>
        {Math.round(pct)}
      </span>
    </div>
  );
}

function SortIndicator({ field, current, order }: { field: RoadmapSortField; current: RoadmapSortField; order: 'asc' | 'desc' }) {
  if (field !== current) return <span style={{ color: '#dee2e6', marginLeft: 4 }}>↕</span>;
  return <span style={{ color: '#0a2540', marginLeft: 4 }}>{order === 'desc' ? '↓' : '↑'}</span>;
}

/**
 * AI Confidence badge — shows how reliable the AI narration is.
 * Mirrors the logic used on the theme detail page.
 */
function AiConfidenceBadge({ confidence }: { confidence: number | null | undefined }) {
  if (confidence == null) {
    return (
      <span
        style={{ fontSize: '0.7rem', color: '#adb5bd', fontStyle: 'italic' }}
        title="AI has not yet scored this item"
      >
        Pending
      </span>
    );
  }
  const pct = Math.round(confidence * 100);
  const isHigh   = confidence >= 0.75;
  const isMedium = confidence >= 0.45;
  const bg    = isHigh ? '#e8f5e9' : isMedium ? '#fff8e1' : '#f0f4f8';
  const color = isHigh ? '#2e7d32' : isMedium ? '#b8860b' : '#6C757D';
  const label = isHigh ? 'Confidence: High' : isMedium ? 'Confidence: Medium' : 'Confidence: Low';
  return (
    <span
      title={`AI Confidence: ${pct}% — ${isHigh ? 'High: the AI had rich, consistent evidence to generate reliable insights.' : isMedium ? 'Medium: moderate evidence available. Review AI insights alongside raw feedback.' : 'Low: limited or inconsistent evidence. Treat AI insights as provisional.'}`}
      style={{
        display: 'inline-block',
        padding: '0.15rem 0.45rem',
        borderRadius: '999px',
        background: bg,
        color,
        fontSize: '0.7rem',
        fontWeight: 700,
        cursor: 'help',
      }}
    >
      {label} {pct}%
    </span>
  );
}

/**
 * Score explanation tooltip — shows what drives the CIQ score.
 * Reads from the theme's aiExplanation field.
 */
function ScoreExplainer({ score, explanation }: { score: number | null | undefined; explanation?: string | null }) {
  const [open, setOpen] = useState(false);
  if (score == null) return null;
  // Thresholds aligned with CiqImpactBadge: ≥80 Critical, ≥55 High, ≥30 Medium, <30 Low
  const tier = score >= 80 ? 'Critical' : score >= 55 ? 'High' : score >= 30 ? 'Medium' : 'Low';
  const tierColor = score >= 80 ? '#b91c1c' : score >= 55 ? '#c2410c' : score >= 30 ? '#b45309' : '#15803d';
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="What drives this score?"
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: '#adb5bd',
          fontSize: '0.75rem',
          lineHeight: 1,
        }}
        aria-label="Score explanation"
      >
        ⓘ
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 100,
            background: '#fff',
            border: '1px solid #e9ecef',
            borderRadius: '0.5rem',
            padding: '0.75rem',
            minWidth: 260,
            maxWidth: 320,
            boxShadow: '0 4px 16px rgba(10,37,64,0.12)',
            fontSize: '0.8125rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontWeight: 700, color: tierColor }}>{tier} Priority — Score {Math.round(score)}/100</span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#adb5bd', fontSize: '1rem', lineHeight: 1 }}
            >
              ×
            </button>
          </div>
          <p style={{ margin: 0, color: '#374151', lineHeight: 1.5, fontSize: '0.8rem' }}>
            {explanation
              ? explanation
              : score >= 80
              ? 'Decision Priority: Critical. This item is driven by high feedback volume, significant ARR at risk, and strong urgency signals. Act now.'
              : score >= 55
              ? 'Decision Priority: High. Moderate-to-strong feedback volume and revenue signals warrant near-term roadmap attention.'
              : score >= 30
              ? 'Decision Priority: Medium. Signal volume is growing but not yet urgent. Monitor for changes before committing resources.'
              : 'Decision Priority: Low. Limited signal data. The score will improve as more feedback is linked and customers engage.'}
          </p>
          <p style={{ margin: '0.5rem 0 0', color: '#adb5bd', fontSize: '0.75rem' }}>
            CIQ score = weighted sum of demand strength, revenue impact, strategic importance, and urgency signals.
          </p>
        </div>
      )}
    </div>
  );
}

/** Inline editable rank cell */
function RankCell({
  item,
  onSave,
}: {
  item: RoadmapItem;
  onSave: (itemId: string, rank: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(item.manualRank != null ? String(item.manualRank) : '');

  const commit = useCallback(() => {
    setEditing(false);
    const parsed = value.trim() === '' ? null : parseInt(value, 10);
    if (parsed !== null && (isNaN(parsed) || parsed < 1)) {
      setValue(item.manualRank != null ? String(item.manualRank) : '');
      return;
    }
    if (parsed !== item.manualRank) {
      onSave(item.id, parsed);
    }
  }, [value, item.manualRank, item.id, onSave]);

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        data-testid={`rank-input-${item.id}`}
        style={{
          width: 64,
          padding: '0.25rem 0.5rem',
          border: '1px solid #1a73e8',
          borderRadius: '0.375rem',
          fontSize: '0.8125rem',
          outline: 'none',
        }}
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      data-testid={`rank-cell-${item.id}`}
      title="Click to set manual rank (1 = highest priority). Leave blank to clear."
      style={{
        background: item.manualRank != null ? '#e8f0fe' : 'transparent',
        border: item.manualRank != null ? '1px solid #c5d8fc' : '1px dashed #dee2e6',
        borderRadius: '0.375rem',
        padding: '0.2rem 0.6rem',
        fontSize: '0.8125rem',
        fontWeight: item.manualRank != null ? 700 : 400,
        color: item.manualRank != null ? '#1a73e8' : '#adb5bd',
        cursor: 'pointer',
        minWidth: 48,
        textAlign: 'center',
      }}
    >
      {item.manualRank != null ? `#${item.manualRank}` : '—'}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PrioritizationBoardPage() {
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;
  const routes = appRoutes(orgSlug);

  const [sortBy, setSortBy] = useState<RoadmapSortField>('priorityScore');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');

  const { data: items = [], isLoading, isError } = useRoadmapPrioritizationBoard({
    sortBy,
    sortOrder,
    search: search || undefined,
  });

  const updateRank = useUpdateRoadmapRank();

  const handleSort = (field: RoadmapSortField) => {
    if (field === sortBy) {
      setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(field);
      // manualRank is ascending by default (1 = best); others descending
      setSortOrder(field === 'manualRank' ? 'asc' : 'desc');
    }
  };

  const handleRankSave = useCallback((itemId: string, rank: number | null) => {
    updateRank.mutate({ itemId, manualRank: rank });
  }, [updateRank]);

  // Summary stats
  const critical = items.filter((i) => (i.priorityScore ?? 0) >= 75).length;
  const ranked   = items.filter((i) => i.manualRank != null).length;
  const withAi   = items.filter((i) => {
    const t = i.theme as { aiRecommendation?: string | null } | null | undefined;
    return !!(t?.aiRecommendation);
  }).length;

  return (
    <div style={{ padding: '2rem', maxWidth: 1400, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <Link href={routes.prioritization} style={{ color: '#6C757D', textDecoration: 'none', fontSize: '0.875rem' }}>
              Prioritization
            </Link>
            <span style={{ color: '#6C757D' }}>›</span>
            <span style={{ fontSize: '0.875rem', color: '#0a2540', fontWeight: 500 }}>Priority Board</span>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>
            Roadmap Prioritization Board
          </h1>
          <p style={{ color: '#6C757D', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
            All roadmap items ranked by CIQ impact score, feedback volume, or manual priority.
            Click any rank cell to override. Hover ⓘ for score explanation.
          </p>
        </div>

        {/* Summary chips */}
        {!isLoading && items.length > 0 && (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ padding: '0.5rem 1rem', background: '#fef2f2', borderRadius: '0.75rem', textAlign: 'center', border: '1px solid #fca5a5' }}>
              <p style={{ margin: 0, fontSize: '0.7rem', color: '#b91c1c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Critical</p>
              <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#b91c1c' }}>{critical}</p>
            </div>
            <div style={{ padding: '0.5rem 1rem', background: '#e8f0fe', borderRadius: '0.75rem', textAlign: 'center', border: '1px solid #c5d8fc' }}>
              <p style={{ margin: 0, fontSize: '0.7rem', color: '#1a73e8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Manually Ranked</p>
              <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#1a73e8' }}>{ranked}</p>
            </div>
            <div style={{ padding: '0.5rem 1rem', background: '#e8f5e9', borderRadius: '0.75rem', textAlign: 'center', border: '1px solid #a5d6a7' }}>
              <p style={{ margin: 0, fontSize: '0.7rem', color: '#2e7d32', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>AI Insights</p>
              <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#2e7d32' }}>{withAi}</p>
            </div>
            <div style={{ padding: '0.5rem 1rem', background: '#f0f4f8', borderRadius: '0.75rem', textAlign: 'center', border: '1px solid #dee2e6' }}>
              <p style={{ margin: 0, fontSize: '0.7rem', color: '#6C757D', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Items</p>
              <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0a2540' }}>{items.length}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Controls ── */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <input
          type="search"
          placeholder="Search roadmap items…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="board-search"
          style={{
            padding: '0.5rem 0.875rem',
            border: '1px solid #dee2e6',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            outline: 'none',
            minWidth: 220,
            flex: 1,
            maxWidth: 360,
          }}
        />

        {/* Sort selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.8125rem', color: '#6C757D', whiteSpace: 'nowrap' }}>Sort by:</label>
          <select
            value={sortBy}
            onChange={(e) => handleSort(e.target.value as RoadmapSortField)}
            data-testid="sort-select"
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #dee2e6',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={() => setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
            data-testid="sort-order-toggle"
            title={sortOrder === 'desc' ? 'Currently descending — click for ascending' : 'Currently ascending — click for descending'}
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #dee2e6',
              borderRadius: '0.5rem',
              background: '#fff',
              cursor: 'pointer',
              fontSize: '0.875rem',
              color: '#0a2540',
            }}
          >
            {sortOrder === 'desc' ? '↓ Desc' : '↑ Asc'}
          </button>
        </div>

        {/* Link to Kanban board */}
        <Link
          href={routes.roadmap}
          style={{ marginLeft: 'auto', fontSize: '0.8125rem', color: '#1a73e8', textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          ← Kanban Board
        </Link>
      </div>

      {/* ── Table ── */}
      <div style={CARD}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6C757D' }}>
            Loading roadmap items…
          </div>
        ) : isError ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#c62828' }}>
            Failed to load roadmap items. Please try again.
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6C757D' }}>
            No roadmap items found.{' '}
            <Link href={routes.roadmap} style={{ color: '#1a73e8' }}>Add items to your roadmap</Link> first.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}
              data-testid="prioritization-table"
            >
              <thead>
                <tr style={{ borderBottom: '2px solid #e9ecef' }}>
                  {/* Row number */}
                  <th style={{ ...TH, width: 40, textAlign: 'center' }}>#</th>

                  {/* Sortable: Title */}
                  <th style={{ ...TH, cursor: 'default', minWidth: 200 }}>
                    Title
                  </th>

                  {/* Status */}
                  <th style={{ ...TH, minWidth: 100 }}>Status</th>

                  {/* Sortable: Impact Score */}
                  <th
                    style={{ ...TH, cursor: 'pointer', minWidth: 180 }}
                    onClick={() => handleSort('priorityScore')}
                    data-testid="sort-priorityScore"
                  >
                    Impact (CIQ)
                    <SortIndicator field="priorityScore" current={sortBy} order={sortOrder} />
                  </th>

                  {/* AI Confidence — trust signal */}
                  <th
                    style={{ ...TH, minWidth: 100 }}
                    title="How confident the AI is in its assessment, based on signal richness"
                  >
                    AI Confidence
                  </th>

                  {/* Sortable: Feedback Count */}
                  <th
                    style={{ ...TH, cursor: 'pointer', minWidth: 110 }}
                    onClick={() => handleSort('feedbackCount')}
                    data-testid="sort-feedbackCount"
                  >
                    Feedback
                    <SortIndicator field="feedbackCount" current={sortBy} order={sortOrder} />
                  </th>

                  {/* AI Recommendation */}
                  <th style={{ ...TH, minWidth: 220 }}>AI Recommendation</th>

                  {/* Target */}
                  <th style={{ ...TH, minWidth: 100 }}>Target</th>

                  {/* Sortable: Manual Rank */}
                  <th
                    style={{ ...TH, cursor: 'pointer', minWidth: 110 }}
                    onClick={() => handleSort('manualRank')}
                    data-testid="sort-manualRank"
                  >
                    Manual Rank
                    <SortIndicator field="manualRank" current={sortBy} order={sortOrder} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const statusColor = STATUS_COLORS[item.status] ?? '#6C757D';
                  const statusBg    = STATUS_BG[item.status] ?? '#f8f9fa';
                  const themeData = item.theme as {
                    aiRecommendation?: string | null;
                    aiExplanation?: string | null;
                    aiConfidence?: number | null;
                  } | null | undefined;
                  const aiRec        = themeData?.aiRecommendation;
                  const aiExplain    = themeData?.aiExplanation;
                  const aiConfidence = themeData?.aiConfidence;

                  return (
                    <tr
                      key={item.id}
                      data-testid={`board-row-${item.id}`}
                      style={{
                        borderBottom: '1px solid #f0f4f8',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = '#f8fafc'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
                    >
                      {/* Row number */}
                      <td style={{ ...TD, textAlign: 'center', color: '#adb5bd', fontSize: '0.75rem', fontWeight: 600 }}>
                        {idx + 1}
                      </td>

                      {/* Title */}
                      <td style={{ ...TD, fontWeight: 600, color: '#0a2540', minWidth: 200 }}>
                        <Link
                          href={`${routes.roadmap}/${item.id}`}
                          style={{ color: '#0a2540', textDecoration: 'none' }}
                        >
                          {item.title}
                        </Link>
                        {item.theme?.title && (
                          <div style={{ fontSize: '0.75rem', color: '#6C757D', marginTop: 2, fontWeight: 400 }}>
                            {item.theme.title}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td style={TD}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '999px',
                            background: statusBg,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: statusColor,
                          }}
                        >
                          {item.status}
                        </span>
                      </td>

                      {/* Impact (CIQ) */}
                      <td style={{ ...TD, minWidth: 180 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            <CiqImpactBadge score={item.priorityScore} showScore size="sm" />
                            <ScoreExplainer score={item.priorityScore} explanation={aiExplain} />
                          </div>
                          <ScoreBar score={item.priorityScore} />
                        </div>
                      </td>

                      {/* AI Confidence */}
                      <td style={{ ...TD, minWidth: 100 }}>
                        <AiConfidenceBadge confidence={aiConfidence} />
                      </td>

                      {/* Feedback Count */}
                      <td style={{ ...TD, textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '999px',
                            background: '#f0f4f8',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            color: '#0a2540',
                          }}
                        >
                          {item.feedbackCount ?? 0}
                        </span>
                      </td>

                      {/* AI Recommendation */}
                      <td style={{ ...TD, maxWidth: 300, minWidth: 220 }}>
                        {aiRec ? (
                          <span
                            style={{
                              fontSize: '0.8125rem',
                              color: '#374151',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                            title={aiRec}
                          >
                            {aiRec}
                          </span>
                        ) : (
                          <span
                            style={{ color: '#adb5bd', fontSize: '0.8125rem' }}
                            title="AI recommendation will appear after the theme is scored"
                          >
                            Pending AI scoring
                          </span>
                        )}
                      </td>

                      {/* Target Quarter / Year */}
                      <td style={{ ...TD, color: '#6C757D', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                        {item.targetQuarter && item.targetYear
                          ? `${item.targetQuarter} ${item.targetYear}`
                          : item.targetYear
                          ? String(item.targetYear)
                          : '—'}
                      </td>

                      {/* Manual Rank */}
                      <td style={{ ...TD, textAlign: 'center' }}>
                        <RankCell item={item} onSave={handleRankSave} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Footer hint ── */}
      {!isLoading && items.length > 0 && (
        <p style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#adb5bd', textAlign: 'right' }}>
          Click a column header to sort. Click a rank cell to set a manual override (1 = highest priority).
          Hover ⓘ to see what drives each CIQ score. Leave rank blank to clear.
        </p>
      )}
    </div>
  );
}

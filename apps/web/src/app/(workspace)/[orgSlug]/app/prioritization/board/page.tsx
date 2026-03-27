'use client';
/**
 * Roadmap Prioritization Board — /:orgSlug/app/prioritization/board
 *
 * A sortable table view of all roadmap items ranked by CIQ impact score,
 * feedback volume, or manual rank. Supports inline manual-rank editing.
 *
 * Columns:
 *   Rank | Title | Status | Impact (CIQ) | Feedback | AI Recommendation | Target | Manual Rank
 *
 * Sort signals:
 *   - priorityScore  (default) — AI-computed CIQ composite 0–100
 *   - feedbackCount            — number of linked feedback items
 *   - manualRank               — user-set integer rank (1 = highest priority)
 *   - createdAt / updatedAt    — temporal fallbacks
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
  const color = pct >= 75 ? '#b91c1c' : pct >= 50 ? '#c2410c' : pct >= 25 ? '#b45309' : '#15803d';
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
      title="Click to set manual rank"
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
            Click any rank cell to override.
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
                  <th
                    style={{ ...TH, cursor: 'default', minWidth: 200 }}
                  >
                    Title
                  </th>

                  {/* Status */}
                  <th style={{ ...TH, minWidth: 100 }}>Status</th>

                  {/* Sortable: Impact Score */}
                  <th
                    style={{ ...TH, cursor: 'pointer', minWidth: 160 }}
                    onClick={() => handleSort('priorityScore')}
                    data-testid="sort-priorityScore"
                  >
                    Impact (CIQ)
                    <SortIndicator field="priorityScore" current={sortBy} order={sortOrder} />
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
                  const aiRec = (item.theme as { aiRecommendation?: string | null } | null | undefined)?.aiRecommendation;

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
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: statusColor }}>
                          {item.status}
                        </span>
                      </td>

                      {/* Impact (CIQ) */}
                      <td style={{ ...TD, minWidth: 160 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <CiqImpactBadge score={item.priorityScore} showScore size="sm" />
                          <ScoreBar score={item.priorityScore} />
                        </div>
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
                          >
                            {aiRec}
                          </span>
                        ) : (
                          <span style={{ color: '#adb5bd', fontSize: '0.8125rem' }}>—</span>
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
          Leave blank to clear the manual rank.
        </p>
      )}
    </div>
  );
}

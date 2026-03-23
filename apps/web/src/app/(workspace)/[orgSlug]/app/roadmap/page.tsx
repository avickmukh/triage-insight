'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  useRoadmapBoard,
  useCreateRoadmapItem,
  useUpdateRoadmapItem,
  useDeleteRoadmapItem,
} from '@/hooks/use-roadmap';
import { useCurrentMemberRole } from '@/hooks/use-workspace';
import {
  CreateRoadmapItemDto,
  RoadmapItem,
  RoadmapStatus,
  UpdateRoadmapItemDto,
  WorkspaceRole,
} from '@/lib/api-types';
import { publicRoutes, appRoutes } from '@/lib/routes';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const COLUMNS: {
  status: RoadmapStatus;
  label: string;
  accent: string;
  bg: string;
  border: string;
}[] = [
  { status: RoadmapStatus.BACKLOG,   label: 'Backlog',   accent: '#6C757D', bg: '#f8f9fa', border: '#dee2e6' },
  { status: RoadmapStatus.EXPLORING, label: 'Exploring', accent: '#b8860b', bg: '#fffdf0', border: '#f0e6b0' },
  { status: RoadmapStatus.PLANNED,   label: 'Planned',   accent: '#1a56db', bg: '#f0f5ff', border: '#c7d9fb' },
  { status: RoadmapStatus.COMMITTED, label: 'Committed', accent: '#7c3aed', bg: '#faf5ff', border: '#ddd6fe' },
  { status: RoadmapStatus.SHIPPED,   label: 'Shipped',   accent: '#20A4A4', bg: '#f0fafa', border: '#b2e4e4' },
];

// ─── Skeleton shimmer ─────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{ background: '#fff', borderRadius: '0.625rem', padding: '0.875rem', border: '1px solid #e9ecef' }}>
      <div style={{ height: '0.75rem', background: '#e9ecef', borderRadius: '0.25rem', width: '70%', marginBottom: '0.5rem' }} />
      <div style={{ height: '0.6rem', background: '#f0f4f8', borderRadius: '0.25rem', width: '50%', marginBottom: '0.75rem' }} />
      <div style={{ display: 'flex', gap: '0.375rem' }}>
        <div style={{ height: '1.1rem', width: '3rem', background: '#f0f4f8', borderRadius: '999px' }} />
        <div style={{ height: '1.1rem', width: '2.5rem', background: '#f0f4f8', borderRadius: '999px' }} />
      </div>
    </div>
  );
}

// ─── Priority pill ────────────────────────────────────────────────────────────
function PriorityPill({ score }: { score: number | null | undefined }) {
  if (score == null) return null;
  const pct = Math.min(100, Math.round(score * 100));
  const color = pct >= 70 ? '#e63946' : pct >= 40 ? '#f4a261' : '#20A4A4';
  const bg    = pct >= 70 ? '#fdecea' : pct >= 40 ? '#fff3e8' : '#e8f7f7';
  return (
    <span title="AI Priority Score" style={{ fontSize: '0.68rem', fontWeight: 700, color, background: bg, padding: '0.1rem 0.45rem', borderRadius: '999px' }}>
      P {pct}
    </span>
  );
}

// ─── Confidence pill ──────────────────────────────────────────────────────────
function ConfidencePill({ score }: { score: number | null | undefined }) {
  if (score == null || score === 0) return null;
  const pct = Math.min(100, Math.round(score * 100));
  return (
    <span title="Confidence Score" style={{ fontSize: '0.68rem', fontWeight: 600, color: '#1a56db', background: '#f0f5ff', padding: '0.1rem 0.45rem', borderRadius: '999px' }}>
      C {pct}%
    </span>
  );
}

// ─── Item Card ─────────────────────────────────────────────────────────────────
interface ItemCardProps {
  item: RoadmapItem;
  canEdit: boolean;
  onEdit: (item: RoadmapItem) => void;
  onMove: (item: RoadmapItem, newStatus: RoadmapStatus) => void;
}
function ItemCard({ item, canEdit, onEdit, onMove }: ItemCardProps) {
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const { orgSlug } = useParams<{ orgSlug: string }>();

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: '0.625rem',
        padding: '0.875rem',
        border: '1px solid #e9ecef',
        boxShadow: '0 1px 3px rgba(10,37,64,0.04)',
        position: 'relative',
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 3px 10px rgba(10,37,64,0.1)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(10,37,64,0.04)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
      }}
    >
      {/* Title row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.375rem' }}>
        <p
          style={{
            fontSize: '0.875rem', fontWeight: 700, color: '#0A2540',
            lineHeight: 1.4, flex: 1, cursor: canEdit ? 'pointer' : 'default', margin: 0,
          }}
          onClick={() => canEdit && onEdit(item)}
        >
          {item.title}
        </p>
        {canEdit && (
          <div style={{ position: 'relative', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowMoveMenu((v) => !v)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#adb5bd', fontSize: '1.1rem', padding: '0 0.2rem',
                lineHeight: 1, borderRadius: '0.25rem',
              }}
              title="Move to column"
            >
              ⋯
            </button>
            {showMoveMenu && (
              <div style={{
                position: 'absolute', top: '1.5rem', right: 0, zIndex: 50,
                background: '#fff', border: '1px solid #e9ecef', borderRadius: '0.5rem',
                boxShadow: '0 4px 16px rgba(10,37,64,0.12)', minWidth: '150px', overflow: 'hidden',
              }}>
                {COLUMNS.filter((c) => c.status !== item.status).map((c) => (
                  <button
                    key={c.status}
                    onClick={() => { onMove(item, c.status); setShowMoveMenu(false); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '0.55rem 0.875rem', background: 'none', border: 'none',
                      fontSize: '0.82rem', color: '#0A2540', cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8f9fa')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    → {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Description */}
      {item.description && (
        <p style={{
          fontSize: '0.78rem', color: '#6C757D', margin: '0 0 0.5rem',
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.5,
        }}>
          {item.description}
        </p>
      )}

      {/* Badges */}
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.5rem' }}>
        {item.isPublic && (
          <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#20A4A4', background: '#e8f7f7', padding: '0.1rem 0.45rem', borderRadius: '999px' }}>
            Public
          </span>
        )}
        {item.theme && (
          <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#7c3aed', background: '#faf5ff', padding: '0.1rem 0.45rem', borderRadius: '999px' }}>
            {item.theme.title}
          </span>
        )}
        <PriorityPill score={item.priorityScore} />
        <ConfidencePill score={item.confidenceScore} />
        {(item.feedbackCount ?? 0) > 0 && (
          <span style={{ fontSize: '0.68rem', color: '#6C757D', background: '#f0f4f8', padding: '0.1rem 0.45rem', borderRadius: '999px' }}>
            {item.feedbackCount} fb
          </span>
        )}
        {(item.signalCount ?? 0) > 0 && (
          <span style={{ fontSize: '0.68rem', color: '#6C757D', background: '#f0f4f8', padding: '0.1rem 0.45rem', borderRadius: '999px' }}>
            {item.signalCount} sig
          </span>
        )}
        {item.targetQuarter && item.targetYear && (
          <span style={{ fontSize: '0.68rem', color: '#adb5bd' }}>
            {item.targetQuarter} {item.targetYear}
          </span>
        )}
      </div>

      {/* Detail link */}
      {orgSlug && (
        <div style={{ marginTop: '0.625rem', borderTop: '1px solid #f0f4f8', paddingTop: '0.5rem' }}>
          <Link
            href={appRoutes(orgSlug).roadmapItem(item.id)}
            style={{ fontSize: '0.72rem', fontWeight: 600, color: '#1a56db', textDecoration: 'none' }}
            onClick={(e) => e.stopPropagation()}
          >
            View detail →
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Create / Edit Modal ───────────────────────────────────────────────────────
interface ItemModalProps {
  item?: RoadmapItem | null;
  onClose: () => void;
  onSave: (data: CreateRoadmapItemDto | UpdateRoadmapItemDto) => void;
  onDelete?: () => void;
  isSaving: boolean;
  isDeleting?: boolean;
}
function ItemModal({ item, onClose, onSave, onDelete, isSaving, isDeleting }: ItemModalProps) {
  const isEdit = !!item;
  const [title, setTitle]                 = useState(item?.title ?? '');
  const [description, setDescription]     = useState(item?.description ?? '');
  const [status, setStatus]               = useState<RoadmapStatus>(item?.status ?? RoadmapStatus.PLANNED);
  const [isPublic, setIsPublic]           = useState(item?.isPublic ?? false);
  const [targetQuarter, setTargetQuarter] = useState(item?.targetQuarter ?? '');
  const [targetYear, setTargetYear]       = useState(item?.targetYear?.toString() ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const payload: CreateRoadmapItemDto = {
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      isPublic,
      targetQuarter: targetQuarter.trim() || undefined,
      targetYear: targetYear ? parseInt(targetYear, 10) : undefined,
    };
    onSave(payload);
  };

  const LABEL: React.CSSProperties = {
    display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#6C757D',
    marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em',
  };
  const INPUT: React.CSSProperties = {
    width: '100%', padding: '0.65rem 0.9rem', borderRadius: '0.5rem',
    border: '1px solid #dee2e6', fontSize: '0.9rem', outline: 'none',
    boxSizing: 'border-box', color: '#0A2540', background: '#fff',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(10,37,64,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{ ...CARD, width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', padding: '2rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0A2540', margin: 0 }}>
            {isEdit ? 'Edit Roadmap Item' : 'New Roadmap Item'}
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: '#adb5bd', lineHeight: 1, padding: '0.25rem' }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
          <div>
            <label style={LABEL}>Title <span style={{ color: '#e63946' }}>*</span></label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Bulk CSV import" required style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What problem does this solve?" rows={3} style={{ ...INPUT, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
            <div>
              <label style={LABEL}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as RoadmapStatus)} style={INPUT}>
                {COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: '0.1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', color: '#0A2540', fontWeight: 600 }}>
                <input
                  type="checkbox" checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  style={{ width: '1rem', height: '1rem', cursor: 'pointer', accentColor: '#20A4A4' }}
                />
                Visible on public portal
              </label>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
            <div>
              <label style={LABEL}>Target Quarter</label>
              <select value={targetQuarter} onChange={(e) => setTargetQuarter(e.target.value)} style={INPUT}>
                <option value="">—</option>
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q3">Q3</option>
                <option value="Q4">Q4</option>
              </select>
            </div>
            <div>
              <label style={LABEL}>Target Year</label>
              <input
                type="number" value={targetYear}
                onChange={(e) => setTargetYear(e.target.value)}
                placeholder={new Date().getFullYear().toString()}
                min={2020} max={2035}
                style={INPUT}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid #f0f4f8' }}>
            {isEdit && onDelete ? (
              confirmDelete ? (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: '#dc3545', fontWeight: 600 }}>Are you sure?</span>
                  <button
                    type="button" onClick={onDelete} disabled={isDeleting}
                    style={{ padding: '0.35rem 0.75rem', borderRadius: '0.4rem', border: 'none', background: '#dc3545', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
                  >
                    {isDeleting ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button
                    type="button" onClick={() => setConfirmDelete(false)}
                    style={{ padding: '0.35rem 0.75rem', borderRadius: '0.4rem', border: '1px solid #dee2e6', background: '#fff', color: '#0A2540', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button" onClick={() => setConfirmDelete(true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', color: '#dc3545', fontWeight: 600 }}
                >
                  Delete item
                </button>
              )
            ) : (
              <span />
            )}
            <div style={{ display: 'flex', gap: '0.625rem' }}>
              <button
                type="button" onClick={onClose}
                style={{ padding: '0.55rem 1.1rem', borderRadius: '0.5rem', border: '1px solid #dee2e6', background: '#fff', color: '#0A2540', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="submit" disabled={isSaving || !title.trim()}
                style={{
                  padding: '0.55rem 1.25rem', borderRadius: '0.5rem', border: 'none',
                  background: isSaving || !title.trim() ? '#adb5bd' : '#0a2540',
                  color: '#fff', fontWeight: 700, fontSize: '0.875rem',
                  cursor: isSaving || !title.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {isSaving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Item'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function RoadmapPage() {
  const params = useParams();
  const orgSlug = (Array.isArray(params?.orgSlug) ? params.orgSlug[0] : params?.orgSlug) ?? '';
  const r = appRoutes(orgSlug);

  const { data: board, isLoading, isError, error } = useRoadmapBoard();
  const createMutation = useCreateRoadmapItem();
  const updateMutation = useUpdateRoadmapItem();
  const deleteMutation = useDeleteRoadmapItem();
  const { role } = useCurrentMemberRole();
  const canEdit = role === WorkspaceRole.ADMIN || role === WorkspaceRole.EDITOR;

  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem]     = useState<RoadmapItem | null>(null);

  const handleCreate = (data: CreateRoadmapItemDto) => {
    createMutation.mutate(data, { onSuccess: () => setShowCreate(false) });
  };
  const handleUpdate = (data: UpdateRoadmapItemDto) => {
    if (!editItem) return;
    updateMutation.mutate({ itemId: editItem.id, data }, { onSuccess: () => setEditItem(null) });
  };
  const handleDelete = () => {
    if (!editItem) return;
    deleteMutation.mutate(editItem.id, { onSuccess: () => setEditItem(null) });
  };
  const handleMove = (item: RoadmapItem, newStatus: RoadmapStatus) => {
    updateMutation.mutate({ itemId: item.id, data: { status: newStatus } });
  };

  const totalItems = board
    ? Object.values(board).reduce((sum, col) => sum + (col?.length ?? 0), 0)
    : 0;

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* ── Page Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0a2540', margin: 0 }}>
              Roadmap
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#6C757D', margin: '0.25rem 0 0' }}>
              Plan, track, and ship product improvements powered by feedback signals.
            </p>
          </div>
          {canEdit && (
            <button
              onClick={() => setShowCreate(true)}
              style={{
                padding: '0.55rem 1.25rem', borderRadius: '0.5rem',
                border: 'none', background: '#0a2540',
                color: '#fff', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 600,
                flexShrink: 0,
              }}
            >
              + Add Item
            </button>
          )}
        </div>

        {/* ── Status summary chips ── */}
        <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {COLUMNS.map((col) => {
            const count = board?.[col.status]?.length ?? 0;
            return (
              <div
                key={col.status}
                style={{
                  background: col.bg, border: `1px solid ${col.border}`,
                  borderRadius: '0.625rem', padding: '0.4rem 0.875rem',
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                }}
              >
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: col.accent, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {col.label}
                </span>
                <span style={{
                  fontSize: '0.72rem', fontWeight: 700, color: '#fff',
                  background: col.accent, borderRadius: '999px',
                  padding: '0.05rem 0.45rem', minWidth: '1.25rem', textAlign: 'center',
                }}>
                  {isLoading ? '—' : count}
                </span>
              </div>
            );
          })}
          {!isLoading && totalItems > 0 && (
            <span style={{ fontSize: '0.8rem', color: '#adb5bd', marginLeft: 'auto' }}>
              {totalItems} item{totalItems !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* ── Public portal banner ── */}
        <div style={{
          ...CARD, padding: '0.875rem 1.25rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '0.5rem', background: '#f8f9fa',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <span style={{ fontSize: '1rem' }}>🌐</span>
            <div>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0A2540' }}>Public Portal Roadmap</span>
              <span style={{ fontSize: '0.78rem', color: '#6C757D', marginLeft: '0.5rem' }}>
                Only items marked &ldquo;Public&rdquo; are visible to customers.
              </span>
            </div>
          </div>
          {orgSlug && (
            <Link
              href={publicRoutes(orgSlug).roadmap}
              target="_blank"
              style={{ fontSize: '0.82rem', fontWeight: 600, color: '#20A4A4', textDecoration: 'none' }}
            >
              View public roadmap ↗
            </Link>
          )}
        </div>

        {/* ── Error state ── */}
        {isError && (
          <div style={{ ...CARD, borderLeft: '4px solid #dc3545', padding: '1rem 1.25rem', background: '#fff5f5' }}>
            <p style={{ fontSize: '0.875rem', color: '#dc3545', fontWeight: 700, margin: '0 0 0.25rem' }}>
              Failed to load roadmap
            </p>
            <p style={{ fontSize: '0.82rem', color: '#6C757D', margin: 0 }}>
              {(error as Error)?.message ?? 'An unexpected error occurred. Please try again.'}
            </p>
          </div>
        )}

        {/* ── Kanban Board ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(200px, 1fr))',
          gap: '1rem',
          alignItems: 'start',
          overflowX: 'auto',
          paddingBottom: '1rem',
        }}>
          {COLUMNS.map((col) => {
            const items: RoadmapItem[] = board?.[col.status] ?? [];
            return (
              <div
                key={col.status}
                style={{
                  background: col.bg,
                  borderRadius: '0.875rem',
                  padding: '1rem',
                  border: `1px solid ${col.border}`,
                  minWidth: '200px',
                }}
              >
                {/* Column header */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: '0.875rem', paddingBottom: '0.625rem',
                  borderBottom: `2px solid ${col.border}`,
                }}>
                  <span style={{
                    fontSize: '0.72rem', fontWeight: 800, color: col.accent,
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                  }}>
                    {col.label}
                  </span>
                  <span style={{
                    fontSize: '0.72rem', fontWeight: 700, color: col.accent,
                    background: '#fff', border: `1px solid ${col.border}`,
                    borderRadius: '999px', padding: '0.1rem 0.5rem',
                    minWidth: '1.5rem', textAlign: 'center',
                  }}>
                    {isLoading ? '—' : items.length}
                  </span>
                </div>

                {/* Items */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {isLoading ? (
                    <>
                      <SkeletonCard />
                      <SkeletonCard />
                    </>
                  ) : items.length === 0 ? (
                    <div style={{
                      padding: '1.5rem 0.5rem', textAlign: 'center',
                      border: '1px dashed #dee2e6', borderRadius: '0.5rem',
                      background: 'rgba(255,255,255,0.5)',
                    }}>
                      <p style={{ fontSize: '0.78rem', color: '#adb5bd', margin: 0 }}>No items</p>
                    </div>
                  ) : (
                    items.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        canEdit={canEdit}
                        onEdit={setEditItem}
                        onMove={handleMove}
                      />
                    ))
                  )}

                  {canEdit && !isLoading && (
                    <button
                      onClick={() => setShowCreate(true)}
                      style={{
                        background: 'rgba(255,255,255,0.7)', border: `1px dashed ${col.border}`,
                        borderRadius: '0.5rem', padding: '0.5rem',
                        cursor: 'pointer', color: col.accent, fontSize: '0.78rem',
                        textAlign: 'center', marginTop: '0.125rem', fontWeight: 600,
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#fff')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.7)')}
                    >
                      + Add
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* ── Modals ── */}
      {showCreate && (
        <ItemModal
          onClose={() => setShowCreate(false)}
          onSave={handleCreate as (data: CreateRoadmapItemDto | UpdateRoadmapItemDto) => void}
          isSaving={createMutation.isPending}
        />
      )}
      {editItem && (
        <ItemModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={handleUpdate}
          onDelete={handleDelete}
          isSaving={updateMutation.isPending}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </>
  );
}

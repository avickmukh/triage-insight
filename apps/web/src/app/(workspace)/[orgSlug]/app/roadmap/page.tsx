'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
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
import { useParams } from 'next/navigation';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const COLUMNS: { status: RoadmapStatus; label: string; accent: string; bg: string }[] = [
  { status: RoadmapStatus.BACKLOG,    label: 'Backlog',    accent: '#adb5bd', bg: '#f8f9fa' },
  { status: RoadmapStatus.EXPLORING,  label: 'Exploring',  accent: '#b8860b', bg: '#fffdf0' },
  { status: RoadmapStatus.PLANNED,    label: 'Planned',    accent: '#1a56db', bg: '#f0f5ff' },
  { status: RoadmapStatus.COMMITTED,  label: 'Committed',  accent: '#7c3aed', bg: '#faf5ff' },
  { status: RoadmapStatus.SHIPPED,    label: 'Shipped',    accent: '#20A4A4', bg: '#f0fafa' },
];

// ─── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{ background: '#fff', borderRadius: '0.6rem', padding: '0.875rem', border: '1px solid #e9ecef' }}>
      <div style={{ height: '0.75rem', background: '#e9ecef', borderRadius: '0.25rem', width: '70%', marginBottom: '0.5rem' }} />
      <div style={{ height: '0.6rem', background: '#f0f4f8', borderRadius: '0.25rem', width: '50%' }} />
    </div>
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
        borderRadius: '0.6rem',
        padding: '0.875rem',
        border: '1px solid #e9ecef',
        boxShadow: '0 1px 3px rgba(10,37,64,0.04)',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <p
          style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0A2540', marginBottom: '0.25rem', lineHeight: 1.4, flex: 1, cursor: 'pointer' }}
          onClick={() => canEdit && onEdit(item)}
        >
          {item.title}
        </p>
        <Link
          href={appRoutes(orgSlug).roadmapItem(item.id)}
          style={{ fontSize: '0.68rem', color: '#1a56db', textDecoration: 'none', flexShrink: 0, marginTop: '0.1rem' }}
          title="View detail"
        >
          Detail →
        </Link>
      </div>

      {item.description && (
        <p style={{
          fontSize: '0.78rem', color: '#6C757D', marginBottom: '0.5rem',
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {item.description}
        </p>
      )}

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.5rem' }}>
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
        {(item.feedbackCount ?? 0) > 0 && (
          <span style={{ fontSize: '0.68rem', color: '#adb5bd' }}>
            {item.feedbackCount} fb
          </span>
        )}
        {(item.signalCount ?? 0) > 0 && (
          <span style={{ fontSize: '0.68rem', color: '#6C757D', background: '#f8f9fa', padding: '0.1rem 0.45rem', borderRadius: '999px' }}>
            {item.signalCount} sig
          </span>
        )}
        {item.priorityScore != null && (
          <span style={{ fontSize: '0.68rem', color: '#b8860b', background: '#fffdf0', padding: '0.1rem 0.45rem', borderRadius: '999px' }} title="AI Priority Score">
            P {item.priorityScore.toFixed(0)}
          </span>
        )}
        {item.confidenceScore != null && (
          <span style={{ fontSize: '0.68rem', color: '#20A4A4', background: '#e8f7f7', padding: '0.1rem 0.45rem', borderRadius: '999px' }} title="Confidence Score">
            C {(item.confidenceScore * 100).toFixed(0)}%
          </span>
        )}
        {item.targetQuarter && item.targetYear && (
          <span style={{ fontSize: '0.68rem', color: '#6C757D' }}>
            {item.targetQuarter} {item.targetYear}
          </span>
        )}
      </div>

      {canEdit && (
        <div
          style={{ position: 'absolute', top: '0.6rem', right: '0.6rem' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setShowMoveMenu((v) => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#adb5bd', fontSize: '1rem', padding: '0.15rem 0.35rem',
              borderRadius: '0.3rem',
            }}
            title="Move to column"
          >
            ...
          </button>
          {showMoveMenu && (
            <div style={{
              position: 'absolute', top: '1.6rem', right: 0, zIndex: 50,
              background: '#fff', border: '1px solid #e9ecef', borderRadius: '0.5rem',
              boxShadow: '0 4px 16px rgba(10,37,64,0.12)', minWidth: '140px', overflow: 'hidden',
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
                  Move to {c.label}
                </button>
              ))}
            </div>
          )}
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
  const [title, setTitle] = useState(item?.title ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [status, setStatus] = useState<RoadmapStatus>(item?.status ?? RoadmapStatus.PLANNED);
  const [isPublic, setIsPublic] = useState(item?.isPublic ?? false);
  const [targetQuarter, setTargetQuarter] = useState(item?.targetQuarter ?? '');
  const [targetYear, setTargetYear] = useState(item?.targetYear?.toString() ?? '');
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
    boxSizing: 'border-box', color: '#0A2540',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(10,37,64,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{ ...CARD, width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0A2540' }}>
            {isEdit ? 'Edit Roadmap Item' : 'New Roadmap Item'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#adb5bd' }}>x</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={LABEL}>Title *</label>
            <input
              value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Bulk CSV import" required
              style={INPUT}
            />
          </div>

          <div>
            <label style={LABEL}>Description</label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="What problem does this solve?"
              rows={3}
              style={{ ...INPUT, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={LABEL}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as RoadmapStatus)} style={INPUT}>
                {COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: '0.1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.88rem', color: '#0A2540', fontWeight: 600 }}>
                <input
                  type="checkbox" checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
                />
                Visible on public portal
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={LABEL}>Target Quarter</label>
              <select value={targetQuarter} onChange={(e) => setTargetQuarter(e.target.value)} style={INPUT}>
                <option value="">-</option>
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

          {isEdit && item && (item.theme || item.feedbackCount > 0 || item.priorityScore != null) && (
            <div style={{ background: '#f8f9fa', borderRadius: '0.6rem', padding: '0.875rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              {item.theme && (
                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Theme</span>
                  <p style={{ fontSize: '0.85rem', color: '#7c3aed', fontWeight: 600, marginTop: '0.2rem' }}>{item.theme.title}</p>
                </div>
              )}
              {item.feedbackCount > 0 && (
                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Feedback Signals</span>
                  <p style={{ fontSize: '0.85rem', color: '#0A2540', fontWeight: 600, marginTop: '0.2rem' }}>{item.feedbackCount}</p>
                </div>
              )}
              {item.priorityScore != null && (
                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Priority Score</span>
                  <p style={{ fontSize: '0.85rem', color: '#b8860b', fontWeight: 600, marginTop: '0.2rem' }}>{item.priorityScore.toFixed(1)}</p>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
            {isEdit && onDelete ? (
              confirmDelete ? (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: '#dc3545' }}>Delete this item?</span>
                  <button
                    type="button" onClick={onDelete} disabled={isDeleting}
                    style={{ padding: '0.4rem 0.875rem', borderRadius: '0.4rem', border: 'none', background: '#dc3545', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
                  >
                    {isDeleting ? 'Deleting...' : 'Confirm'}
                  </button>
                  <button
                    type="button" onClick={() => setConfirmDelete(false)}
                    style={{ padding: '0.4rem 0.875rem', borderRadius: '0.4rem', border: '1px solid #dee2e6', background: '#fff', color: '#0A2540', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}
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

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button" onClick={onClose}
                style={{ padding: '0.55rem 1.1rem', borderRadius: '0.5rem', border: '1px solid #dee2e6', background: '#fff', color: '#0A2540', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="submit" disabled={isSaving}
                style={{ padding: '0.55rem 1.25rem', borderRadius: '0.5rem', border: 'none', background: '#0A2540', color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: isSaving ? 'not-allowed' : 'pointer' }}
              >
                {isSaving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Item'}
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
  const orgSlug = params?.orgSlug as string;

  const { data: board, isLoading, isError, error } = useRoadmapBoard();
  const createMutation  = useCreateRoadmapItem();
  const updateMutation  = useUpdateRoadmapItem();
  const deleteMutation  = useDeleteRoadmapItem();
  const { role } = useCurrentMemberRole();

  const canEdit = role === WorkspaceRole.ADMIN || role === WorkspaceRole.EDITOR;

  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<RoadmapItem | null>(null);

  const handleCreate = useCallback((data: CreateRoadmapItemDto | UpdateRoadmapItemDto) => {
    createMutation.mutate(data as CreateRoadmapItemDto, {
      onSuccess: () => setShowCreate(false),
    });
  }, [createMutation]);

  const handleUpdate = useCallback((data: CreateRoadmapItemDto | UpdateRoadmapItemDto) => {
    if (!editItem) return;
    updateMutation.mutate({ itemId: editItem.id, data }, {
      onSuccess: () => setEditItem(null),
    });
  }, [editItem, updateMutation]);

  const handleMove = useCallback((item: RoadmapItem, newStatus: RoadmapStatus) => {
    updateMutation.mutate({ itemId: item.id, data: { status: newStatus } });
  }, [updateMutation]);

  const handleDelete = useCallback(() => {
    if (!editItem) return;
    deleteMutation.mutate(editItem.id, {
      onSuccess: () => setEditItem(null),
    });
  }, [editItem, deleteMutation]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0A2540', marginBottom: '0.25rem' }}>Roadmap</h1>
          <p style={{ fontSize: '0.9rem', color: '#6C757D' }}>Plan, track, and ship product improvements powered by feedback signals.</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowCreate(true)}
            style={{ padding: '0.55rem 1.25rem', borderRadius: '0.6rem', border: 'none', background: '#FFC832', color: '#0A2540', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', flexShrink: 0 }}
          >
            + Add Item
          </button>
        )}
      </div>

      {/* Public portal link */}
      <div style={{ ...CARD, padding: '0.875rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0A2540' }}>Public Portal Roadmap</span>
          <span style={{ fontSize: '0.78rem', color: '#6C757D', marginLeft: '0.5rem' }}>Only items marked &ldquo;Public&rdquo; are visible to customers.</span>
        </div>
        {orgSlug && (
          <Link
            href={publicRoutes(orgSlug).roadmap}
            target="_blank"
            style={{ fontSize: '0.82rem', fontWeight: 600, color: '#20A4A4', textDecoration: 'none' }}
          >
            View public roadmap
          </Link>
        )}
      </div>

      {/* Error */}
      {isError && (
        <div style={{ ...CARD, borderLeft: '3px solid #dc3545', padding: '1rem 1.25rem' }}>
          <p style={{ fontSize: '0.88rem', color: '#dc3545', fontWeight: 600 }}>Failed to load roadmap</p>
          <p style={{ fontSize: '0.82rem', color: '#6C757D', marginTop: '0.25rem' }}>{(error as Error)?.message}</p>
        </div>
      )}

      {/* Kanban Board */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(180px, 1fr))',
        gap: '1rem',
        alignItems: 'start',
        overflowX: 'auto',
      }}>
        {COLUMNS.map((col) => {
          const items: RoadmapItem[] = board?.[col.status] ?? [];

          return (
            <div
              key={col.status}
              style={{ background: col.bg, borderRadius: '0.875rem', padding: '1rem', border: '1px solid #e9ecef', minWidth: '180px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: col.accent, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {col.label}
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#adb5bd', background: '#fff', border: '1px solid #e9ecef', borderRadius: '999px', padding: '0.1rem 0.5rem' }}>
                  {isLoading ? '-' : items.length}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {isLoading ? (
                  <>
                    <SkeletonCard />
                    <SkeletonCard />
                  </>
                ) : items.length === 0 ? (
                  <p style={{ fontSize: '0.78rem', color: '#adb5bd', textAlign: 'center', padding: '1.25rem 0' }}>No items</p>
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
                      background: 'none', border: '1px dashed #dee2e6', borderRadius: '0.5rem',
                      padding: '0.5rem', cursor: 'pointer', color: '#adb5bd', fontSize: '0.78rem',
                      textAlign: 'center', marginTop: '0.25rem',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = col.accent)}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#dee2e6')}
                  >
                    + Add
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <ItemModal
          onClose={() => setShowCreate(false)}
          onSave={handleCreate}
          isSaving={createMutation.isPending}
        />
      )}

      {/* Edit Modal */}
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
    </div>
  );
}

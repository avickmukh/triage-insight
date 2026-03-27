'use client';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { useRoadmapItem, useUpdateRoadmapItem, useDeleteRoadmapItem, useRefreshIntelligence } from '@/hooks/use-roadmap';
import { useCurrentMemberRole } from '@/hooks/use-workspace';
import { RoadmapStatus, UpdateRoadmapItemDto, WorkspaceRole } from '@/lib/api-types';
import { appRoutes } from '@/lib/routes';
import { IntelligenceBar } from '@/components/modules/roadmap/intelligence-bar';
import { CiqImpactBadge } from '@/components/ciq/CiqImpactBadge';
import { SignalSummary } from '@/components/modules/roadmap/signal-summary';
import { LinkedFeedbackList } from '@/components/modules/roadmap/linked-feedback-list';

// ─── Design tokens (matching workspace design language) ───────────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 700,
  color: '#6C757D',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '0.875rem',
};

const STATUS_CONFIG: Record<RoadmapStatus, { label: string; color: string; bg: string }> = {
  [RoadmapStatus.BACKLOG]:   { label: 'Backlog',   color: '#adb5bd', bg: '#f8f9fa' },
  [RoadmapStatus.EXPLORING]: { label: 'Exploring', color: '#b8860b', bg: '#fffdf0' },
  [RoadmapStatus.PLANNED]:   { label: 'Planned',   color: '#1a56db', bg: '#f0f5ff' },
  [RoadmapStatus.COMMITTED]: { label: 'Committed', color: '#7c3aed', bg: '#faf5ff' },
  [RoadmapStatus.SHIPPED]:   { label: 'Shipped',   color: '#20A4A4', bg: '#f0fafa' },
};

// ─── Status selector ──────────────────────────────────────────────────────────
function StatusSelector({
  current,
  onChange,
  disabled,
}: {
  current: RoadmapStatus;
  onChange: (s: RoadmapStatus) => void;
  disabled: boolean;
}) {
  const cfg = STATUS_CONFIG[current];
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
          padding: '0.4rem 0.875rem', borderRadius: '999px',
          background: cfg.bg, border: `1.5px solid ${cfg.color}40`,
          color: cfg.color, fontSize: '0.82rem', fontWeight: 700,
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        {cfg.label}
        {!disabled && <span style={{ fontSize: '0.7rem' }}>▾</span>}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '2.2rem', left: 0, zIndex: 50,
          background: '#fff', border: '1px solid #e9ecef', borderRadius: '0.5rem',
          boxShadow: '0 4px 16px rgba(10,37,64,0.12)', minWidth: '140px', overflow: 'hidden',
        }}>
          {Object.values(RoadmapStatus).map((s) => {
            const c = STATUS_CONFIG[s];
            return (
              <button
                key={s}
                onClick={() => { onChange(s); setOpen(false); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '0.55rem 0.875rem', background: 'none', border: 'none',
                  fontSize: '0.82rem', color: c.color, fontWeight: 600, cursor: 'pointer',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = c.bg)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ height: '1.5rem', background: '#e9ecef', borderRadius: '0.4rem', width: '40%', marginBottom: '1rem' }} />
      <div style={{ height: '1rem', background: '#f0f4f8', borderRadius: '0.4rem', width: '60%', marginBottom: '2rem' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem' }}>
        <div style={{ ...CARD, height: '300px' }} />
        <div style={{ ...CARD, height: '300px' }} />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function RoadmapItemDetailPage() {
  const { orgSlug, id } = useParams<{ orgSlug: string; id: string }>();
  const router = useRouter();
  const { role } = useCurrentMemberRole();
  const canEdit = role === WorkspaceRole.ADMIN || role === WorkspaceRole.EDITOR;

  const { data: item, isLoading, isError } = useRoadmapItem(id);
  const updateMutation = useUpdateRoadmapItem();
  const deleteMutation = useDeleteRoadmapItem();
  const refreshMutation = useRefreshIntelligence();

  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isLoading) return <Skeleton />;
  if (isError || !item) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem', textAlign: 'center', color: '#6C757D' }}>
        <p style={{ fontSize: '1rem', marginBottom: '1rem' }}>Roadmap item not found.</p>
        <Link href={appRoutes(orgSlug).roadmap} style={{ color: '#1a56db', fontSize: '0.88rem' }}>
          ← Back to Roadmap
        </Link>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[item.status];

  const handleStatusChange = (newStatus: RoadmapStatus) => {
    const dto: UpdateRoadmapItemDto = { status: newStatus };
    updateMutation.mutate({ itemId: item.id, data: dto });
  };

  const handleDelete = () => {
    deleteMutation.mutate(item.id, {
      onSuccess: () => router.push(appRoutes(orgSlug).roadmap),
    });
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>

      {/* ─── Breadcrumb ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '1.25rem' }}>
        <Link
          href={appRoutes(orgSlug).roadmap}
          style={{ fontSize: '0.82rem', color: '#6C757D', textDecoration: 'none' }}
        >
          ← Roadmap
        </Link>
      </div>

      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0A2540', margin: '0 0 0.5rem' }}>
              {item.title}
            </h1>
            {item.description && (
              <p style={{ fontSize: '0.9rem', color: '#6C757D', margin: 0, lineHeight: 1.6 }}>
                {item.description}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <StatusSelector current={item.status} onChange={handleStatusChange} disabled={!canEdit || updateMutation.isPending} />
            {item.isPublic && (
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#20A4A4', background: '#e8f7f7', padding: '0.3rem 0.75rem', borderRadius: '999px' }}>
                Public
              </span>
            )}
          </div>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.875rem', alignItems: 'center' }}>
          {item.theme && (
            <span style={{
              fontSize: '0.78rem', fontWeight: 600, color: '#7c3aed',
              background: '#faf5ff', padding: '0.25rem 0.65rem', borderRadius: '999px',
            }}>
              Theme: {item.theme.title}
            </span>
          )}
          {item.targetQuarter && item.targetYear && (
            <span style={{ fontSize: '0.78rem', color: '#6C757D' }}>
              Target: {item.targetQuarter} {item.targetYear}
            </span>
          )}
          <span style={{ fontSize: '0.75rem', color: '#adb5bd' }}>
            Created {new Date(item.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* ─── Main grid ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem', alignItems: 'start' }}>

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Why This Was Created — shown when item was promoted from a theme with AI narration */}
          {item.theme && (item.theme as { aiExplanation?: string | null }).aiExplanation && (
            <div style={{
              ...CARD,
              background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
              border: '1px solid #ddd6fe',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.625rem' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  AI Intelligence
                </span>
                <span style={{ fontSize: '0.65rem', color: '#a78bfa' }}>from theme “{item.theme.title}”</span>
              </div>
              <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#4c1d95', margin: '0 0 0.375rem 0' }}>
                Why this was created
              </p>
              <p style={{ fontSize: '0.85rem', color: '#5b21b6', margin: 0, lineHeight: 1.6 }}>
                {(item.theme as { aiExplanation?: string | null }).aiExplanation}
              </p>
            </div>
          )}

          {/* Signal summary */}
          <div style={CARD}>
            <p style={SECTION_TITLE}>Signal Summary</p>
            <SignalSummary
              signalSummary={item.signalSummary ?? {}}
              signalCount={item.signalCount ?? 0}
            />
          </div>

          {/* Linked feedback */}
          <div style={CARD}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
              <p style={{ ...SECTION_TITLE, margin: 0 }}>
                Linked Feedback
                {(item.feedbackCount ?? 0) > 0 && (
                  <span style={{ marginLeft: '0.5rem', fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#adb5bd' }}>
                    ({item.feedbackCount})
                  </span>
                )}
              </p>
            </div>
            <LinkedFeedbackList items={item.linkedFeedback ?? []} />
          </div>
        </div>

        {/* Right column — intelligence panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* AI Intelligence */}
          <div style={CARD}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <p style={{ ...SECTION_TITLE, margin: 0 }}>AI Intelligence</p>
                <CiqImpactBadge score={item.priorityScore} showScore size="xs" />
              </div>
              {canEdit && (
                <button
                  onClick={() => refreshMutation.mutate(item.id)}
                  disabled={refreshMutation.isPending}
                  style={{
                    background: 'none', border: '1px solid #dee2e6', borderRadius: '0.4rem',
                    padding: '0.2rem 0.6rem', fontSize: '0.72rem', color: '#6C757D',
                    cursor: refreshMutation.isPending ? 'wait' : 'pointer',
                  }}
                >
                  {refreshMutation.isPending ? 'Refreshing…' : '↻ Refresh'}
                </button>
              )}
            </div>
            <IntelligenceBar
              priorityScore={item.priorityScore}
              confidenceScore={item.confidenceScore}
              revenueImpactScore={item.revenueImpactScore}
            />
            {item.priorityScore == null && item.confidenceScore == null && (
              <p style={{ fontSize: '0.8rem', color: '#adb5bd', fontStyle: 'italic', margin: 0 }}>
                No AI scores yet.{canEdit ? ' Click Refresh to compute.' : ''}
              </p>
            )}
            {/* Inherited explanation from linked theme */}
            {item.theme && (item.theme as { aiExplanation?: string | null }).aiExplanation && (
              <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '0.5rem' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.2rem' }}>Why this was prioritised</span>
                <p style={{ fontSize: '0.78rem', color: '#4c1d95', margin: 0, lineHeight: 1.5 }}>
                  {(item.theme as { aiExplanation?: string | null }).aiExplanation}
                </p>
              </div>
            )}
          </div>

          {/* Stats */}
          <div style={CARD}>
            <p style={SECTION_TITLE}>Stats</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {[
                { label: 'Feedback items', value: item.feedbackCount ?? 0 },
                { label: 'Signals', value: item.signalCount ?? 0 },
                { label: 'Status', value: statusCfg.label },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                  <span style={{ color: '#6C757D' }}>{label}</span>
                  <span style={{ fontWeight: 600, color: '#0A2540' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Danger zone */}
          {canEdit && (
            <div style={{ ...CARD, borderColor: '#fee2e2' }}>
              <p style={{ ...SECTION_TITLE, color: '#ef4444' }}>Danger Zone</p>
              {confirmDelete ? (
                <div>
                  <p style={{ fontSize: '0.82rem', color: '#6C757D', marginBottom: '0.75rem' }}>
                    Are you sure? This cannot be undone.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={handleDelete}
                      disabled={deleteMutation.isPending}
                      style={{
                        flex: 1, padding: '0.5rem', borderRadius: '0.4rem',
                        background: '#ef4444', border: 'none', color: '#fff',
                        fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {deleteMutation.isPending ? 'Deleting…' : 'Confirm Delete'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      style={{
                        flex: 1, padding: '0.5rem', borderRadius: '0.4rem',
                        background: '#f8f9fa', border: '1px solid #dee2e6', color: '#495057',
                        fontSize: '0.82rem', cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  style={{
                    width: '100%', padding: '0.5rem', borderRadius: '0.4rem',
                    background: 'none', border: '1px solid #fca5a5', color: '#ef4444',
                    fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Delete item
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

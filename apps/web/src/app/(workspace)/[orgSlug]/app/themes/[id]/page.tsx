'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useThemeDetail,
  useUpdateTheme,
  useRemoveFeedbackFromTheme,
} from '@/hooks/use-themes';
import { useCurrentMemberRole } from '@/hooks/use-workspace';
import { useThemeCiqScore, useRecalculateThemeCiq } from '@/hooks/use-ciq';
import {
  CiqScoreOutput,
  FeedbackSourceType,
  FeedbackStatus,
  ThemeLinkedFeedback,
  ThemeStatus,
  UpdateThemeDto,
  WorkspaceRole,
} from '@/lib/api-types';
import { appRoutes } from '@/lib/routes';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const STATUS_COLORS: Record<ThemeStatus, { bg: string; color: string }> = {
  [ThemeStatus.ACTIVE]:   { bg: '#e8f5e9', color: '#2e7d32' },
  [ThemeStatus.DRAFT]:    { bg: '#fff8e1', color: '#b8860b' },
  [ThemeStatus.ARCHIVED]: { bg: '#f0f4f8', color: '#6C757D' },
};

const FEEDBACK_STATUS_COLORS: Record<FeedbackStatus, { bg: string; color: string }> = {
  [FeedbackStatus.NEW]:       { bg: '#e3f2fd', color: '#1565c0' },
  [FeedbackStatus.IN_REVIEW]: { bg: '#f3e5f5', color: '#6a1b9a' },
  [FeedbackStatus.PROCESSED]: { bg: '#e8f5e9', color: '#2e7d32' },
  [FeedbackStatus.ARCHIVED]:  { bg: '#f0f4f8', color: '#6C757D' },
  [FeedbackStatus.MERGED]:    { bg: '#fce4ec', color: '#880e4f' },
};

const SOURCE_LABELS: Record<FeedbackSourceType, string> = {
  [FeedbackSourceType.MANUAL]:        'Manual',
  [FeedbackSourceType.PUBLIC_PORTAL]: 'Portal',
  [FeedbackSourceType.EMAIL]:         'Email',
  [FeedbackSourceType.SLACK]:         'Slack',
  [FeedbackSourceType.CSV_IMPORT]:    'CSV',
  [FeedbackSourceType.VOICE]:         'Voice',
  [FeedbackSourceType.API]:           'API',
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ style }: { style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: 'linear-gradient(90deg, #f0f4f8 25%, #e4eaf0 50%, #f0f4f8 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.4s infinite',
        borderRadius: '0.5rem',
        ...style,
      }}
    />
  );
}

// ─── Priority Bar ─────────────────────────────────────────────────────────────
function PriorityBar({ score }: { score: number | null | undefined }) {
  if (score == null) return <span style={{ color: '#adb5bd', fontSize: '0.875rem' }}>No score available</span>;
  const pct = Math.min(100, Math.round(score * 100));
  const color = pct >= 70 ? '#e63946' : pct >= 40 ? '#f4a261' : '#20A4A4';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <div style={{ flex: 1, height: '8px', background: '#e9ecef', borderRadius: '4px', maxWidth: '200px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: '1rem', fontWeight: 700, color }}>{pct}%</span>
    </div>
  );
}

// ─── Edit Theme Modal ─────────────────────────────────────────────────────────
function EditThemeModal({
  themeId,
  initial,
  onClose,
}: {
  themeId: string;
  initial: UpdateThemeDto;
  onClose: () => void;
}) {
  const { mutate: updateTheme, isPending, isError, error } = useUpdateTheme(themeId);
  const [title, setTitle] = useState(initial.title ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [status, setStatus] = useState<ThemeStatus>(initial.status ?? ThemeStatus.ACTIVE);
  const [pinned, setPinned] = useState<boolean>(initial.pinned ?? false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    updateTheme(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        pinned,
      },
      { onSuccess: onClose }
    );
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(10,37,64,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ ...CARD, width: '100%', maxWidth: '28rem', padding: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0a2540', marginBottom: '1.25rem' }}>
          Edit Theme
        </h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#495057', display: 'block', marginBottom: '0.375rem' }}>
              Title <span style={{ color: '#e63946' }}>*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={255}
              required
              style={{
                width: '100%', padding: '0.625rem 0.875rem',
                border: '1px solid #ced4da', borderRadius: '0.5rem',
                fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#495057', display: 'block', marginBottom: '0.375rem' }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              style={{
                width: '100%', padding: '0.625rem 0.875rem',
                border: '1px solid #ced4da', borderRadius: '0.5rem',
                fontSize: '0.9rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#495057', display: 'block', marginBottom: '0.375rem' }}>
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ThemeStatus)}
                style={{
                  width: '100%', padding: '0.625rem 0.875rem',
                  border: '1px solid #ced4da', borderRadius: '0.5rem',
                  fontSize: '0.9rem', outline: 'none', background: '#fff',
                }}
              >
                <option value={ThemeStatus.ACTIVE}>Active</option>
                <option value={ThemeStatus.DRAFT}>Draft</option>
                <option value={ThemeStatus.ARCHIVED}>Archived</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: '0.125rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', color: '#495057' }}>
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                  style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
                />
                Pin theme
              </label>
            </div>
          </div>
          {isError && (
            <p style={{ color: '#e63946', fontSize: '0.8rem', margin: 0 }}>
              {(error as Error)?.message || 'Failed to update theme.'}
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.5rem 1.25rem', borderRadius: '0.5rem',
                border: '1px solid #ced4da', background: '#fff',
                fontSize: '0.875rem', cursor: 'pointer', color: '#495057',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !title.trim()}
              style={{
                padding: '0.5rem 1.25rem', borderRadius: '0.5rem',
                border: 'none', background: isPending || !title.trim() ? '#adb5bd' : '#0a2540',
                color: '#fff', fontSize: '0.875rem', cursor: isPending || !title.trim() ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              {isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Linked Feedback Row ──────────────────────────────────────────────────────
function FeedbackRow({
  item,
  themeId,
  canEdit,
  orgSlug,
}: {
  item: ThemeLinkedFeedback;
  themeId: string;
  canEdit: boolean;
  orgSlug: string;
}) {
  const r = appRoutes(orgSlug);
  const { mutate: removeFeedback, isPending } = useRemoveFeedbackFromTheme(themeId);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const statusStyle = FEEDBACK_STATUS_COLORS[item.status] ?? { bg: '#f0f4f8', color: '#6C757D' };
  const confidence = item.confidence != null ? `${Math.round(item.confidence * 100)}%` : null;

  return (
    <div
      style={{
        padding: '0.875rem 1rem',
        borderBottom: '1px solid #f0f4f8',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
          <span
            style={{
              fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em',
              padding: '0.15rem 0.5rem', borderRadius: '999px',
              background: statusStyle.bg, color: statusStyle.color,
            }}
          >
            {item.status}
          </span>
          <span style={{ fontSize: '0.7rem', color: '#adb5bd' }}>
            {SOURCE_LABELS[item.sourceType] ?? item.sourceType}
          </span>
          {item.assignedBy === 'ai' && confidence && (
            <span
              style={{
                fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '999px',
                background: '#e3f2fd', color: '#1565c0', fontWeight: 600,
              }}
            >
              AI · {confidence}
            </span>
          )}
          {item.assignedBy === 'manual' && (
            <span
              style={{
                fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '999px',
                background: '#f3e5f5', color: '#6a1b9a', fontWeight: 600,
              }}
            >
              Manual
            </span>
          )}
        </div>
        <Link
          href={r.inboxItem(item.id)}
          style={{ textDecoration: 'none', color: '#0a2540', fontWeight: 600, fontSize: '0.9rem' }}
        >
          {item.title}
        </Link>
        {item.description && (
          <p
            style={{
              fontSize: '0.8rem', color: '#6C757D', margin: '0.25rem 0 0',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {item.description}
          </p>
        )}
        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.375rem', flexWrap: 'wrap' }}>
          {item.impactScore != null && (
            <span style={{ fontSize: '0.75rem', color: '#adb5bd' }}>
              Impact: <strong style={{ color: '#495057' }}>{Math.round(item.impactScore * 100)}%</strong>
            </span>
          )}
          {item.sentiment != null && (
            <span style={{ fontSize: '0.75rem', color: '#adb5bd' }}>
              Sentiment: <strong style={{ color: item.sentiment >= 0 ? '#2e7d32' : '#e63946' }}>
                {item.sentiment >= 0 ? '+' : ''}{item.sentiment.toFixed(2)}
              </strong>
            </span>
          )}
          <span style={{ fontSize: '0.75rem', color: '#adb5bd' }}>
            {new Date(item.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      {canEdit && (
        <div style={{ flexShrink: 0 }}>
          {confirmRemove ? (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#6C757D' }}>Remove?</span>
              <button
                onClick={() => removeFeedback(item.id, { onSuccess: () => setConfirmRemove(false) })}
                disabled={isPending}
                style={{
                  padding: '0.25rem 0.625rem', borderRadius: '0.375rem',
                  border: 'none', background: '#e63946', color: '#fff',
                  fontSize: '0.75rem', cursor: isPending ? 'not-allowed' : 'pointer', fontWeight: 600,
                }}
              >
                {isPending ? '…' : 'Yes'}
              </button>
              <button
                onClick={() => setConfirmRemove(false)}
                style={{
                  padding: '0.25rem 0.625rem', borderRadius: '0.375rem',
                  border: '1px solid #ced4da', background: '#fff', color: '#495057',
                  fontSize: '0.75rem', cursor: 'pointer',
                }}
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmRemove(true)}
              title="Remove from theme"
              style={{
                padding: '0.25rem 0.5rem', borderRadius: '0.375rem',
                border: '1px solid #e9ecef', background: '#fff', color: '#adb5bd',
                fontSize: '0.75rem', cursor: 'pointer',
              }}
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ThemeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';
  const themeId = (Array.isArray(params.id) ? params.id[0] : params.id) ?? '';
  const r = appRoutes(slug);

  const { role } = useCurrentMemberRole();
  const canEdit = role === WorkspaceRole.ADMIN || role === WorkspaceRole.EDITOR;

  const { data: theme, isLoading, isError, error } = useThemeDetail(themeId);
  const { data: ciqScore, isLoading: ciqLoading } = useThemeCiqScore(themeId || null);
  const recalculate = useRecalculateThemeCiq();
  const [rescoreToast, setRescoreToast] = useState<string | null>(null);

  const handleRescore = () => {
    if (!themeId) return;
    recalculate.mutate(themeId, {
      onSuccess: (res) => {
        setRescoreToast(`Scoring job enqueued (job #${res.jobId}). Score will update in a few seconds.`);
        setTimeout(() => setRescoreToast(null), 6000);
      },
      onError: (err) => {
        setRescoreToast(`Failed to enqueue: ${err.message}`);
        setTimeout(() => setRescoreToast(null), 5000);
      },
    });
  };

  const [showEdit, setShowEdit] = useState(false);
  const [feedbackSearch, setFeedbackSearch] = useState('');

  // ── Loading ──
  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ ...CARD, padding: '2rem' }}>
          <Skeleton style={{ height: '1rem', width: '8rem', marginBottom: '1rem' }} />
          <Skeleton style={{ height: '2rem', width: '60%', marginBottom: '0.75rem' }} />
          <Skeleton style={{ height: '1rem', width: '80%', marginBottom: '0.5rem' }} />
          <Skeleton style={{ height: '1rem', width: '50%' }} />
        </div>
        <div style={{ ...CARD, padding: '1.5rem' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ padding: '0.875rem 0', borderBottom: '1px solid #f0f4f8' }}>
              <Skeleton style={{ height: '0.875rem', width: '30%', marginBottom: '0.5rem' }} />
              <Skeleton style={{ height: '1rem', width: '70%', marginBottom: '0.375rem' }} />
              <Skeleton style={{ height: '0.75rem', width: '50%' }} />
            </div>
          ))}
        </div>
        <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      </div>
    );
  }

  // ── Error ──
  if (isError || !theme) {
    return (
      <div style={{ ...CARD, background: '#fff5f5', border: '1px solid #f5c6cb', padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#e63946', fontWeight: 600, margin: '0 0 0.5rem' }}>Failed to load theme</p>
        <p style={{ color: '#6C757D', fontSize: '0.875rem', margin: '0 0 1.5rem' }}>
          {(error as Error)?.message || 'This theme may not exist or you may not have access.'}
        </p>
        <button
          onClick={() => router.push(r.themes)}
          style={{
            padding: '0.5rem 1.25rem', borderRadius: '0.5rem',
            border: '1px solid #ced4da', background: '#fff',
            fontSize: '0.875rem', cursor: 'pointer', color: '#495057',
          }}
        >
          ← Back to Themes
        </button>
      </div>
    );
  }

  const statusStyle = STATUS_COLORS[theme.status] ?? { bg: '#f0f4f8', color: '#6C757D' };
  const linkedFeedback = theme.linkedFeedback ?? [];
  const filteredFeedback = feedbackSearch.trim()
    ? linkedFeedback.filter((f) =>
        f.title.toLowerCase().includes(feedbackSearch.toLowerCase()) ||
        f.description?.toLowerCase().includes(feedbackSearch.toLowerCase())
      )
    : linkedFeedback;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ── Back ── */}
      <Link
        href={r.themes}
        style={{ fontSize: '0.875rem', color: '#6C757D', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
      >
        ← Themes
      </Link>

      {/* ── Summary Card ── */}
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.625rem', flexWrap: 'wrap' }}>
              {theme.pinned && (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f4a261' }}>📌 PINNED</span>
              )}
              <span
                style={{
                  fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em',
                  padding: '0.2rem 0.6rem', borderRadius: '999px',
                  background: statusStyle.bg, color: statusStyle.color,
                }}
              >
                {theme.status}
              </span>
            </div>
            <h1 style={{ fontSize: '1.625rem', fontWeight: 800, color: '#0a2540', margin: '0 0 0.5rem', lineHeight: 1.2 }}>
              {theme.title}
            </h1>
            {theme.description && (
              <p style={{ fontSize: '0.9rem', color: '#6C757D', margin: '0 0 1.25rem', lineHeight: 1.6 }}>
                {theme.description}
              </p>
            )}
          </div>
          {canEdit && (
            <button
              onClick={() => setShowEdit(true)}
              style={{
                padding: '0.5rem 1.125rem', borderRadius: '0.5rem',
                border: '1px solid #ced4da', background: '#fff',
                fontSize: '0.875rem', cursor: 'pointer', color: '#495057',
                fontWeight: 500, flexShrink: 0,
              }}
            >
              Edit
            </button>
          )}
        </div>

        {/* Stats grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))',
            gap: '1rem',
            borderTop: '1px solid #f0f4f8',
            paddingTop: '1.25rem',
          }}
        >
          <div>
            <span style={{ fontSize: '0.75rem', color: '#adb5bd', display: 'block', marginBottom: '0.25rem' }}>
              Feedback Signals
            </span>
            <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0a2540' }}>
              {theme.feedbackCount}
            </span>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#adb5bd', display: 'block', marginBottom: '0.375rem' }}>
              Aggregated Priority
            </span>
            <PriorityBar score={theme.aggregatedPriorityScore} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#adb5bd', display: 'block', marginBottom: '0.25rem' }}>
              Created
            </span>
            <span style={{ fontSize: '0.875rem', color: '#495057', fontWeight: 600 }}>
              {new Date(theme.createdAt).toLocaleDateString()}
            </span>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#adb5bd', display: 'block', marginBottom: '0.25rem' }}>
              Last Updated
            </span>
            <span style={{ fontSize: '0.875rem', color: '#495057', fontWeight: 600 }}>
              {new Date(theme.updatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* ── CIQ Priority Intelligence Panel ── */}
      <div
        style={{
          ...CARD,
          background: 'linear-gradient(135deg, #f0f7ff 0%, #e8f4fd 100%)',
          border: '1px solid #b3d4f5',
        }}
      >
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', margin: '0 0 0.125rem' }}>
              Priority Intelligence
            </h3>
            <p style={{ fontSize: '0.78rem', color: '#6C757D', margin: 0 }}>
              CIQ score based on ARR, deal pipeline, votes, signals &amp; recency
            </p>
          </div>
          {canEdit && (
            <button
              onClick={handleRescore}
              disabled={recalculate.isPending}
              style={{
                padding: '0.4rem 0.9rem', borderRadius: '0.5rem',
                border: '1px solid #b3d4f5', background: '#fff',
                fontSize: '0.78rem', cursor: recalculate.isPending ? 'not-allowed' : 'pointer',
                color: '#1a6fc4', fontWeight: 600, opacity: recalculate.isPending ? 0.6 : 1,
              }}
            >
              {recalculate.isPending ? 'Enqueueing…' : '↻ Recalculate'}
            </button>
          )}
        </div>

        {/* Toast */}
        {rescoreToast && (
          <div style={{ padding: '0.5rem 0.75rem', background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '0.5rem', fontSize: '0.78rem', color: '#2e7d32', marginBottom: '1rem' }}>
            {rescoreToast}
          </div>
        )}

        {/* Score summary row */}
        {ciqLoading ? (
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {[120, 100, 140].map((w, i) => <Skeleton key={i} style={{ height: '3rem', width: `${w}px` }} />)}
          </div>
        ) : ciqScore ? (
          <>
            {/* Top-level metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(9rem, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ background: '#fff', borderRadius: '0.625rem', padding: '0.75rem', border: '1px solid #e3edf7', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: '#adb5bd', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Priority Score</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: ciqScore.priorityScore >= 70 ? '#e63946' : ciqScore.priorityScore >= 40 ? '#f4a261' : '#20A4A4' }}>
                  {Math.round(ciqScore.priorityScore)}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#adb5bd' }}>/ 100</div>
              </div>
              <div style={{ background: '#fff', borderRadius: '0.625rem', padding: '0.75rem', border: '1px solid #e3edf7', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: '#adb5bd', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Confidence</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0a2540' }}>
                  {Math.round(ciqScore.confidenceScore * 100)}%
                </div>
              </div>
              <div style={{ background: '#fff', borderRadius: '0.625rem', padding: '0.75rem', border: '1px solid #e3edf7', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: '#adb5bd', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Revenue Impact</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2e7d32' }}>
                  {ciqScore.revenueImpactValue > 0
                    ? `$${(ciqScore.revenueImpactValue / 1000).toFixed(0)}K`
                    : '—'}
                </div>
              </div>
              <div style={{ background: '#fff', borderRadius: '0.625rem', padding: '0.75rem', border: '1px solid #e3edf7', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: '#adb5bd', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Customers</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0a2540' }}>{ciqScore.uniqueCustomerCount}</div>
              </div>
              <div style={{ background: '#fff', borderRadius: '0.625rem', padding: '0.75rem', border: '1px solid #e3edf7', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: '#adb5bd', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Signals</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0a2540' }}>{ciqScore.signalCount}</div>
              </div>
            </div>

            {/* Signal breakdown bars */}
            {Object.keys(ciqScore.scoreExplanation).length > 0 && (
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0a2540', marginBottom: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Signal Breakdown
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {Object.entries(ciqScore.scoreExplanation)
                    .sort((a, b) => b[1].contribution - a[1].contribution)
                    .map(([key, factor]) => {
                      const pct = Math.min(100, Math.round(factor.contribution));
                      const barColor = pct >= 20 ? '#1a6fc4' : pct >= 10 ? '#20A4A4' : '#adb5bd';
                      return (
                        <div key={key}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                            <span style={{ fontSize: '0.75rem', color: '#495057' }}>{factor.label}</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: barColor }}>
                              {factor.contribution.toFixed(1)} pts
                            </span>
                          </div>
                          <div style={{ height: '6px', background: '#e9ecef', borderRadius: '3px' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '3px', transition: 'width 0.4s' }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </>
        ) : (
          <p style={{ fontSize: '0.85rem', color: '#6C757D', margin: 0 }}>
            {(theme.feedbackCount ?? 0) >= 3
              ? 'CIQ score not yet computed. Click “Recalculate” to generate the priority score.'
              : 'Add at least 3 feedback signals to unlock CIQ scoring for this theme.'}
          </p>
        )}
      </div>

      {/* ── Linked Feedback ── */}
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>
            Linked Feedback
            <span style={{ fontSize: '0.8rem', fontWeight: 400, color: '#adb5bd', marginLeft: '0.5rem' }}>
              ({linkedFeedback.length})
            </span>
          </h2>
          {linkedFeedback.length > 5 && (
            <input
              value={feedbackSearch}
              onChange={(e) => setFeedbackSearch(e.target.value)}
              placeholder="Filter feedback…"
              style={{
                padding: '0.4rem 0.75rem',
                border: '1px solid #ced4da', borderRadius: '0.5rem',
                fontSize: '0.8rem', outline: 'none', minWidth: '12rem',
              }}
            />
          )}
        </div>

        {linkedFeedback.length === 0 ? (
          <div style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📭</div>
            <p style={{ fontWeight: 600, color: '#0a2540', margin: '0 0 0.375rem' }}>No linked feedback yet</p>
            <p style={{ fontSize: '0.85rem', color: '#6C757D', margin: 0 }}>
              Feedback will be linked automatically after AI reclustering, or you can add it manually from the inbox.
            </p>
          </div>
        ) : filteredFeedback.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center' }}>
            <p style={{ color: '#6C757D', fontSize: '0.875rem', margin: 0 }}>
              No feedback matches &ldquo;{feedbackSearch}&rdquo;
            </p>
          </div>
        ) : (
          <div style={{ margin: '0 -1.5rem' }}>
            {filteredFeedback.map((item) => (
              <FeedbackRow
                key={item.id}
                item={item}
                themeId={themeId}
                canEdit={canEdit}
                orgSlug={slug}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Edit Modal ── */}
      {showEdit && (
        <EditThemeModal
          themeId={themeId}
          initial={{
            title: theme.title,
            description: theme.description ?? '',
            status: theme.status,
            pinned: theme.pinned,
          }}
          onClose={() => setShowEdit(false)}
        />
      )}

      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}

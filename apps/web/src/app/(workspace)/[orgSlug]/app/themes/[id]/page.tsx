'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useThemeDetail,
  useUpdateTheme,
  useRemoveFeedbackFromTheme,
} from '@/hooks/use-themes';
import { useCurrentMemberRole, useWorkspace } from '@/hooks/use-workspace';
import { useThemeCiqScore, useRecalculateThemeCiq, useThemeRevenueIntelligence } from '@/hooks/use-ciq';
import { useAiRoadmapSuggestions } from '@/hooks/use-roadmap';
import { CiqImpactBadge } from '@/components/ciq/CiqImpactBadge';
import { CiqSignalBreakdown } from '@/components/ciq/CiqSignalBreakdown';
import { PromoteToRoadmapModal } from '@/components/roadmap/PromoteToRoadmapModal';
import {
  AutoMergeSuggestion,
  CiqScoreOutput,
  FeedbackSourceType,
  FeedbackStatus,
  SimilarThemesResponse,
  ThemeLinkedFeedback,
  ThemeStatus,
  UpdateThemeDto,
  WorkspaceRole,
  LinkedSpikesResponse,
} from '@/lib/api-types';
import { appRoutes } from '@/lib/routes';
import apiClient from '@/lib/api-client';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const STATUS_COLORS: Record<ThemeStatus, { bg: string; color: string }> = {
  [ThemeStatus.AI_GENERATED]: { bg: '#e8f7f7', color: '#20A4A4' },
  [ThemeStatus.VERIFIED]:     { bg: '#e8f5e9', color: '#2e7d32' },
  [ThemeStatus.RESURFACED]:   { bg: '#fff3e0', color: '#e65100' },
  [ThemeStatus.REOPENED]:     { bg: '#f3e8ff', color: '#6d28d9' },
  [ThemeStatus.ARCHIVED]:     { bg: '#f0f4f8', color: '#6C757D' },
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
  [FeedbackSourceType.SURVEY]:        'Survey',
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

/// ─── Priority Bar ───────────────────────────────────────────────────────
// priorityScore is stored as 0–100 by the CIQ engine. Do NOT multiply by 100.
// Color thresholds aligned with CiqImpactBadge: ≥80 Critical, ≥55 High, ≥30 Medium, <30 Low.
function PriorityBar({ score }: { score: number | null | undefined }) {
  if (score == null) return <span style={{ color: '#adb5bd', fontSize: '0.875rem' }}>No score yet — trigger a rescore to compute the CIQ priority</span>;
  const pct = Math.min(100, Math.round(score));
  const color = pct >= 80 ? '#e63946' : pct >= 55 ? '#f4a261' : pct >= 30 ? '#f59e0b' : '#20A4A4';
  const bandLabel = pct >= 80 ? 'Critical' : pct >= 55 ? 'High' : pct >= 30 ? 'Medium' : 'Low';
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}
      title={`CIQ Priority Score: ${pct}/100 (${bandLabel}) — composite of signal volume, ARR exposure, deal pipeline, voice urgency, and support pressure. Connect your CRM to unlock full scoring potential.`}
    >
      <div style={{ flex: 1, height: '8px', background: '#e9ecef', borderRadius: '4px', maxWidth: '200px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: '1rem', fontWeight: 700, color, cursor: 'help' }}>{pct}</span>
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
  const [status, setStatus] = useState<ThemeStatus>(initial.status ?? ThemeStatus.AI_GENERATED);
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
                <option value={ThemeStatus.AI_GENERATED}>AI Generated</option>
                <option value={ThemeStatus.VERIFIED}>Verified</option>
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
  onRemoved,
}: {
  item: ThemeLinkedFeedback;
  themeId: string;
  canEdit: boolean;
  orgSlug: string;
  onRemoved?: (title: string) => void;
}) {
  const r = appRoutes(orgSlug);
  const { mutate: removeFeedback, isPending } = useRemoveFeedbackFromTheme(themeId);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const statusStyle = FEEDBACK_STATUS_COLORS[item.status] ?? { bg: '#f0f4f8', color: '#6C757D' };
  const confidence = item.confidence != null ? `${Math.round(item.confidence * 100)}%` : null;
  // matchReason is stored as a Json object in the DB; coerce to a readable string defensively
  const matchReasonStr: string | null =
    item.matchReason == null
      ? null
      : typeof item.matchReason === 'string'
        ? item.matchReason
        : typeof item.matchReason === 'object'
          ? (() => {
              const mr = item.matchReason as Record<string, unknown>;
              const parts: string[] = [];
              if (typeof mr.hybridScore === 'number') parts.push(`Hybrid: ${Math.round(mr.hybridScore * 100)}%`);
              if (typeof mr.embeddingScore === 'number') parts.push(`semantic ${Math.round(mr.embeddingScore * 100)}%`);
              if (typeof mr.keywordScore === 'number') parts.push(`keyword ${Math.round(mr.keywordScore * 100)}%`);
              if (Array.isArray(mr.matchedKeywords) && mr.matchedKeywords.length > 0)
                parts.push(`matched: ${(mr.matchedKeywords as string[]).slice(0, 3).join(', ')}`);
              return parts.length > 0 ? parts.join(' · ') : 'AI-matched via semantic clustering';
            })()
          : String(item.matchReason);

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
              title={matchReasonStr
                ? `AI matched this feedback to the theme with ${confidence} semantic similarity. Reason: ${matchReasonStr}`
                : `AI matched this feedback to the theme with ${confidence} semantic similarity`}
              style={{
                fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '999px',
                background: '#e3f2fd', color: '#1565c0', fontWeight: 600, cursor: 'help',
              }}
            >
              AI match · {confidence}
            </span>
          )}
          {item.assignedBy === 'ai' && matchReasonStr && (
            <span
              title={matchReasonStr}
              style={{
                fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '999px',
                background: '#f0f9ff', color: '#0369a1', fontWeight: 500, cursor: 'help',
                maxWidth: '18rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              💬 {matchReasonStr.length > 60 ? matchReasonStr.slice(0, 57) + '…' : matchReasonStr}
            </span>
          )}
          {item.assignedBy === 'manual' && (
            <span
              title="Manually linked to this theme by a team member"
              style={{
                fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '999px',
                background: '#f3e5f5', color: '#6a1b9a', fontWeight: 600, cursor: 'help',
              }}
            >
              Manually linked
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
              Sentiment:{' '}
              <strong style={{ color: item.sentiment >= 0.3 ? '#2e7d32' : item.sentiment <= -0.3 ? '#e63946' : '#b8860b' }}>
                {item.sentiment >= 0.3 ? 'Positive' : item.sentiment <= -0.3 ? 'Negative' : 'Neutral'}
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
                onClick={() => removeFeedback(item.id, { onSuccess: () => { setConfirmRemove(false); onRemoved?.(item.title); } })}
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
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  const canEdit = role === WorkspaceRole.ADMIN || role === WorkspaceRole.EDITOR;

  const { data: theme, isLoading, isError, error } = useThemeDetail(themeId);
  const { data: ciqScore, isLoading: ciqLoading } = useThemeCiqScore(themeId || null);
  const { data: revenueIntel, isLoading: revenueLoading } = useThemeRevenueIntelligence(themeId || null);
  // Load AI roadmap suggestions to surface ADD_TO_ROADMAP / INCREASE_PRIORITY banners
  const { data: aiSuggestions } = useAiRoadmapSuggestions(workspaceId);
  const aiSuggestion = aiSuggestions?.data?.find((s) => s.themeId === themeId);
  const recalculate = useRecalculateThemeCiq();
  const updateTheme = useUpdateTheme(themeId);
  const [rescoreToast, setRescoreToast] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [removeToast, setRemoveToast] = useState<string | null>(null);
  const [promoteModalOpen, setPromoteModalOpen] = useState(false);

  const handleFeedbackRemoved = (title: string) => {
    setRemoveToast(`“${title}” removed from this theme.`);
    setTimeout(() => setRemoveToast(null), 4000);
  };

  const handleAddToRoadmap = () => setPromoteModalOpen(true);

  const handlePromoteSuccess = (roadmapItemId: string) => {
    setActionToast({ message: 'Added to roadmap. You can now prioritize it there.', type: 'success' });
    setTimeout(() => setActionToast(null), 5000);
    router.push(`${r.roadmap}/${roadmapItemId}`);
  };

  const handleMarkInvestigating = () => {
    if (!themeId) return;
    // Reuse the existing updateTheme mutation via the edit flow — set status to ACTIVE
    // This is surfaced as a quick action without opening the modal
    router.push(`${r.themeItem(themeId)}?action=investigate`);
  };

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

  // ── Support Spikes state ──────────────────────────────────────────────────
  const [linkedSpikes, setLinkedSpikes] = useState<LinkedSpikesResponse | null>(null);
  const [spikesLoading, setSpikesLoading] = useState(false);

  // ── Similar Themes state ──────────────────────────────────────────────────
  const [similarThemes, setSimilarThemes] = useState<SimilarThemesResponse | null>(null);
  const [similarLoading, setSimilarLoading] = useState(false);

  // Fetch linked support spikes when workspaceId + themeId are available
  const fetchLinkedSpikes = async () => {
    if (!workspaceId || !themeId) return;
    setSpikesLoading(true);
    try {
      const res = await apiClient.themes.getLinkedSpikes(workspaceId, themeId);
      setLinkedSpikes(res);
    } catch {
      // Non-critical — spikes panel will just be empty
    } finally {
      setSpikesLoading(false);
    }
  };
  // Trigger once when theme data is available
  if (theme && !linkedSpikes && !spikesLoading && workspaceId && themeId) {
    fetchLinkedSpikes();
  }

  // Fetch similar themes for the merge suggestion panel
  const fetchSimilarThemes = async () => {
    if (!workspaceId || !themeId) return;
    setSimilarLoading(true);
    try {
      const res = await apiClient.themes.getSimilarThemes(workspaceId, themeId);
      setSimilarThemes(res);
    } catch {
      // Non-critical — panel will just be empty
    } finally {
      setSimilarLoading(false);
    }
  };
  if (theme && !similarThemes && !similarLoading && workspaceId && themeId) {
    fetchSimilarThemes();
  }

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
        (f.title ?? '').toLowerCase().includes(feedbackSearch.toLowerCase()) ||
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

      {/* ── Remove feedback toast ── */}
      {removeToast && (
        <div style={{
          padding: '0.625rem 1rem',
          background: '#fff8e1',
          border: '1px solid #ffe082',
          borderRadius: '0.5rem',
          fontSize: '0.85rem',
          color: '#b8860b',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>✓ {removeToast}</span>
          <button onClick={() => setRemoveToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b8860b', fontSize: '1rem', lineHeight: 1, padding: '0.1rem 0.3rem' }}>×</button>
        </div>
      )}

      {/* ── Action toast ── */}
      {actionToast && (
        <div style={{
          padding: '0.625rem 1rem',
          background: actionToast.type === 'success' ? '#e8f5e9' : '#fff5f5',
          border: `1px solid ${actionToast.type === 'success' ? '#c8e6c9' : '#f5c6cb'}`,
          borderRadius: '0.5rem',
          fontSize: '0.85rem',
          color: actionToast.type === 'success' ? '#2e7d32' : '#e63946',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>{actionToast.message}</span>
          {actionToast.type === 'success' && (
            <Link href={r.roadmap} style={{ fontSize: '0.8rem', color: '#1a6fc4', fontWeight: 600, textDecoration: 'none', marginLeft: '1rem', whiteSpace: 'nowrap' }}>
              View roadmap →
            </Link>
          )}
        </div>
      )}

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
              <p style={{ fontSize: '0.9rem', color: '#6C757D', margin: '0 0 1rem', lineHeight: 1.6 }}>
                {theme.description}
              </p>
            )}
            {/* ── Insight context strip — why this theme exists ── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.25rem' }}>
              {(theme.feedbackCount ?? 0) > 0 && (
                <span
                  title={`${theme.feedbackCount} feedback item${(theme.feedbackCount ?? 0) !== 1 ? 's' : ''} are directly assigned to this theme by the AI clustering engine. The \"Linked Feedback\" section below may show additional semantically-related items.`}
                  style={{ fontSize: '0.75rem', background: '#f0f4f8', color: '#495057', borderRadius: '0.375rem', padding: '0.2rem 0.6rem', fontWeight: 500, cursor: 'help' }}
                >
                  {theme.feedbackCount} direct signal{(theme.feedbackCount ?? 0) !== 1 ? 's' : ''}
                </span>
              )}
              {(theme.feedbackCount ?? 0) >= 3 && (
                <span style={{ fontSize: '0.75rem', background: '#e8f5e9', color: '#2e7d32', borderRadius: '0.375rem', padding: '0.2rem 0.6rem', fontWeight: 500 }}>
                  AI-clustered by semantic similarity
                </span>
              )}
              {theme.status === 'VERIFIED' && (
                <span style={{ fontSize: '0.75rem', background: '#e8f5e9', color: '#2e7d32', borderRadius: '0.375rem', padding: '0.2rem 0.6rem', fontWeight: 500 }}>
                  Verified by your team
                </span>
              )}
              {/* Resurfacing badge */}
              {(theme as any).resurfaceCount > 0 && (
                <span
                  title={`This theme was shipped but received fresh signals ${(theme as any).resurfaceCount} time${(theme as any).resurfaceCount !== 1 ? 's' : ''}. The problem may not be fully resolved.`}
                  style={{ fontSize: '0.75rem', background: '#fff3e0', color: '#e65100', borderRadius: '0.375rem', padding: '0.2rem 0.6rem', fontWeight: 600, border: '1px solid #ffcc80', cursor: 'help' }}
                >
                  🔄 Resurfacing ×{(theme as any).resurfaceCount}
                </span>
              )}
              {/* Recent Spike badge */}
              {(theme as any).trendDelta != null && (theme as any).trendDelta >= 30 && (
                <span
                  title={`Signal velocity: +${Number((theme as any).trendDelta).toFixed(0)}% week-over-week — rapid signal growth detected`}
                  style={{ fontSize: '0.75rem', background: '#e8f5e9', color: '#1b5e20', borderRadius: '0.375rem', padding: '0.2rem 0.6rem', fontWeight: 600, border: '1px solid #a5d6a7', cursor: 'help' }}
                >
                  ⚡ +{Number((theme as any).trendDelta).toFixed(0)}% WoW
                </span>
              )}
              {/* Last Activity — only shown when no stronger signal badge is present */}
              {(theme as any).lastEvidenceAt
                && !((theme as any).resurfaceCount > 0)
                && !((theme as any).trendDelta != null && (theme as any).trendDelta >= 30)
                && (
                <span
                  title={`Most recent signal attached: ${new Date((theme as any).lastEvidenceAt).toLocaleString()}`}
                  style={{ fontSize: '0.75rem', background: '#f0f4f8', color: '#495057', borderRadius: '0.375rem', padding: '0.2rem 0.6rem', fontWeight: 500, cursor: 'help' }}
                >
                  📅 {new Date((theme as any).lastEvidenceAt).toLocaleDateString()}
                </span>
              )}
            </div>
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
            <span
              title={[
                `Total cross-source signals: ${theme.totalSignalCount ?? theme.feedbackCount ?? 0}`,
                theme.feedbackCount ? `  · Feedback: ${theme.feedbackCount}` : null,
                (theme.voiceCount ?? 0) > 0 ? `  · Voice: ${theme.voiceCount}` : null,
                (theme.supportCount ?? 0) > 0 ? `  · Support: ${theme.supportCount}` : null,
                (theme.surveyCount ?? 0) > 0 ? `  · Survey: ${theme.surveyCount}` : null,
              ].filter(Boolean).join('\n')}
              style={{ fontSize: '0.75rem', color: '#adb5bd', display: 'block', marginBottom: '0.25rem', cursor: 'help' }}
            >
              Total Signals
            </span>
            <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0a2540' }}>
              {theme.totalSignalCount ?? theme.feedbackCount ?? 0}
            </span>
            {(theme.totalSignalCount ?? 0) > (theme.feedbackCount ?? 0) && (
              <span style={{ fontSize: '0.7rem', color: '#6C757D', display: 'block', marginTop: '0.1rem' }}>
                {theme.feedbackCount} direct
              </span>
            )}
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

      {/* ── Next Steps action bar ── */}
      {canEdit && (
        <div style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '0.75rem',
          padding: '0.875rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6C757D', marginRight: '0.25rem' }}>Next steps:</span>
          <button
            onClick={handleAddToRoadmap}
            style={{
              padding: '0.4rem 0.875rem', borderRadius: '0.5rem',
              border: 'none', background: '#0a2540',
              color: '#fff', fontSize: '0.8rem', cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            + Add to Roadmap
          </button>
          <Link
            href={r.inbox}
            style={{
              padding: '0.4rem 0.875rem', borderRadius: '0.5rem',
              border: '1px solid #ced4da', background: '#fff',
              color: '#495057', fontSize: '0.8rem', fontWeight: 600,
              textDecoration: 'none', display: 'inline-block',
            }}
          >
            Review feedback inbox
          </Link>
          <Link
            href={r.intelligenceThemes}
            style={{
              padding: '0.4rem 0.875rem', borderRadius: '0.5rem',
              border: '1px solid #ced4da', background: '#fff',
              color: '#495057', fontSize: '0.8rem', fontWeight: 600,
              textDecoration: 'none', display: 'inline-block',
            }}
          >
            Compare with other themes
          </Link>
        </div>
      )}

      {/* ── Cluster Confidence + “Why This Theme Exists” Panel ── */}
      <div style={{ ...CARD, background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)', border: '1px solid #bbf7d0' }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1rem' }}>🔍</span>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#15803d', margin: 0 }}>Why This Theme Exists</h2>
          </div>
          {/* Evidence Quality badge (cluster cohesion — distinct from AI confidence) */}
          {theme.clusterConfidence != null && (
            <span
              title={`Evidence Quality: ${Math.round(theme.clusterConfidence)}% — measures how cohesive the feedback cluster is (semantic similarity, cluster size, and variance). High ≥70%: feedback items are tightly related. Medium 40–69%: moderate cohesion. Low <40%: mixed signals, some items may not belong. This is NOT the same as AI Confidence.`}
              style={{
                fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em',
                padding: '0.2rem 0.6rem', borderRadius: '999px', cursor: 'help',
                background: theme.clusterConfidence >= 70 ? '#e8f5e9' : theme.clusterConfidence >= 40 ? '#fff8e1' : '#fdecea',
                color: theme.clusterConfidence >= 70 ? '#2e7d32' : theme.clusterConfidence >= 40 ? '#b8860b' : '#c62828',
              }}
            >
              {theme.status === 'AI_GENERATED' ? 'AI Generated • ' : ''}
              🔍 Evidence Quality: {Math.round(theme.clusterConfidence)}%
            </span>
          )}
        </div>

        {/* Low confidence warning */}
        {theme.clusterConfidence != null && theme.clusterConfidence < 40 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '0.5rem', marginBottom: '0.875rem' }}>
            <span style={{ fontSize: '0.9rem' }}>⚠️</span>
            <span style={{ fontSize: '0.8rem', color: '#92400e', fontWeight: 600 }}>Mixed signals detected — this cluster has low semantic coherence. Consider reviewing or splitting the theme.</span>
          </div>
        )}

        {/* Outlier warning */}
        {theme.outlierCount != null && theme.outlierCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '0.5rem', marginBottom: '0.875rem' }}>
            <span style={{ fontSize: '0.9rem' }}>📍</span>
            <span style={{ fontSize: '0.8rem', color: '#9a3412', fontWeight: 600 }}>{theme.outlierCount} item{theme.outlierCount !== 1 ? 's' : ''} may not belong here — similarity below threshold.</span>
          </div>
        )}

        {/* Dominant signal */}
        {theme.dominantSignal && (
          <div style={{ marginBottom: '0.875rem' }}>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', color: '#15803d', textTransform: 'uppercase', margin: '0 0 0.3rem' }}>Dominant signal</p>
            <p style={{ fontSize: '0.875rem', color: '#1e293b', margin: 0, fontStyle: 'italic' }}>“{theme.dominantSignal}”</p>
          </div>
        )}

        {/* Top keywords */}
        {theme.topKeywords && theme.topKeywords.length > 0 && (
          <div style={{ marginBottom: '0.875rem' }}>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', color: '#15803d', textTransform: 'uppercase', margin: '0 0 0.4rem' }}>Key phrases</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {theme.topKeywords.map((kw) => (
                <span key={kw} style={{ padding: '0.15rem 0.5rem', background: '#dcfce7', color: '#166534', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600 }}>{kw}</span>
              ))}
            </div>
          </div>
        )}

        {/* Confidence factors breakdown */}
        {theme.confidenceFactors && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginTop: '0.5rem' }}>
            <div style={{ background: '#fff', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', border: '1px solid #bbf7d0', textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>Avg Similarity</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#15803d' }}>{Math.round(theme.confidenceFactors.avgSimilarity * 100)}%</div>
            </div>
            <div style={{ background: '#fff', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', border: '1px solid #bbf7d0', textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>Cluster Size</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#15803d' }}>{theme.confidenceFactors.size}</div>
            </div>
            <div style={{ background: '#fff', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', border: '1px solid #bbf7d0', textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>Variance</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: theme.confidenceFactors.variance < 0.05 ? '#15803d' : theme.confidenceFactors.variance < 0.12 ? '#b8860b' : '#c62828' }}>{theme.confidenceFactors.variance.toFixed(3)}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── AI Roadmap Recommendation Banner ── */}
      {aiSuggestion && (aiSuggestion.suggestionType === 'ADD_TO_ROADMAP' || aiSuggestion.suggestionType === 'INCREASE_PRIORITY') && (
        <div
          style={{
            borderRadius: '0.875rem',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
            background: aiSuggestion.suggestionType === 'ADD_TO_ROADMAP'
              ? 'linear-gradient(135deg, #ede9fe 0%, #f5f3ff 100%)'
              : 'linear-gradient(135deg, #fef3c7 0%, #fffbeb 100%)',
            border: `1px solid ${aiSuggestion.suggestionType === 'ADD_TO_ROADMAP' ? '#c4b5fd' : '#fde68a'}`,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>            {/* ── What to do ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
              <span style={{ fontSize: '1rem' }}>
                {aiSuggestion.suggestionType === 'ADD_TO_ROADMAP' ? '🗺️' : '⬆️'}
              </span>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#adb5bd',
                }}
              >
                What to do
              </span>
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: aiSuggestion.suggestionType === 'ADD_TO_ROADMAP' ? '#7c3aed' : '#b45309',
                }}
              >
                {aiSuggestion.suggestionType === 'ADD_TO_ROADMAP' ? 'Add to Roadmap' : 'Increase Priority'}
              </span>
            </div>
            {/* ── Why this matters ── */}
            <div style={{ marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: '#adb5bd' }}>Why this matters&nbsp;</span>
              <span style={{ fontSize: '0.875rem', color: '#1e293b', lineHeight: 1.55 }}>{aiSuggestion.reason}</span>
            </div>
            {/* ── Dominant driver ── */}
            {aiSuggestion.dominantDriver && (
              <div style={{ marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: '#adb5bd' }}>Dominant driver&nbsp;</span>
                <span style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 600, lineHeight: 1.5 }}>{aiSuggestion.dominantDriver}</span>
              </div>
            )}
            {/* ── Confidence ── */}
            {aiSuggestion.confidenceExplanation && (
              <div style={{ marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: '#adb5bd' }}>Confidence&nbsp;</span>
                <span style={{
                  fontSize: '0.7rem', fontWeight: 700,
                  padding: '0.1rem 0.45rem', borderRadius: '999px',
                  background: aiSuggestion.confidence === 'HIGH' ? '#f0fdf4' : aiSuggestion.confidence === 'MEDIUM' ? '#fefce8' : '#f8fafc',
                  color: aiSuggestion.confidence === 'HIGH' ? '#15803d' : aiSuggestion.confidence === 'MEDIUM' ? '#a16207' : '#6C757D',
                }}>{aiSuggestion.confidence}</span>
                <span style={{ fontSize: '0.78rem', color: '#6C757D', lineHeight: 1.5 }}>{aiSuggestion.confidenceExplanation}</span>
              </div>
            )}
            {/* ── What changed ── */}
            {((aiSuggestion.signalSummary?.trendDelta != null && Math.abs(aiSuggestion.signalSummary.trendDelta) >= 10) ||
              (aiSuggestion.signalSummary?.resurfaceCount != null && aiSuggestion.signalSummary.resurfaceCount > 0)) && (
              <div>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: '#adb5bd' }}>What changed&nbsp;</span>
                <span style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>
                  {aiSuggestion.signalSummary?.trendDelta != null && Math.abs(aiSuggestion.signalSummary.trendDelta) >= 10
                    ? `Signal velocity ${aiSuggestion.signalSummary.trendDelta > 0 ? '+' : ''}${Math.round(aiSuggestion.signalSummary.trendDelta)}% WoW`
                    : ''}
                  {aiSuggestion.signalSummary?.resurfaceCount != null && aiSuggestion.signalSummary.resurfaceCount > 0
                    ? `${aiSuggestion.signalSummary.trendDelta != null && Math.abs(aiSuggestion.signalSummary.trendDelta) >= 10 ? ' · ' : ''}Resurfaced ×${aiSuggestion.signalSummary.resurfaceCount} after shipping`
                    : ''}
                </span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            {aiSuggestion.suggestionType === 'ADD_TO_ROADMAP' && canEdit && (
              <button
                onClick={handleAddToRoadmap}
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  padding: '0.5rem 1.1rem',
                  borderRadius: '0.5rem',
                  background: '#7c3aed',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                + Add to Roadmap
              </button>
            )}
            {aiSuggestion.suggestionType === 'INCREASE_PRIORITY' && canEdit && (
              <button
                onClick={() => {
                  if (!themeId) return;
                  updateTheme.mutate(
                    { status: ThemeStatus.VERIFIED, pinned: true },
                    { onSuccess: () => setActionToast({ message: 'Theme verified and pinned — priority increased.', type: 'success' }) },
                  );
                }}
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  padding: '0.5rem 1.1rem',
                  borderRadius: '0.5rem',
                  background: '#b45309',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Mark High Priority
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── AI Intelligence Panel ── */}
      <div
        style={{
          background: (theme.aiSummary || theme.aiExplanation || theme.aiRecommendation)
            ? 'linear-gradient(135deg, #f5f3ff 0%, #eff6ff 100%)'
            : '#fff',
          border: '1px solid',
          borderColor: (theme.aiSummary || theme.aiExplanation || theme.aiRecommendation)
            ? '#ddd6fe'
            : '#e9ecef',
          borderRadius: '0.875rem',
          padding: '1.5rem',
          boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1rem' }}>✨</span>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#5b21b6', margin: 0 }}>AI Intelligence</h2>
          </div>
          {theme.aiConfidence != null && (
            <span
              title={
                theme.aiConfidence >= 0.75
                  ? `AI Confidence: High (${Math.round(theme.aiConfidence * 100)}%) — The AI had rich, consistent evidence to generate reliable insights. Summaries and recommendations can be trusted.`
                  : theme.aiConfidence >= 0.45
                  ? `AI Confidence: Medium (${Math.round(theme.aiConfidence * 100)}%) — Moderate evidence available. Review AI insights alongside the raw feedback before acting.`
                  : `AI Confidence: Low (${Math.round(theme.aiConfidence * 100)}%) — Limited or inconsistent evidence. AI insights are provisional. Gather more feedback signals before relying on them.`
              }
              style={{
                fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em',
                padding: '0.2rem 0.6rem', borderRadius: '999px', cursor: 'help',
                background: theme.aiConfidence >= 0.75 ? '#e8f5e9' : theme.aiConfidence >= 0.45 ? '#fff8e1' : '#f0f4f8',
                color: theme.aiConfidence >= 0.75 ? '#2e7d32' : theme.aiConfidence >= 0.45 ? '#b8860b' : '#6C757D',
              }}
            >
              {theme.aiConfidence >= 0.75 ? 'Confidence: High' : theme.aiConfidence >= 0.45 ? 'Confidence: Medium' : 'Confidence: Low'}
            </span>
          )}
        </div>

        {!(theme.aiSummary || theme.aiExplanation || theme.aiRecommendation) ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px dashed #cbd5e1' }}>
            <span style={{ fontSize: '1.25rem' }}>⏳</span>
            <div>
              <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: '#475569' }}>AI insights pending</p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>Import feedback and run the AI pipeline to generate insights for this theme.</p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* AI Summary */}
            {theme.aiSummary && (
              <div>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', color: '#7c3aed', textTransform: 'uppercase', margin: '0 0 0.375rem' }}>Summary</p>
                <p style={{ fontSize: '0.9rem', color: '#1e293b', lineHeight: 1.65, margin: 0 }}>{theme.aiSummary}</p>
              </div>
            )}

            {/* Why it matters */}
            {theme.aiExplanation && (
              <div style={{ padding: '0.875rem 1rem', background: '#fffbeb', borderRadius: '0.5rem', borderLeft: '3px solid #f59e0b' }}>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', color: '#d97706', textTransform: 'uppercase', margin: '0 0 0.375rem' }}>💡 Why it matters</p>
                <p style={{ fontSize: '0.875rem', color: '#1e293b', lineHeight: 1.6, margin: 0 }}>{theme.aiExplanation}</p>
              </div>
            )}

            {/* Suggested action */}
            {theme.aiRecommendation && (
              <div style={{ padding: '0.875rem 1rem', background: '#f0fdf4', borderRadius: '0.5rem', borderLeft: '3px solid #22c55e' }}>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', color: '#16a34a', textTransform: 'uppercase', margin: '0 0 0.375rem' }}>⚡ Suggested action</p>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b', lineHeight: 1.6, margin: 0 }}>{theme.aiRecommendation}</p>
              </div>
            )}
          </div>
        )}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.125rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>
                Priority Intelligence
              </h3>
              <CiqImpactBadge score={ciqScore?.priorityScore ?? theme.priorityScore} showScore size="sm" />
            </div>
            <p style={{ fontSize: '0.78rem', color: '#6C757D', margin: '0 0 0.25rem' }}>
              Composite score across ARR influence, deal pipeline, feedback volume, voice signals, survey demand, and support pressure.
              A higher score means more customers are affected and more revenue is at stake.
            </p>
            {ciqScore && (
              <p style={{ fontSize: '0.82rem', color: ciqScore.priorityScore >= 70 ? '#c62828' : ciqScore.priorityScore >= 40 ? '#b8860b' : '#2e7d32', fontWeight: 600, margin: 0 }}>
                <span style={{ marginRight: '0.3rem' }}>
                  {ciqScore.priorityScore >= 70 ? '🔴' : ciqScore.priorityScore >= 40 ? '🟡' : '🟢'}
                </span>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#adb5bd', marginRight: '0.3rem' }}>Why this matters</span>
                {ciqScore.priorityReason ?? (
                  ciqScore.priorityScore >= 70
                    ? `High urgency — this theme is affecting significant revenue and customer volume.`
                    : ciqScore.priorityScore >= 40
                    ? `Moderate priority — worth tracking; consider adding to the roadmap.`
                    : `Low urgency — monitor for signal growth before escalating.`
                )}
              </p>
            )}
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

        {/* Signal-only mode banner — shown when no CRM data is available */}
        {ciqScore && (ciqScore.scoringMode === 'signal-only' || (ciqScore.revenueImpactValue === 0 && ciqScore.uniqueCustomerCount === 0)) && (
          <div style={{
            padding: '0.625rem 0.875rem',
            background: '#fff8e1',
            border: '1px solid #ffe082',
            borderRadius: '0.5rem',
            fontSize: '0.78rem',
            color: '#795548',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.5rem',
          }}>
            <span style={{ fontSize: '1rem', flexShrink: 0 }}>💡</span>
            <span>
              <strong>Scoring in signal-only mode.</strong> No CRM data (ARR, customers, or deals) is linked to this workspace yet.
              The priority score is based entirely on feedback volume, recency, velocity, and source diversity.
              <strong> Connect your CRM</strong> (Salesforce, HubSpot) via Integrations to unlock revenue-weighted prioritization and see which themes are affecting your highest-value accounts.
            </span>
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
                {ciqScore.confidenceExplanation && (
                  <div style={{ fontSize: '0.65rem', color: '#6C757D', marginTop: '0.25rem', lineHeight: 1.3 }}>
                    {ciqScore.confidenceExplanation}
                  </div>
                )}
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

            {/* Dominant driver badge */}
            {ciqScore.dominantDriver && ciqScore.scoreExplanation[ciqScore.dominantDriver] && (
              <div style={{ marginBottom: '1rem', padding: '0.5rem 0.75rem', background: '#eef6ff', border: '1px solid #bfdbfe', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#1a6fc4', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Top Driver</span>
                <span style={{ fontSize: '0.8rem', color: '#1e3a5f' }}>
                  {ciqScore.scoreExplanation[ciqScore.dominantDriver].label} &mdash; contributing {ciqScore.scoreExplanation[ciqScore.dominantDriver].contribution.toFixed(1)} pts to the priority score
                </span>
              </div>
            )}
            {/* Velocity trend badge */}
            {ciqScore.velocityDelta != null && ciqScore.velocityDelta !== 0 && (
              <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: ciqScore.velocityDelta > 0 ? '#f0fdf4' : '#fff7ed', border: `1px solid ${ciqScore.velocityDelta > 0 ? '#bbf7d0' : '#fed7aa'}`, borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem' }}>{ciqScore.velocityDelta > 0 ? '📈' : '📉'}</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: ciqScore.velocityDelta > 0 ? '#15803d' : '#c2410c', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Signal Velocity</span>
                <span style={{ fontSize: '0.8rem', color: '#1e3a5f' }}>
                  {ciqScore.velocityDelta > 0 ? '+' : ''}{ciqScore.velocityDelta.toFixed(0)}% week-over-week &mdash; {ciqScore.velocityDelta > 20 ? 'rapidly growing signal' : ciqScore.velocityDelta > 0 ? 'growing signal' : 'declining signal'}
                </span>
              </div>
            )}
            {/* Source diversity badge */}
            {(ciqScore.sourceDiversityCount ?? 0) > 1 && (
              <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem' }}>🔗</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Cross-Source</span>
                <span style={{ fontSize: '0.8rem', color: '#1e3a5f' }}>
                  Corroborated by {ciqScore.sourceDiversityCount} independent source{(ciqScore.sourceDiversityCount ?? 0) !== 1 ? 's' : ''} &mdash; higher confidence in this theme
                </span>
              </div>
            )}
            {/* Sentiment contribution row */}
            {ciqScore.sentimentScore != null && (
              <div style={{ marginBottom: '0.875rem', padding: '0.5rem 0.75rem', background: '#fff', border: '1px solid #e3edf7', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Avg Sentiment</span>
                <CiqSignalBreakdown breakdown={null} sentiment={ciqScore.sentimentScore} />
              </div>
            )}
            {/* ── Why this score? — percentage-based CIQ breakdown (Step 1 Gap Fix) ── */}
            {Object.keys(ciqScore.scoreExplanation).length > 0 && (() => {
              // Group raw scoreExplanation factors into 4 canonical buckets
              const REVENUE_KEYS   = new Set(['arrValue', 'dealInfluence', 'accountPriority']);
              const FREQ_KEYS      = new Set(['feedbackFrequency', 'voiceSignal', 'supportSignal', 'customerCount', 'signalStrength', 'voteSignal', 'surveySignal']);
              const SENTIMENT_KEYS = new Set(['sentimentSignal']);
              const VELOCITY_KEYS  = new Set(['velocitySignal', 'sourceDiversitySignal', 'recencySignal', 'resurfacingSignal']);
              const bucket = (keys: Set<string>) =>
                Object.entries(ciqScore.scoreExplanation)
                  .filter(([k]) => keys.has(k))
                  .reduce((sum, [, f]) => sum + f.contribution, 0);
              const rev  = bucket(REVENUE_KEYS);
              const freq = bucket(FREQ_KEYS);
              const sent = bucket(SENTIMENT_KEYS);
              const vel  = bucket(VELOCITY_KEYS);
              const total = rev + freq + sent + vel || 1;
              const pct = (v: number) => Math.round((v / total) * 100);
              const GROUPS = [
                { label: 'Revenue Impact', value: rev,  pct: pct(rev),  color: '#2e7d32', icon: '💰' },
                { label: 'Frequency',      value: freq, pct: pct(freq), color: '#1a6fc4', icon: '📊' },
                { label: 'Sentiment',      value: sent, pct: pct(sent), color: '#c2410c', icon: '💬' },
                { label: 'Velocity',       value: vel,  pct: pct(vel),  color: '#7c3aed', icon: '⚡' },
              ].sort((a, b) => b.pct - a.pct);
              const topGroup = GROUPS[0];
              return (
                <div style={{ marginTop: '1rem', padding: '1rem', background: '#fff', border: '1px solid #e3edf7', borderRadius: '0.75rem' }}>
                  {/* Section heading + dominant driver pill */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0a2540', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Why this score?
                    </span>
                    <span style={{ fontSize: '0.7rem', background: '#eef6ff', color: '#1a6fc4', border: '1px solid #bfdbfe', borderRadius: '1rem', padding: '0.2rem 0.6rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      {topGroup.icon} Dominant: {topGroup.label} ({topGroup.pct}%)
                    </span>
                  </div>
                  {/* Four canonical horizontal bar rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {GROUPS.map((g) => (
                      <div key={g.label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                          <span style={{ fontSize: '0.78rem', color: '#374151', fontWeight: g.label === topGroup.label ? 700 : 400, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            {g.icon} {g.label}
                            {g.label === topGroup.label && (
                              <span style={{ fontSize: '0.6rem', background: '#dbeafe', color: '#1a6fc4', borderRadius: '0.25rem', padding: '0.1rem 0.35rem', fontWeight: 700 }}>TOP</span>
                            )}
                          </span>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: g.color }}>{g.pct}%</span>
                        </div>
                        <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${g.pct}%`, height: '100%', background: g.color, borderRadius: '4px', transition: 'width 0.5s ease', opacity: g.label === topGroup.label ? 1 : 0.7 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Expandable fine-grained factor list */}
                  <details style={{ marginTop: '0.875rem' }}>
                    <summary style={{ fontSize: '0.72rem', color: '#6C757D', cursor: 'pointer', userSelect: 'none' }}>View all contributing factors</summary>
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {Object.entries(ciqScore.scoreExplanation)
                        .sort((a, b) => b[1].contribution - a[1].contribution)
                        .map(([key, factor]) => {
                          const isDominant = key === ciqScore.dominantDriver;
                          const totalContrib = Object.values(ciqScore.scoreExplanation).reduce((s, f) => s + f.contribution, 0) || 1;
                          const factorPct = Math.round((factor.contribution / totalContrib) * 100);
                          return (
                            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '0.72rem', color: '#495057', flex: 1, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                {factor.label}
                                {isDominant && <span style={{ fontSize: '0.58rem', background: '#dbeafe', color: '#1a6fc4', borderRadius: '0.2rem', padding: '0.05rem 0.25rem', fontWeight: 700 }}>TOP</span>}
                              </span>
                              <div style={{ width: '80px', height: '5px', background: '#e9ecef', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${factorPct}%`, height: '100%', background: isDominant ? '#1a6fc4' : '#20A4A4', borderRadius: '3px' }} />
                              </div>
                              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6C757D', minWidth: '2.5rem', textAlign: 'right' }}>{factorPct}%</span>
                            </div>
                          );
                        })}
                    </div>
                  </details>
                </div>
              );
            })()}
          </>
        ) : (
          <p style={{ fontSize: '0.85rem', color: '#6C757D', margin: 0 }}>
            {(theme.feedbackCount ?? 0) >= 3
              ? 'CIQ score not yet computed. Click “Recalculate” to generate the priority score.'
              : 'Add at least 3 feedback signals to unlock CIQ scoring for this theme.'}
          </p>
        )}
      </div>

      {/* ── Source Contribution Panel ── */}
      {((theme.feedbackCount ?? 0) + (theme.voiceCount ?? 0) + (theme.supportCount ?? 0) + (theme.surveyCount ?? 0)) > 0 && (
        <div style={{ ...CARD, border: '1px solid #e0e7ff', background: 'linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', margin: '0 0 0.125rem' }}>Source Contribution</h3>
              <p style={{ fontSize: '0.78rem', color: '#6C757D', margin: 0 }}>How each source strengthens this theme in the unified intelligence system</p>
            </div>
            {(theme.totalSignalCount ?? 0) > 0 && (
              <span style={{ background: '#e0e7ff', color: '#3730a3', borderRadius: '2rem', padding: '0.25rem 0.75rem', fontSize: '0.8rem', fontWeight: 600 }}>
                {theme.totalSignalCount} total signals
              </span>
            )}
          </div>
          {(() => {
            const total = (theme.feedbackCount ?? 0) + (theme.voiceCount ?? 0) + (theme.supportCount ?? 0) + (theme.surveyCount ?? 0);
            const sources = [
              { label: 'Feedback', count: theme.feedbackCount ?? 0, color: '#20A4A4', icon: '💬', desc: 'Manual, CSV, portal, email, Slack, API' },
              { label: 'Voice',    count: theme.voiceCount   ?? 0, color: '#1565c0', icon: '🎤', desc: 'Audio transcripts, public portal voice' },
              { label: 'Support',  count: theme.supportCount ?? 0, color: '#6a1b9a', icon: '🎧', desc: 'Zendesk, Intercom, support ticket clusters' },
              { label: 'Survey',   count: theme.surveyCount  ?? 0, color: '#b45309', icon: '📋', desc: 'NPS, CSAT, open-text survey responses' },
            ].filter((s) => s.count > 0);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {sources.map((src) => {
                  const pct = total > 0 ? Math.round((src.count / total) * 100) : 0;
                  return (
                    <div key={src.label}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.85rem' }}>{src.icon}</span>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0a2540', flex: 1 }}>{src.label}</span>
                        <span style={{ fontSize: '0.72rem', color: '#6C757D' }}>{src.desc}</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: src.color, width: '4rem', textAlign: 'right' }}>{src.count} ({pct}%)</span>
                      </div>
                      <div style={{ height: '6px', background: '#e9ecef', borderRadius: '3px' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: src.color, borderRadius: '3px', transition: 'width 0.4s' }} />
                      </div>
                    </div>
                  );
                })}
                <p style={{ fontSize: '0.75rem', color: '#6C757D', margin: '0.5rem 0 0', borderTop: '1px solid #e0e7ff', paddingTop: '0.625rem' }}>
                  All sources feed the same CIQ priority score and roadmap. There is no separate survey or support score.
                </p>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Revenue Intelligence Panel ── */}
      <div style={{ ...CARD, background: 'linear-gradient(135deg, #f0fff4 0%, #e8f8f0 100%)', border: '1px solid #a7f3d0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', margin: '0 0 0.125rem' }}>Revenue Intelligence</h3>
            <p style={{ fontSize: '0.78rem', color: '#6C757D', margin: 0 }}>Deal pipeline and top requesting customers</p>
          </div>
          {revenueIntel && revenueIntel.totalInfluence > 0 && (
            <span style={{ background: '#d1fae5', color: '#065f46', borderRadius: '2rem', padding: '0.25rem 0.75rem', fontSize: '0.8rem', fontWeight: 600 }}>
              ${(revenueIntel.totalInfluence / 1000).toFixed(0)}K total influence
            </span>
          )}
        </div>
        {revenueLoading ? (
          <div style={{ display: 'flex', gap: '1rem' }}>
            {[120, 100, 140].map((w, i) => <Skeleton key={i} style={{ height: '3rem', width: `${w}px` }} />)}
          </div>
        ) : revenueIntel ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Deal signals */}
            <div>
              <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0a2540', margin: '0 0 0.625rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Deal Signals</h4>
              {revenueIntel.deals.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: '#adb5bd', margin: 0 }}>No deals linked yet</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {revenueIntel.deals.slice(0, 5).map((deal) => (
                    <div key={deal.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.45rem 0.65rem', background: '#fff', borderRadius: '0.5rem', fontSize: '0.78rem', border: '1px solid #d1fae5' }}>
                      <div>
                        <div style={{ fontWeight: 600, color: '#0a2540' }}>{deal.title}</div>
                        <div style={{ color: '#6C757D', fontSize: '0.72rem' }}>{deal.customer?.name} · {deal.stage}</div>
                      </div>
                      <div style={{ fontWeight: 700, color: deal.status === 'OPEN' ? '#059669' : '#6C757D', fontSize: '0.8rem' }}>
                        ${(deal.annualValue / 1000).toFixed(0)}K
                      </div>
                    </div>
                  ))}
                  {revenueIntel.deals.length > 5 && (
                    <p style={{ fontSize: '0.72rem', color: '#adb5bd', margin: '0.2rem 0 0' }}>+{revenueIntel.deals.length - 5} more deals</p>
                  )}
                </div>
              )}
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '1.25rem' }}>
                <div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#059669' }}>${(revenueIntel.openInfluence / 1000).toFixed(0)}K</div>
                  <div style={{ fontSize: '0.68rem', color: '#adb5bd', textTransform: 'uppercase' }}>Open Pipeline</div>
                </div>
                <div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0a2540' }}>{revenueIntel.dealCount}</div>
                  <div style={{ fontSize: '0.68rem', color: '#adb5bd', textTransform: 'uppercase' }}>Total Deals</div>
                </div>
              </div>
            </div>
            {/* Top requesting customers */}
            <div>
              <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0a2540', margin: '0 0 0.625rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Top Requesting Customers</h4>
              {revenueIntel.topCustomers.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: '#adb5bd', margin: 0 }}>No customer signals yet</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {revenueIntel.topCustomers.slice(0, 5).map((c) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.45rem 0.65rem', background: '#fff', borderRadius: '0.5rem', fontSize: '0.78rem', border: '1px solid #d1fae5' }}>
                      <div>
                        <div style={{ fontWeight: 600, color: '#0a2540' }}>{c.name}</div>
                        <div style={{ color: '#6C757D', fontSize: '0.72rem' }}>{c.companyName ?? c.lifecycleStage} · {c.feedbackCount} signals</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem' }}>
                        <span style={{ fontWeight: 700, color: '#0a2540', fontSize: '0.78rem' }}>${(c.arrValue / 1000).toFixed(0)}K ARR</span>
                        {c.churnRisk != null && c.churnRisk > 0.6 && (
                          <span style={{ background: '#fee2e2', color: '#dc2626', borderRadius: '0.25rem', padding: '0.1rem 0.35rem', fontSize: '0.62rem', fontWeight: 600 }}>AT RISK</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {revenueIntel.totalCustomerARR > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0a2540' }}>${(revenueIntel.totalCustomerARR / 1000).toFixed(0)}K</div>
                  <div style={{ fontSize: '0.68rem', color: '#adb5bd', textTransform: 'uppercase' }}>Customer ARR at Stake</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p style={{ fontSize: '0.85rem', color: '#6C757D', margin: 0 }}>No revenue signals linked to this theme yet. Link deals or customers to see revenue intelligence.</p>
        )}
      </div>

      {/* ── Pipeline Freshness Panel ── */}
      {theme.pipelineState && (
        <div style={{ ...CARD, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
            <span style={{ fontSize: '0.9rem' }}>⚙️</span>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#374151', margin: 0 }}>Pipeline Status</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(9rem, 1fr))', gap: '0.625rem' }}>
            {[
              {
                label: 'Clustered',
                done: theme.pipelineState.clustered,
                ts: null,
                tip: theme.pipelineState.clustered
                  ? 'Feedback has been semantically clustered into this theme'
                  : 'Clustering has not run yet — trigger a recluster from the Themes list',
              },
              {
                label: 'CIQ Scored',
                done: theme.pipelineState.scored,
                ts: theme.pipelineState.lastScoredAt,
                tip: theme.pipelineState.scored
                  ? `Last scored: ${theme.pipelineState.lastScoredAt ? new Date(theme.pipelineState.lastScoredAt).toLocaleString() : 'unknown'}`
                  : 'CIQ scoring has not run yet — click Recalculate in the Priority Intelligence panel',
              },
              {
                label: 'AI Narrated',
                done: theme.pipelineState.narrated,
                ts: theme.pipelineState.lastNarratedAt,
                tip: theme.pipelineState.narrated
                  ? `Last narrated: ${theme.pipelineState.lastNarratedAt ? new Date(theme.pipelineState.lastNarratedAt).toLocaleString() : 'unknown'}`
                  : 'AI narration has not run yet — it runs automatically after CIQ scoring',
              },
              {
                label: 'Aggregated',
                done: theme.pipelineState.lastAggregatedAt != null,
                ts: theme.pipelineState.lastAggregatedAt,
                tip: theme.pipelineState.lastAggregatedAt
                  ? `Last aggregated: ${new Date(theme.pipelineState.lastAggregatedAt).toLocaleString()}`
                  : 'Signal aggregation has not run yet',
              },
            ].map((step) => (
              <div
                key={step.label}
                title={step.tip}
                style={{
                  background: step.done ? '#f0fdf4' : '#fff',
                  border: `1px solid ${step.done ? '#bbf7d0' : '#e2e8f0'}`,
                  borderRadius: '0.5rem',
                  padding: '0.5rem 0.625rem',
                  cursor: 'help',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.2rem' }}>
                  <span style={{ fontSize: '0.75rem' }}>{step.done ? '✅' : '⏳'}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: step.done ? '#15803d' : '#6C757D' }}>{step.label}</span>
                </div>
                {step.ts && (
                  <div style={{ fontSize: '0.65rem', color: '#9ca3af' }}>
                    {new Date(step.ts).toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Similar Themes / Merge Suggestion Panel ── */}
      {(similarLoading || (similarThemes && similarThemes.suggestions.length > 0)) && (
        <div style={{ ...CARD, border: '1px solid #fde68a', background: 'linear-gradient(135deg, #fffbeb 0%, #fef9e7 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.9rem' }}>🔀</span>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#92400e', margin: 0 }}>Similar Themes</h3>
              {similarThemes?.bootstrapMode && (
                <span
                  title="Bootstrap mode: similarity threshold is relaxed because the workspace has fewer than 20 themes. Suggestions may be less precise."
                  style={{ fontSize: '0.65rem', background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', borderRadius: '999px', padding: '0.1rem 0.45rem', fontWeight: 700, cursor: 'help' }}
                >
                  Bootstrap mode
                </span>
              )}
            </div>
            <span style={{ fontSize: '0.72rem', color: '#92400e' }}>These themes may overlap — review before merging</span>
          </div>
          {similarLoading ? (
            <p style={{ fontSize: '0.85rem', color: '#adb5bd', margin: 0 }}>Checking for similar themes…</p>
          ) : similarThemes && similarThemes.suggestions.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {similarThemes.suggestions.slice(0, 5).map((s: AutoMergeSuggestion) => {
                const isSource = s.sourceId === themeId;
                const otherId   = isSource ? s.targetId   : s.sourceId;
                const otherTitle = isSource ? s.targetTitle : s.sourceTitle;
                const simPct = Math.round(s.similarity * 100);
                return (
                  <div
                    key={otherId}
                    style={{
                      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                      gap: '0.75rem', padding: '0.75rem 0.875rem',
                      background: '#fff', border: '1px solid #fde68a', borderRadius: '0.625rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                        <span
                          title={`Hybrid similarity score: ${simPct}% (embedding ×0.7 + keyword ×0.3)`}
                          style={{
                            fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem',
                            borderRadius: '999px', cursor: 'help',
                            background: simPct >= 85 ? '#fee2e2' : simPct >= 70 ? '#fef3c7' : '#f0f4f8',
                            color: simPct >= 85 ? '#b91c1c' : simPct >= 70 ? '#92400e' : '#495057',
                          }}
                        >
                          {simPct}% match
                        </span>
                        {s.embeddingSimilarity != null && (
                          <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}
                            title={`Embedding: ${Math.round(s.embeddingSimilarity * 100)}% · Keyword: ${s.keywordSimilarity != null ? Math.round(s.keywordSimilarity * 100) + '%' : 'n/a'}`}
                          >
                            emb {Math.round(s.embeddingSimilarity * 100)}%
                          </span>
                        )}
                      </div>
                      <Link
                        href={r.themeItem(otherId)}
                        style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0a2540', textDecoration: 'none' }}
                      >
                        {otherTitle}
                      </Link>
                      {s.mergeReason && (
                        <p style={{ fontSize: '0.78rem', color: '#6C757D', margin: '0.2rem 0 0', lineHeight: 1.4 }}>
                          {s.mergeReason}
                        </p>
                      )}
                    </div>
                    {canEdit && (
                      <Link
                        href={r.themeItem(otherId)}
                        style={{
                          fontSize: '0.75rem', fontWeight: 600, padding: '0.3rem 0.7rem',
                          borderRadius: '0.375rem', border: '1px solid #fde68a',
                          background: '#fffbeb', color: '#92400e', textDecoration: 'none',
                          whiteSpace: 'nowrap', flexShrink: 0,
                        }}
                      >
                        Review →
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      )}

      {/* ── Support Spikes Panel ── */}
      {(spikesLoading || (linkedSpikes && linkedSpikes.totalClusters > 0)) && (
        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>
              🚨 Linked Support Spikes
            </h2>
            {linkedSpikes && linkedSpikes.activeSpikeCount > 0 && (
              <span style={{ fontSize: '0.72rem', fontWeight: 700, background: '#fee2e2', color: '#b91c1c', borderRadius: '999px', padding: '0.2rem 0.6rem', border: '1px solid #fca5a5' }}>
                {linkedSpikes.activeSpikeCount} active spike{linkedSpikes.activeSpikeCount > 1 ? 's' : ''}
              </span>
            )}
            <span style={{ fontSize: '0.75rem', color: '#6C757D', marginLeft: 'auto' }}>
              Support clusters linked to this theme
            </span>
          </div>
          {spikesLoading ? (
            <p style={{ fontSize: '0.85rem', color: '#adb5bd', margin: 0 }}>Loading support spikes…</p>
          ) : linkedSpikes && linkedSpikes.clusters.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {linkedSpikes.clusters.map((cluster) => (
                <div key={cluster.id} style={{ border: '1px solid #e9ecef', borderRadius: '0.625rem', padding: '0.875rem 1rem', background: cluster.hasActiveSpike ? '#fff8f0' : '#fafafa' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0a2540', margin: '0 0 0.25rem' }}>
                        {cluster.hasActiveSpike && <span style={{ marginRight: '0.35rem' }}>🔥</span>}
                        {cluster.title}
                      </p>
                      {cluster.description && (
                        <p style={{ fontSize: '0.78rem', color: '#6C757D', margin: 0 }}>{cluster.description}</p>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', flexShrink: 0 }}>
                      <span style={{ fontSize: '0.72rem', background: '#f0f4f8', color: '#495057', borderRadius: '999px', padding: '0.15rem 0.5rem', border: '1px solid #dee2e6' }}>
                        🎫 {cluster.ticketCount} tickets
                      </span>
                      {cluster.arrExposure > 0 && (
                        <span style={{ fontSize: '0.72rem', background: '#e8f5e9', color: '#2e7d32', borderRadius: '999px', padding: '0.15rem 0.5rem', border: '1px solid #a5d6a7' }}>
                          💰 ${(cluster.arrExposure / 100).toLocaleString()} ARR
                        </span>
                      )}
                      {cluster.negativeTicketPct != null && cluster.negativeTicketPct > 0.3 && (
                        <span style={{ fontSize: '0.72rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '999px', padding: '0.15rem 0.5rem', border: '1px solid #fca5a5' }}>
                          😤 {Math.round(cluster.negativeTicketPct * 100)}% negative
                        </span>
                      )}
                    </div>
                  </div>
                  {cluster.spikeEvents.length > 0 && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {cluster.spikeEvents.map((ev) => (
                        <div key={ev.id} style={{ fontSize: '0.75rem', color: '#e65100', background: '#fff3e0', borderRadius: '0.375rem', padding: '0.2rem 0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', width: 'fit-content' }}>
                          ⚡ Spike: {ev.ticketCount} tickets · z={ev.zScore.toFixed(1)} · {new Date(ev.windowStart).toLocaleDateString()}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

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
                item={item as ThemeLinkedFeedback}
                themeId={themeId}
                canEdit={canEdit}
                orgSlug={slug}
                onRemoved={handleFeedbackRemoved}
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
      {/* ── Promote to Roadmap Modal ── */}
      {promoteModalOpen && workspaceId && themeId && (
        <PromoteToRoadmapModal
          workspaceId={workspaceId}
          themeId={themeId}
          themeTitle={theme?.title ?? ''}
          isOpen={promoteModalOpen}
          onClose={() => setPromoteModalOpen(false)}
          onSuccess={handlePromoteSuccess}
        />
      )}
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}

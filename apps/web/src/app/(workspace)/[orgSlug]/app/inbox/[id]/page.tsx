'use client';

import { use, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFeedback } from '@/hooks/use-feedback';
import { useCurrentMemberRole, useWorkspace } from '@/hooks/use-workspace';
import { useThemeList } from '@/hooks/use-themes';
import { FeedbackStatus, FeedbackSourceType, WorkspaceRole, Theme } from '@/lib/api-types';
import { appRoutes } from '@/lib/routes';
import { CommentSection } from '@/components/modules/feedback/comment-section/component';
import { DuplicateSuggestionsPanel } from '@/components/modules/feedback/duplicate-suggestions/component';
import apiClient from '@/lib/api-client';

// ─── Voice Feedback Panel ────────────────────────────────────────────────────────

function VoiceFeedbackPanel({
  uploadAssetId,
  transcript,
  workspaceId,
}: {
  uploadAssetId: string | null | undefined;
  transcript: string | null;
  workspaceId: string;
}) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  const handleLoadAudio = async () => {
    if (!uploadAssetId) return;
    setLoadingAudio(true);
    setAudioError(null);
    try {
      const detail = await apiClient.voice.getById(workspaceId, uploadAssetId);
      setAudioUrl(detail.downloadUrl);
    } catch (err) {
      setAudioError((err as Error).message ?? 'Failed to load audio');
    } finally {
      setLoadingAudio(false);
    }
  };

  if (!uploadAssetId) return null;

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #f0f9ff 0%, #e8f7f7 100%)',
        border: '1px solid #bae6fd',
        borderRadius: '0.75rem',
        padding: '1rem 1.25rem',
        marginBottom: '1.25rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.75rem' }}>
        <div
          style={{
            width: 32, height: 32,
            background: '#20A4A4',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="white" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>Voice Feedback</p>
          <p style={{ fontSize: '0.72rem', color: '#6C757D', margin: 0 }}>Audio recorded and transcribed by AI</p>
        </div>
      </div>

      {/* Audio player */}
      {audioUrl ? (
        <audio
          controls
          src={audioUrl}
          style={{ width: '100%', height: 40, marginBottom: '0.75rem' }}
        />
      ) : (
        <button
          onClick={handleLoadAudio}
          disabled={loadingAudio}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: '#fff', border: '1px solid #20A4A4', color: '#20A4A4',
            borderRadius: 6, padding: '0.4rem 0.875rem', fontSize: '0.8rem',
            fontWeight: 600, cursor: loadingAudio ? 'wait' : 'pointer',
            marginBottom: '0.75rem',
          }}
        >
          {loadingAudio ? (
            <>⏳ Loading audio…</>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <polygon points="5,3 19,12 5,21" fill="#20A4A4" />
              </svg>
              Load &amp; Play Audio
            </>
          )}
        </button>
      )}
      {audioError && (
        <p style={{ fontSize: '0.78rem', color: '#dc2626', marginBottom: '0.5rem' }}>{audioError}</p>
      )}

      {/* Transcript toggle */}
      {transcript && (
        <div>
          <button
            onClick={() => setShowTranscript((v) => !v)}
            style={{
              background: 'none', border: 'none', color: '#0369a1',
              fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
              padding: 0, display: 'flex', alignItems: 'center', gap: '0.3rem',
            }}
          >
            {showTranscript ? '▲ Hide transcript' : '▼ Show AI transcript'}
          </button>
          {showTranscript && (
            <div
              style={{
                marginTop: '0.625rem',
                background: '#fff',
                border: '1px solid #e0f2fe',
                borderRadius: 6,
                padding: '0.75rem 1rem',
                fontSize: '0.82rem',
                color: '#374151',
                lineHeight: 1.65,
                whiteSpace: 'pre-wrap',
                maxHeight: 240,
                overflowY: 'auto',
              }}
            >
              {transcript}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Design tokens ─────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  [FeedbackStatus.NEW]:       { bg: '#e8f7f7', color: '#20A4A4' },
  [FeedbackStatus.IN_REVIEW]: { bg: '#fff8e1', color: '#b8860b' },
  [FeedbackStatus.PROCESSED]: { bg: '#e8f5e9', color: '#2e7d32' },
  [FeedbackStatus.ARCHIVED]:  { bg: '#f0f4f8', color: '#6C757D' },
  [FeedbackStatus.MERGED]:    { bg: '#fce8ff', color: '#7c3aed' },
};

const SOURCE_LABELS: Record<string, string> = {
  [FeedbackSourceType.MANUAL]:        'Manual',
  [FeedbackSourceType.PUBLIC_PORTAL]: 'Portal',
  [FeedbackSourceType.EMAIL]:         'Email',
  [FeedbackSourceType.SLACK]:         'Slack',
  [FeedbackSourceType.CSV_IMPORT]:    'CSV Import',
  [FeedbackSourceType.VOICE]:         'Voice',
  [FeedbackSourceType.API]:           'API',
};

const STATUS_TRANSITIONS: FeedbackStatus[] = [
  FeedbackStatus.NEW,
  FeedbackStatus.IN_REVIEW,
  FeedbackStatus.PROCESSED,
  FeedbackStatus.ARCHIVED,
];

// ─── Link to Theme Modal ───────────────────────────────────────────────────────
/**
 * Lets an ADMIN or EDITOR manually link this feedback item to a theme.
 *
 * Per the PRD (Module 1 — Feedback Intelligence):
 *   "Theme clustering: auto theme generation, manual theme creation, theme hierarchy"
 *   "Data model: … theme linkage …"
 *
 * Feedback items (Inbox) are the core signal entity that get linked to themes.
 * Surveys are a separate module and are NOT linked to themes directly.
 */
function LinkToThemeModal({
  feedbackId,
  feedbackTitle,
  onClose,
}: {
  feedbackId: string;
  feedbackTitle: string;
  onClose: () => void;
}) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  const queryClient = useQueryClient();

  const [themeSearch, setThemeSearch] = useState('');
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch themes with optional search
  const { data: themePages, isLoading: loadingThemes } = useThemeList({
    search: themeSearch || undefined,
    limit: 50,
  });
  const themes: Theme[] = themePages?.pages.flatMap((p) => p.data) ?? [];

  // Link mutation — POST /workspaces/:id/themes/:themeId/feedback/:feedbackId
  const { mutate: linkToTheme, isPending: linking } = useMutation<
    void,
    Error,
    { themeId: string }
  >({
    mutationFn: ({ themeId }) =>
      apiClient.themes.addFeedback(workspaceId, themeId, feedbackId),
    onSuccess: (_, vars) => {
      // Invalidate theme detail and list so UI reflects new link count
      queryClient.invalidateQueries({ queryKey: ['themes', workspaceId, vars.themeId] });
      queryClient.invalidateQueries({ queryKey: ['themes', workspaceId, 'list'] });
      // Invalidate the feedback detail so linked themes section refreshes
      queryClient.invalidateQueries({ queryKey: ['feedback', feedbackId] });
      setSuccessMsg(`Feedback linked to "${selectedTheme?.title}" successfully.`);
      setSelectedTheme(null);
      setErrorMsg('');
    },
    onError: (err) => {
      setErrorMsg(err.message ?? 'Failed to link feedback. Please try again.');
    },
  });

  const handleLink = () => {
    if (!selectedTheme) return;
    setSuccessMsg('');
    setErrorMsg('');
    linkToTheme({ themeId: selectedTheme.id });
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(10,37,64,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          ...CARD,
          width: '100%', maxWidth: '36rem',
          padding: '2rem', maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0a2540', margin: '0 0 0.25rem' }}>
              Link Feedback to a Theme
            </h2>
            <p style={{ fontSize: '0.8125rem', color: '#6C757D', margin: 0 }}>
              Feedback: <strong style={{ color: '#0a2540' }}>{feedbackTitle}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.375rem', cursor: 'pointer', color: '#6C757D', lineHeight: 1, padding: '0.25rem', marginLeft: '1rem', flexShrink: 0 }}
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: '0.8125rem', color: '#6C757D', marginBottom: '1.5rem', lineHeight: 1.6, background: '#f8f9fa', padding: '0.75rem 1rem', borderRadius: '0.5rem', borderLeft: '3px solid #20A4A4' }}>
          Linking this feedback to a theme tells TriageInsight that this signal belongs to that theme. It will be included in the theme&apos;s CIQ score, revenue impact, and Intelligence Hub views.
        </p>

        {/* Theme search */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, color: '#0a2540', marginBottom: '0.5rem' }}>
            Select a Theme
          </label>
          <input
            value={themeSearch}
            onChange={(e) => { setThemeSearch(e.target.value); setSelectedTheme(null); }}
            placeholder="Search themes by name…"
            style={{
              width: '100%', padding: '0.625rem 0.875rem',
              border: '1px solid #dee2e6', borderRadius: '0.5rem',
              fontSize: '0.875rem', color: '#0a2540',
              boxSizing: 'border-box', marginBottom: '0.5rem',
            }}
          />
          {loadingThemes ? (
            <p style={{ fontSize: '0.8rem', color: '#6C757D' }}>Loading themes…</p>
          ) : themes.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: '#6C757D' }}>
              {themeSearch ? `No themes found for "${themeSearch}".` : 'No themes yet. Create a theme first in the Themes section.'}
            </p>
          ) : (
            <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid #dee2e6', borderRadius: '0.5rem' }}>
              {themes.map((th) => (
                <div
                  key={th.id}
                  onClick={() => setSelectedTheme(th)}
                  style={{
                    padding: '0.75rem 1rem',
                    cursor: 'pointer',
                    borderBottom: '1px solid #f0f4f8',
                    background: selectedTheme?.id === th.id ? '#e8f7f7' : '#fff',
                    borderLeft: selectedTheme?.id === th.id ? '3px solid #20A4A4' : '3px solid transparent',
                    transition: 'background 0.1s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0a2540', margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {th.title}
                    </p>
                    {th._count?.feedbacks != null && (
                      <span style={{ fontSize: '0.7rem', color: '#6C757D', flexShrink: 0 }}>
                        {th._count.feedbacks} linked
                      </span>
                    )}
                    {th.priorityScore != null && (
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#20A4A4', flexShrink: 0 }}>
                        CIQ {Math.round(th.priorityScore)}
                      </span>
                    )}
                    {th.revenueInfluence != null && th.revenueInfluence > 0 && (
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#2e7d32', flexShrink: 0 }}>
                        ${(th.revenueInfluence / 1000).toFixed(0)}k ARR
                      </span>
                    )}
                  </div>
                  {th.description && (
                    <p style={{ fontSize: '0.72rem', color: '#6C757D', margin: '0.15rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {th.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {selectedTheme && (
            <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.875rem', background: '#e8f7f7', borderRadius: '0.5rem', fontSize: '0.8125rem', color: '#0a2540', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: '#20A4A4' }}>✓</span>
              Selected: <strong>{selectedTheme.title}</strong>
            </div>
          )}
        </div>

        {/* Success / error */}
        {successMsg && (
          <div style={{ padding: '0.625rem 0.875rem', background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#2e7d32', marginBottom: '1rem' }}>
            ✓ {successMsg}
          </div>
        )}
        {errorMsg && (
          <div style={{ padding: '0.625rem 0.875rem', background: '#fdecea', border: '1px solid #ef9a9a', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#c62828', marginBottom: '1rem' }}>
            ✗ {errorMsg}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #dee2e6', background: '#fff', color: '#495057', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 500 }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleLink}
            disabled={!selectedTheme || linking}
            style={{
              padding: '0.5rem 1.5rem', borderRadius: '0.5rem', border: 'none',
              background: '#0a2540', color: '#fff', fontSize: '0.875rem',
              cursor: (!selectedTheme || linking) ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              opacity: (!selectedTheme || linking) ? 0.55 : 1,
            }}
          >
            {linking ? 'Linking…' : 'Link to Theme'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function InboxItemPage({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
}) {
  // Next.js 15 async params — unwrap with `use()`
  const { id } = use(params);
  const routeParams = useParams();
  const slug =
    (Array.isArray(routeParams.orgSlug)
      ? routeParams.orgSlug[0]
      : routeParams.orgSlug) ?? '';
  const r = appRoutes(slug);

  const { feedback, isLoading, isError, error, updateFeedback, isUpdating } =
    useFeedback(id);
  const { role } = useCurrentMemberRole();

  const canEdit =
    role === WorkspaceRole.ADMIN || role === WorkspaceRole.EDITOR;

  const [showLinkModal, setShowLinkModal] = useState(false);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div
          style={{
            height: '1.75rem',
            width: '16rem',
            borderRadius: '0.5rem',
            background: '#f0f4f8',
          }}
        />
        <div style={CARD}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                style={{ height: '1.25rem', borderRadius: '0.4rem', background: '#f0f4f8' }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (isError || !feedback) {
    return (
      <div style={CARD}>
        <p style={{ color: '#c0392b', fontWeight: 600, marginBottom: '0.25rem' }}>
          Failed to load feedback
        </p>
        <p style={{ color: '#6C757D', fontSize: '0.875rem' }}>
          {(error as Error)?.message ?? 'Feedback not found or you do not have access.'}
        </p>
        <Link
          href={r.inbox}
          style={{
            display: 'inline-block',
            marginTop: '1rem',
            color: '#20A4A4',
            fontWeight: 600,
            fontSize: '0.875rem',
            textDecoration: 'none',
          }}
        >
          ← Back to Inbox
        </Link>
      </div>
    );
  }

  // ── Derived values ──────────────────────────────────────────────────────────
  const sc = STATUS_COLORS[feedback.status] ?? { bg: '#f0f4f8', color: '#6C757D' };
  const sourceLabel = SOURCE_LABELS[feedback.sourceType] ?? feedback.sourceType;

  const handleStatusChange = (newStatus: FeedbackStatus) => {
    if (!canEdit || newStatus === feedback.status) return;
    updateFeedback({ feedbackId: feedback.id, data: { status: newStatus } });
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Back navigation */}
      <Link
        href={r.inbox}
        style={{
          color: '#6C757D',
          fontSize: '0.85rem',
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.3rem',
        }}
      >
        ← Feedback Inbox
      </Link>

      {/* Main card */}
      <div style={CARD}>
        {/* Title row */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '0.75rem',
            marginBottom: '1.25rem',
          }}
        >
          <h1
            style={{
              fontSize: '1.25rem',
              fontWeight: 800,
              color: '#0A2540',
              flex: 1,
              minWidth: 0,
            }}
          >
            {feedback.title}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexShrink: 0 }}>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.25rem 0.75rem',
                borderRadius: '999px',
                background: sc.bg,
                color: sc.color,
              }}
            >
              {feedback.status.replace('_', '\u00a0')}
            </span>
            {/* Link to Theme — only for ADMIN / EDITOR */}
            {canEdit && (
              <button
                onClick={() => setShowLinkModal(true)}
                style={{
                  padding: '0.3rem 0.875rem',
                  borderRadius: '999px',
                  border: '1px solid #7c3aed',
                  background: '#fff',
                  color: '#7c3aed',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
              >
                <span>⬡</span> Link to Theme
              </button>
            )}
          </div>
        </div>

        {/* Voice Feedback Panel — shown when source is VOICE or PUBLIC_PORTAL with uploadAssetId */}
        {(feedback.sourceType === FeedbackSourceType.VOICE ||
          (feedback.sourceType === FeedbackSourceType.PUBLIC_PORTAL &&
            (feedback as any).metadata?.uploadAssetId)) && (
          <VoiceFeedbackPanel
            uploadAssetId={(feedback as any).sourceRef ?? (feedback as any).metadata?.uploadAssetId}
            transcript={(feedback as any).metadata?.transcript ?? null}
            workspaceId={feedback.workspaceId}
          />
        )}

        {/* Description */}
        {feedback.description ? (
          <p
            style={{
              fontSize: '0.9rem',
              color: '#495057',
              lineHeight: 1.65,
              marginBottom: '1.5rem',
              whiteSpace: 'pre-wrap',
            }}
          >
            {feedback.description}
          </p>
        ) : (
          <p
            style={{
              fontSize: '0.875rem',
              color: '#adb5bd',
              fontStyle: 'italic',
              marginBottom: '1.5rem',
            }}
          >
            No description provided.
          </p>
        )}

        {/* Metadata grid */}
        <div
          style={{
            borderTop: '1px solid #f0f4f8',
            paddingTop: '1.25rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '1rem',
          }}
        >
          <MetaField label="Source" value={sourceLabel} />
          <MetaField
            label="Received"
            value={new Date(feedback.createdAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          />
          {feedback.customerId && (
            <MetaField label="Customer ID" value={feedback.customerId} />
          )}
          {feedback.customer && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', padding: '0.625rem 0.75rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid #e9ecef' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>Customer Intelligence</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, color: '#0a2540', fontSize: '0.85rem' }}>{feedback.customer.name}</span>
                {feedback.customer.companyName && (
                  <span style={{ fontSize: '0.75rem', color: '#6C757D' }}>{feedback.customer.companyName}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {feedback.customer.arrValue != null && feedback.customer.arrValue > 0 && (
                  <span style={{ background: '#d1fae5', color: '#065f46', borderRadius: '1rem', padding: '0.15rem 0.55rem', fontSize: '0.72rem', fontWeight: 600 }}>
                    ${feedback.customer.arrValue >= 1000000 ? `${(feedback.customer.arrValue / 1000000).toFixed(1)}M` : `${(feedback.customer.arrValue / 1000).toFixed(0)}K`} ARR
                  </span>
                )}
                {feedback.customer.lifecycleStage && (
                  <span style={{ background: '#e3f2fd', color: '#1565c0', borderRadius: '1rem', padding: '0.15rem 0.55rem', fontSize: '0.72rem', fontWeight: 600 }}>
                    {feedback.customer.lifecycleStage.replace('_', ' ')}
                  </span>
                )}
                {feedback.customer.churnRisk != null && feedback.customer.churnRisk > 0.6 && (
                  <span style={{ background: '#fee2e2', color: '#dc2626', borderRadius: '1rem', padding: '0.15rem 0.55rem', fontSize: '0.72rem', fontWeight: 700 }}>
                    AT RISK {Math.round(feedback.customer.churnRisk * 100)}%
                  </span>
                )}
                {feedback.customer.accountPriority && (
                  <span style={{
                    background: feedback.customer.accountPriority === 'CRITICAL' ? '#fce4ec' : feedback.customer.accountPriority === 'HIGH' ? '#fff8e1' : '#f0f4f8',
                    color: feedback.customer.accountPriority === 'CRITICAL' ? '#c62828' : feedback.customer.accountPriority === 'HIGH' ? '#b8860b' : '#6C757D',
                    borderRadius: '1rem', padding: '0.15rem 0.55rem', fontSize: '0.72rem', fontWeight: 600,
                  }}>
                    {feedback.customer.accountPriority}
                  </span>
                )}
              </div>
            </div>
          )}
          {feedback.portalUserId && (
            <MetaField label="Portal User" value={feedback.portalUserId} />
          )}
          {feedback.sentiment != null && (
            <MetaField
              label="Sentiment"
              value={`${(feedback.sentiment * 100).toFixed(0)}%`}
            />
          )}
          {feedback.mergedIntoId && (
            <MetaField label="Merged Into" value={feedback.mergedIntoId} />
          )}
        </div>

        {/* Linked Themes — display existing theme links */}
        {(feedback as any).themes && (feedback as any).themes.length > 0 && (
          <div style={{ borderTop: '1px solid #f0f4f8', paddingTop: '1.25rem', marginTop: '1.25rem' }}>
            <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
              Linked Themes
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {/* feedback.themes is an array of ThemeFeedback join records;
                  each record has a nested .theme object with { id, title, status } */}
              {(feedback as any).themes.map((link: { theme: Theme }) => (
                link.theme && (
                  <Link
                    key={link.theme.id}
                    href={`/${slug}/app/themes/${link.theme.id}`}
                    style={{
                      background: '#ede9fe', color: '#7c3aed',
                      padding: '0.25rem 0.75rem', borderRadius: '999px',
                      fontSize: '0.8125rem', fontWeight: 500, textDecoration: 'none',
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                    }}
                  >
                    ⬡ {(link.theme as any).shortLabel || link.theme.title}
                  </Link>
                )
              ))}
            </div>
          </div>
        )}

        {/* Status actions — only for ADMIN / EDITOR */}
        {canEdit && (
          <div
            style={{
              borderTop: '1px solid #f0f4f8',
              paddingTop: '1.25rem',
              marginTop: '1.25rem',
            }}
          >
            <p
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#6C757D',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.6rem',
              }}
            >
              Update Status
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {STATUS_TRANSITIONS.map((s) => {
                const active = s === feedback.status;
                const c = STATUS_COLORS[s] ?? { bg: '#f0f4f8', color: '#6C757D' };
                return (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    disabled={active || isUpdating}
                    style={{
                      padding: '0.35rem 0.875rem',
                      borderRadius: '999px',
                      border: `1px solid ${active ? c.color : '#dee2e6'}`,
                      background: active ? c.bg : '#fff',
                      color: active ? c.color : '#6C757D',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: active ? 'default' : 'pointer',
                      opacity: isUpdating ? 0.6 : 1,
                      transition: 'all 0.15s',
                    }}
                  >
                    {s.replace('_', '\u00a0')}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Attachments */}
        {feedback.attachments && feedback.attachments.length > 0 && (
          <div
            style={{
              borderTop: '1px solid #f0f4f8',
              paddingTop: '1.25rem',
              marginTop: '1.25rem',
            }}
          >
            <p
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#6C757D',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.6rem',
              }}
            >
              Attachments ({feedback.attachments.length})
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {feedback.attachments.map((att) => (
                <div
                  key={att.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.5rem',
                    background: '#f8f9fa',
                    border: '1px solid #e9ecef',
                  }}
                >
                  <span style={{ fontSize: '0.85rem', color: '#0A2540', fontWeight: 500 }}>
                    {att.fileName}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#adb5bd', marginLeft: 'auto' }}>
                    {att.mimeType}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#adb5bd' }}>
                    {(att.sizeBytes / 1024).toFixed(1)} KB
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Duplicate suggestions panel — only shown for non-merged feedback */}
      {feedback.status !== FeedbackStatus.MERGED && (
        <DuplicateSuggestionsPanel feedbackId={feedback.id} />
      )}

      {/* Comments section */}
      <div style={CARD}>
        <CommentSection
          feedbackId={feedback.id}
          comments={feedback.comments ?? []}
        />
      </div>

      {/* Link to Theme modal */}
      {showLinkModal && (
        <LinkToThemeModal
          feedbackId={feedback.id}
          feedbackTitle={feedback.title}
          onClose={() => setShowLinkModal(false)}
        />
      )}
    </div>
  );
}

// ─── Helper ────────────────────────────────────────────────────────────────────

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        style={{
          fontSize: '0.72rem',
          fontWeight: 700,
          color: '#adb5bd',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '0.2rem',
        }}
      >
        {label}
      </p>
      <p style={{ fontSize: '0.875rem', color: '#0A2540', fontWeight: 500 }}>{value}</p>
    </div>
  );
}

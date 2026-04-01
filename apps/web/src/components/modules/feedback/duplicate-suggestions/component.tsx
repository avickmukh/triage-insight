'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useDuplicateSuggestions } from '@/hooks/use-duplicate-suggestions';
import { DuplicateSuggestion, FeedbackStatus, WorkspaceRole } from '@/lib/api-types';
import { useCurrentMemberRole } from '@/hooks/use-workspace';
import { appRoutes } from '@/lib/routes';
import { useParams } from 'next/navigation';

// ─── Design tokens (matching TriageInsight shell) ─────────────────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 700,
  color: '#0A2540',
  marginBottom: '1rem',
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  [FeedbackStatus.NEW]: { bg: '#e8f7f7', color: '#20A4A4' },
  [FeedbackStatus.IN_REVIEW]: { bg: '#fff8e1', color: '#b8860b' },
  [FeedbackStatus.PROCESSED]: { bg: '#e8f5e9', color: '#2e7d32' },
  [FeedbackStatus.ARCHIVED]: { bg: '#f0f4f8', color: '#6C757D' },
  [FeedbackStatus.MERGED]: { bg: '#fce8ff', color: '#7c3aed' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map matchType to a human-readable label and color.
 * Falls back to the legacy similarity-based label for old rows without matchType.
 */
function matchTypeDisplay(
  matchType: string | null | undefined,
  hybridScore: number | null | undefined,
  similarity: number,
): { label: string; color: string; bg: string } {
  // New rows: use matchType for accurate classification
  if (matchType === 'EXACT_DUPLICATE') {
    return { label: 'Exact duplicate', color: '#2e7d32', bg: '#e8f5e9' };
  }
  if (matchType === 'NEAR_DUPLICATE') {
    return { label: 'Near duplicate', color: '#20A4A4', bg: '#e8f7f7' };
  }
  // Legacy rows (no matchType): fall back to similarity thresholds
  const score = hybridScore ?? similarity;
  if (score >= 0.92) return { label: 'Exact duplicate', color: '#2e7d32', bg: '#e8f5e9' };
  if (score >= 0.82) return { label: 'Near duplicate', color: '#20A4A4', bg: '#e8f7f7' };
  if (score >= 0.70) return { label: 'Possible duplicate', color: '#b8860b', bg: '#fff8e1' };
  return { label: 'Low confidence', color: '#6C757D', bg: '#f0f4f8' };
}

// ─── Single suggestion row ────────────────────────────────────────────────────

function SuggestionRow({
  suggestion,
  currentFeedbackId,
  orgSlug,
  canEdit,
  onAccept,
  onReject,
  isActing,
  actionId,
}: {
  suggestion: DuplicateSuggestion;
  currentFeedbackId: string;
  orgSlug: string;
  canEdit: boolean;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  isActing: boolean;
  actionId: string | null;
}) {
  const r = appRoutes(orgSlug);
  // Show the "other" feedback — the one that is not the current page
  // Use sourceId alias if present, fall back to sourceFeedbackId
  const sourceId = suggestion.sourceId ?? suggestion.sourceFeedbackId;
  const other =
    sourceId === currentFeedbackId
      ? suggestion.targetFeedback
      : suggestion.sourceFeedback;

  // Guard: if the related feedback wasn't expanded, skip rendering
  if (!other) return null;

  // Use similarity alias if present, fall back to similarityScore
  const similarityScore = suggestion.similarity ?? suggestion.similarityScore ?? 0;
  // Use hybridScore when available (new rows); fall back to raw similarity for legacy rows
  const displayScore = suggestion.hybridScore ?? similarityScore;

  const sc = STATUS_COLORS[other.status] ?? { bg: '#f0f4f8', color: '#6C757D' };
  const matchDisplay = matchTypeDisplay(suggestion.matchType, suggestion.hybridScore, similarityScore);
  const isBusy = isActing && actionId === suggestion.id;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '1rem',
        padding: '0.875rem 0',
        borderBottom: '1px solid #f0f4f8',
      }}
    >
      {/* Left: title + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link
          href={r.inboxItem(other.id)}
          style={{
            fontSize: '0.875rem',
            fontWeight: 600,
            color: '#0A2540',
            textDecoration: 'none',
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {other.title}
        </Link>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginTop: '0.3rem',
            flexWrap: 'wrap',
          }}
        >
          {/* Status badge */}
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              padding: '0.15rem 0.45rem',
              borderRadius: '999px',
              background: sc.bg,
              color: sc.color,
            }}
          >
            {other.status.replace('_', '\u00a0')}
          </span>
          {/* Match type label — uses strict classification from backend */}
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              padding: '0.15rem 0.45rem',
              borderRadius: '999px',
              background: matchDisplay.bg,
              color: matchDisplay.color,
            }}
          >
            {matchDisplay.label}
          </span>
          {/* Match reason — short explanation from backend */}
          {suggestion.matchReason && (
            <span style={{ fontSize: '0.70rem', color: '#6C757D', fontStyle: 'italic' }}>
              {suggestion.matchReason}
            </span>
          )}
          {/* Visual hybrid score bar */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ display: 'inline-block', width: '48px', height: '5px', borderRadius: '999px', background: '#e9ecef', overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${Math.round(displayScore * 100)}%`, background: matchDisplay.color, borderRadius: '999px', transition: 'width 0.3s' }} />
            </span>
            <span style={{ fontSize: '0.68rem', color: '#adb5bd', fontWeight: 600 }}>{Math.round(displayScore * 100)}%</span>
          </span>
          {/* Date */}
          <span style={{ fontSize: '0.72rem', color: '#adb5bd' }}>
            {new Date(suggestion.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Right: actions (ADMIN / EDITOR only) */}
      {canEdit && (
        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
          <button
            onClick={() => onAccept(suggestion.id)}
            disabled={isBusy}
            title="Accept — merge this item into the current feedback"
            style={{
              padding: '0.35rem 0.8rem',
              borderRadius: '0.4rem',
              border: '1px solid #20A4A4',
              background: isBusy ? '#f0f4f8' : '#e8f7f7',
              color: '#20A4A4',
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: isBusy ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
              opacity: isBusy ? 0.6 : 1,
            }}
          >
            {isBusy ? '…' : 'Accept'}
          </button>
          <button
            onClick={() => onReject(suggestion.id)}
            disabled={isBusy}
            title="Reject — dismiss this suggestion"
            style={{
              padding: '0.35rem 0.8rem',
              borderRadius: '0.4rem',
              border: '1px solid #dee2e6',
              background: isBusy ? '#f0f4f8' : '#fff',
              color: '#6C757D',
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: isBusy ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
              opacity: isBusy ? 0.6 : 1,
            }}
          >
            {isBusy ? '…' : 'Dismiss'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

interface DuplicateSuggestionsPanelProps {
  feedbackId: string;
}

export function DuplicateSuggestionsPanel({
  feedbackId,
}: DuplicateSuggestionsPanelProps) {
  const routeParams = useParams();
  const orgSlug =
    (Array.isArray(routeParams.orgSlug)
      ? routeParams.orgSlug[0]
      : routeParams.orgSlug) ?? '';

  const { role } = useCurrentMemberRole();
  const canEdit =
    role === WorkspaceRole.ADMIN || role === WorkspaceRole.EDITOR;

  const {
    suggestions,
    isLoading,
    isError,
    error,
    acceptSuggestion,
    isAccepting,
    isAcceptError,
    acceptError,
    resetAccept,
    rejectSuggestion,
    isRejecting,
    isRejectError,
    rejectError,
    resetReject,
  } = useDuplicateSuggestions(feedbackId);

  // Track which suggestion is being acted on
  const [actionId, setActionId] = useState<string | null>(null);
  const isActing = isAccepting || isRejecting;

  const handleAccept = (id: string) => {
    setActionId(id);
    resetAccept();
    resetReject();
    acceptSuggestion(id, { onSettled: () => setActionId(null) });
  };

  const handleReject = (id: string) => {
    setActionId(id);
    resetAccept();
    resetReject();
    rejectSuggestion(id, { onSettled: () => setActionId(null) });
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={CARD}>
        <p style={SECTION_TITLE}>Possible Duplicates</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {[1, 2].map((n) => (
            <div
              key={n}
              style={{
                height: '3rem',
                borderRadius: '0.5rem',
                background:
                  'linear-gradient(90deg, #f0f4f8 25%, #e9ecef 50%, #f0f4f8 75%)',
                backgroundSize: '200% 100%',
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div style={CARD}>
        <p style={SECTION_TITLE}>Possible Duplicates</p>
        <p style={{ fontSize: '0.85rem', color: '#c0392b' }}>
          {(error as Error)?.message ?? 'Failed to load duplicate suggestions.'}
        </p>
      </div>
    );
  }

  // ── Empty ────────────────────────────────────────────────────────────────────
  if (suggestions.length === 0) {
    return (
      <div style={CARD}>
        <p style={SECTION_TITLE}>Possible Duplicates</p>
        <p
          style={{
            fontSize: '0.85rem',
            color: '#6C757D',
            padding: '0.75rem 0',
          }}
        >
          No pending duplicate suggestions for this feedback item.
        </p>
      </div>
    );
  }

  // ── Suggestions list ─────────────────────────────────────────────────────────
  return (
    <div style={CARD}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.25rem',
        }}
      >
        <p style={{ ...SECTION_TITLE, marginBottom: 0 }}>
          Possible Duplicates
          <span
            style={{
              marginLeft: '0.5rem',
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '0.1rem 0.45rem',
              borderRadius: '999px',
              background: '#fce8ff',
              color: '#7c3aed',
            }}
          >
            {suggestions.length}
          </span>
        </p>
        {!canEdit && (
          <span style={{ fontSize: '0.75rem', color: '#adb5bd' }}>
            Read-only
          </span>
        )}
      </div>

      {/* AI trust explanation */}
      <div style={{ background: '#f8fafc', border: '1px solid #e9ecef', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', marginBottom: '0.875rem', display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
        <span style={{ fontSize: '0.8rem', flexShrink: 0 }}>🤖</span>
        <p style={{ fontSize: '0.75rem', color: '#6C757D', margin: 0, lineHeight: 1.5 }}>
          These items were flagged by the AI using a <strong>hybrid score</strong> combining semantic meaning,
          title similarity, and keyword overlap. Only <strong>Exact duplicate</strong> and <strong>Near duplicate</strong> matches
          are shown. Review and accept to merge, or dismiss if they are unrelated.
        </p>
      </div>

      {/* Action-level error banners */}
      {isAcceptError && (
        <div
          style={{
            marginBottom: '0.75rem',
            padding: '0.5rem 0.875rem',
            borderRadius: '0.5rem',
            background: '#fff5f5',
            border: '1px solid #fca5a5',
            fontSize: '0.82rem',
            color: '#c0392b',
          }}
        >
          Accept failed:{' '}
          {(acceptError as Error)?.message ?? 'An error occurred.'}
        </div>
      )}
      {isRejectError && (
        <div
          style={{
            marginBottom: '0.75rem',
            padding: '0.5rem 0.875rem',
            borderRadius: '0.5rem',
            background: '#fff5f5',
            border: '1px solid #fca5a5',
            fontSize: '0.82rem',
            color: '#c0392b',
          }}
        >
          Dismiss failed:{' '}
          {(rejectError as Error)?.message ?? 'An error occurred.'}
        </div>
      )}

      <div>
        {suggestions.map((s) => (
          <SuggestionRow
            key={s.id}
            suggestion={s}
            currentFeedbackId={feedbackId}
            orgSlug={orgSlug}
            canEdit={canEdit}
            onAccept={handleAccept}
            onReject={handleReject}
            isActing={isActing}
            actionId={actionId}
          />
        ))}
      </div>

      {!canEdit && (
        <p
          style={{
            marginTop: '0.75rem',
            fontSize: '0.78rem',
            color: '#adb5bd',
          }}
        >
          Contact an Admin or Editor to accept or dismiss suggestions.
        </p>
      )}
    </div>
  );
}

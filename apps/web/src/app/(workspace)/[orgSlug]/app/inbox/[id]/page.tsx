'use client';

import { use } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useFeedback } from '@/hooks/use-feedback';
import { useCurrentMemberRole } from '@/hooks/use-workspace';
import { FeedbackStatus, FeedbackSourceType, WorkspaceRole } from '@/lib/api-types';
import { appRoutes } from '@/lib/routes';
import { CommentSection } from '@/components/modules/feedback/comment-section/component';
import { DuplicateSuggestionsPanel } from '@/components/modules/feedback/duplicate-suggestions/component';

// ─── Design tokens (matching TriageInsight shell) ────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  [FeedbackStatus.NEW]: { bg: '#e8f7f7', color: '#20A4A4' },
  [FeedbackStatus.IN_REVIEW]: { bg: '#fff8e1', color: '#b8860b' },
  [FeedbackStatus.PROCESSED]: { bg: '#e8f5e9', color: '#2e7d32' },
  [FeedbackStatus.ARCHIVED]: { bg: '#f0f4f8', color: '#6C757D' },
  [FeedbackStatus.MERGED]: { bg: '#fce8ff', color: '#7c3aed' },
};

const SOURCE_LABELS: Record<string, string> = {
  [FeedbackSourceType.MANUAL]: 'Manual',
  [FeedbackSourceType.PUBLIC_PORTAL]: 'Portal',
  [FeedbackSourceType.EMAIL]: 'Email',
  [FeedbackSourceType.SLACK]: 'Slack',
  [FeedbackSourceType.CSV_IMPORT]: 'CSV Import',
  [FeedbackSourceType.VOICE]: 'Voice',
  [FeedbackSourceType.API]: 'API',
};

const STATUS_TRANSITIONS: FeedbackStatus[] = [
  FeedbackStatus.NEW,
  FeedbackStatus.IN_REVIEW,
  FeedbackStatus.PROCESSED,
  FeedbackStatus.ARCHIVED,
];

// ─── Page ────────────────────────────────────────────────────────────────────────────

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

  // ── Loading ──────────────────────────────────────────────────────────────────────
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

  // ── Error ───────────────────────────────────────────────────────────────────────
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

  // ── Derived values ─────────────────────────────────────────────────────────────────────
  const sc = STATUS_COLORS[feedback.status] ?? { bg: '#f0f4f8', color: '#6C757D' };
  const sourceLabel = SOURCE_LABELS[feedback.sourceType] ?? feedback.sourceType;

  const handleStatusChange = (newStatus: FeedbackStatus) => {
    if (!canEdit || newStatus === feedback.status) return;
    updateFeedback({ feedbackId: feedback.id, data: { status: newStatus } });
  };

  // ── Render ────────────────────────────────────────────────────────────────────────
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
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '0.25rem 0.75rem',
              borderRadius: '999px',
              background: sc.bg,
              color: sc.color,
              flexShrink: 0,
            }}
          >
            {feedback.status.replace('_', '\u00a0')}
          </span>
        </div>

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
                  <span style={{ background: feedback.customer.accountPriority === 'CRITICAL' ? '#fce4ec' : feedback.customer.accountPriority === 'HIGH' ? '#fff8e1' : '#f0f4f8', color: feedback.customer.accountPriority === 'CRITICAL' ? '#c62828' : feedback.customer.accountPriority === 'HIGH' ? '#b8860b' : '#6C757D', borderRadius: '1rem', padding: '0.15rem 0.55rem', fontSize: '0.72rem', fontWeight: 600 }}>
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

      {/* Comments section — wired but will 404 until backend adds route */}
      <div style={CARD}>
        <CommentSection
          feedbackId={feedback.id}
          comments={feedback.comments ?? []}
        />
      </div>
    </div>
  );
}

// ─── Helper ────────────────────────────────────────────────────────────────────────────

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

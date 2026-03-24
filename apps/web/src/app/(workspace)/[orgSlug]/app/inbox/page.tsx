'use client';

import { useState } from 'react';
import { useFeedback } from '@/hooks/use-feedback';
import { Feedback, FeedbackSourceType, FeedbackStatus, ThemeFeedback } from '@/lib/api-types';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { appRoutes } from '@/lib/routes';

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
  [FeedbackSourceType.CSV_IMPORT]: 'CSV',
  [FeedbackSourceType.VOICE]: 'Voice',
  [FeedbackSourceType.API]: 'API',
};

const TABS: { label: string; value: FeedbackStatus | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'New', value: FeedbackStatus.NEW },
  { label: 'In Review', value: FeedbackStatus.IN_REVIEW },
  { label: 'Processed', value: FeedbackStatus.PROCESSED },
  { label: 'Archived', value: FeedbackStatus.ARCHIVED },
];

export default function InboxPage() {
  const params = useParams();
  const slug = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';
  const r = appRoutes(slug);
  const [activeStatus, setActiveStatus] = useState<FeedbackStatus | undefined>(undefined);
  const [search, setSearch] = useState('');
  const { useFeedbackList } = useFeedback();
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useFeedbackList({
      status: activeStatus,
      search: search.trim() || undefined,
    });

  const allItems: Feedback[] = data?.pages?.flatMap((p) => p.data) ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 800,
              color: '#0A2540',
              marginBottom: '0.25rem',
            }}
          >
            Feedback Inbox
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#6C757D' }}>
            Triage and manage all incoming feedback.
          </p>
        </div>
        <Link
          href={r.inboxNew}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 1.1rem',
            borderRadius: '0.5rem',
            background: '#20A4A4',
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.85rem',
            textDecoration: 'none',
            boxShadow: '0 1px 4px rgba(10,37,64,0.10)',
          }}
        >
          + New Feedback
        </Link>
      </div>

      {/* Search + status filter */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <input
          type="text"
          placeholder="Search feedback…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '0.5rem 0.875rem',
            borderRadius: '0.5rem',
            border: '1px solid #dee2e6',
            fontSize: '0.875rem',
            color: '#0A2540',
            outline: 'none',
            width: '100%',
            maxWidth: '28rem',
            background: '#fff',
          }}
        />
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button
              key={t.label}
              onClick={() => setActiveStatus(t.value)}
              style={{
                padding: '0.4rem 1rem',
                borderRadius: '999px',
                border: '1px solid',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                borderColor: activeStatus === t.value ? '#20A4A4' : '#dee2e6',
                background: activeStatus === t.value ? '#e8f7f7' : '#fff',
                color: activeStatus === t.value ? '#20A4A4' : '#6C757D',
                transition: 'all 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* List card */}
      <div style={CARD}>
        {isLoading ? (
          /* Skeleton shimmer */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <div
                key={n}
                style={{
                  height: '3.5rem',
                  borderRadius: '0.5rem',
                  background: 'linear-gradient(90deg, #f0f4f8 25%, #e9ecef 50%, #f0f4f8 75%)',
                  backgroundSize: '200% 100%',
                }}
              />
            ))}
          </div>
        ) : isError ? (
          /* Error state */
          <div style={{ padding: '1.5rem', textAlign: 'center' }}>
            <p
              style={{
                color: '#c0392b',
                fontWeight: 600,
                marginBottom: '0.25rem',
                fontSize: '0.95rem',
              }}
            >
              Failed to load feedback
            </p>
            <p style={{ color: '#6C757D', fontSize: '0.85rem' }}>
              {(error as Error)?.message ?? 'An unexpected error occurred. Please try again.'}
            </p>
          </div>
        ) : allItems.length === 0 ? (
          /* Empty state */
          <div style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
            <p
              style={{
                color: '#0A2540',
                fontWeight: 700,
                fontSize: '1rem',
                marginBottom: '0.35rem',
              }}
            >
              No feedback found
            </p>
            <p style={{ color: '#6C757D', fontSize: '0.875rem' }}>
              {search
                ? 'Try a different search term or clear the filter.'
                : 'Submit feedback via the portal or add it manually using the button above.'}
            </p>
          </div>
        ) : (
          /* Feedback rows */
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {allItems.map((fb, i) => {
              const sc = STATUS_COLORS[fb.status] ?? { bg: '#f0f4f8', color: '#6C757D' };
              const sourceLabel = SOURCE_LABELS[fb.sourceType] ?? fb.sourceType;
              return (
                <Link
                  key={fb.id}
                  href={r.inboxItem(fb.id)}
                  style={{
                    textDecoration: 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.875rem 0',
                    borderBottom:
                      i < allItems.length - 1 ? '1px solid #f0f4f8' : 'none',
                  }}
                >
                  {/* Title + description + theme pills */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        color: '#0A2540',
                        marginBottom: '0.15rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {fb.title}
                    </p>
                    {fb.description && (
                      <p
                        style={{
                          fontSize: '0.8rem',
                          color: '#6C757D',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          marginBottom: fb.themes && fb.themes.length > 0 ? '0.35rem' : 0,
                        }}
                      >
                        {fb.description}
                      </p>
                    )}
                    {/* Theme identifier pills */}
                    {fb.themes && fb.themes.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                        {(fb.themes as ThemeFeedback[]).slice(0, 3).map((tf) => (
                          <span
                            key={tf.themeId}
                            title={tf.theme?.title ?? tf.themeId}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.2rem',
                              background: '#ede9fe',
                              color: '#7c3aed',
                              padding: '0.1rem 0.5rem',
                              borderRadius: '999px',
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              maxWidth: '8rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span style={{ fontSize: '0.6rem' }}>⬡</span>
                            {tf.theme?.title ?? 'Theme'}
                          </span>
                        ))}
                        {fb.themes.length > 3 && (
                          <span style={{ background: '#f3f0ff', color: '#7c3aed', padding: '0.1rem 0.45rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 600 }}>
                            +{fb.themes.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Badges + date */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginLeft: '1rem',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '0.15rem 0.5rem',
                        borderRadius: '999px',
                        background: '#f0f4f8',
                        color: '#6C757D',
                        border: '1px solid #e9ecef',
                      }}
                    >
                      {sourceLabel}
                    </span>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.6rem',
                        borderRadius: '999px',
                        background: sc.bg,
                        color: sc.color,
                      }}
                    >
                      {fb.status.replace('_', '\u00a0')}
                    </span>
                    {/* Merged-away indicator: this item was merged into another */}
                    {fb.mergedIntoId && (
                      <span
                        title={`Merged into ${fb.mergedIntoId}`}
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.45rem',
                          borderRadius: '999px',
                          background: '#fce8ff',
                          color: '#7c3aed',
                          border: '1px solid #e9d5ff',
                        }}
                      >
                        Merged
                      </span>
                    )}
                    <span style={{ fontSize: '0.78rem', color: '#adb5bd' }}>
                      {new Date(fb.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Load more */}
        {hasNextPage && (
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            style={{
              marginTop: '1rem',
              width: '100%',
              padding: '0.6rem',
              borderRadius: '0.5rem',
              border: '1px solid #dee2e6',
              background: '#fff',
              color: '#20A4A4',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}

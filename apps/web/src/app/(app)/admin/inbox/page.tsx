'use client';

import { useState } from 'react';
import { useFeedback } from '@/hooks/use-feedback';
import { Feedback, FeedbackStatus } from '@/lib/api-types';
import Link from 'next/link';

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

const TABS: { label: string; value: FeedbackStatus | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'New', value: FeedbackStatus.NEW },
  { label: 'In Review', value: FeedbackStatus.IN_REVIEW },
  { label: 'Processed', value: FeedbackStatus.PROCESSED },
  { label: 'Archived', value: FeedbackStatus.ARCHIVED },
];

export default function InboxPage() {
  const [activeStatus, setActiveStatus] = useState<FeedbackStatus | undefined>(undefined);
  const { useFeedbackList } = useFeedback();
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useFeedbackList({
    status: activeStatus,
  });

  const allItems: Feedback[] = data?.pages?.flatMap((p: { data: Feedback[] }) => p.data) ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0A2540', marginBottom: '0.25rem' }}>
          Feedback Inbox
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#6C757D' }}>Triage and manage all incoming feedback.</p>
      </div>

      {/* Status filter tabs */}
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

      <div style={CARD}>
        {isLoading ? (
          <p style={{ color: '#6C757D' }}>Loading…</p>
        ) : allItems.length === 0 ? (
          <p style={{ color: '#6C757D' }}>No feedback found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {allItems.map((fb, i) => {
              const sc = STATUS_COLORS[fb.status] ?? { bg: '#f0f4f8', color: '#6C757D' };
              return (
                <Link
                  key={fb.id}
                  href={`/admin/inbox/${fb.id}`}
                  style={{
                    textDecoration: 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '1rem 0',
                    borderBottom: i < allItems.length - 1 ? '1px solid #f0f4f8' : 'none',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0A2540', marginBottom: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fb.title}
                    </p>
                    {fb.description && (
                      <p style={{ fontSize: '0.8rem', color: '#6C757D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {fb.description}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: '1rem', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '999px', background: sc.bg, color: sc.color }}>
                      {fb.status}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: '#adb5bd' }}>
                      {new Date(fb.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        {hasNextPage && (
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            style={{ marginTop: '1rem', width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #dee2e6', background: '#fff', color: '#20A4A4', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}

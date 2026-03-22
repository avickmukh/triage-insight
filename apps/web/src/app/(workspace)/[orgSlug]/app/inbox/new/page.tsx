'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { FeedbackForm } from '@/components/shared/forms/feedback-form';
import { appRoutes } from '@/lib/routes';

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
  maxWidth: '40rem',
};

export default function NewFeedbackPage() {
  const params = useParams();
  const router = useRouter();
  const slug =
    (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';
  const r = appRoutes(slug);

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

      {/* Header */}
      <div>
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 800,
            color: '#0A2540',
            marginBottom: '0.25rem',
          }}
        >
          New Feedback
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#6C757D' }}>
          Manually record feedback on behalf of a customer or from an internal source.
        </p>
      </div>

      {/* Form card */}
      <div style={CARD}>
        <FeedbackForm onSuccess={() => router.push(r.inbox)} />
      </div>
    </div>
  );
}

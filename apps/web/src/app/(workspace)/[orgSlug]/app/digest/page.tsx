'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PlanGate } from '@/components/shared/plan-gate';
import { useWorkspace } from '@/hooks/use-workspace';
import { useMutation } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { appRoutes } from '@/lib/routes';

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

function DigestContent() {
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;
  const r = appRoutes(orgSlug);
  const { workspace } = useWorkspace();
  const [generated, setGenerated] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const generateMutation = useMutation<void, Error, void>({
    mutationFn: () => {
      if (!workspace?.id) throw new Error('Workspace not loaded');
      return apiClient.digest.generate(workspace.id);
    },
    onSuccess: () => setGenerated(true),
    onError: (err) => setGenError(err.message || 'Failed to generate digest.'),
  });

  const handleGenerate = () => {
    setGenError(null);
    generateMutation.mutate();
  };

  const generating = generateMutation.isPending;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0A2540', marginBottom: '0.375rem' }}>
          Weekly AI Digest
        </h1>
        <p style={{ color: '#6C757D', fontSize: '0.9rem', margin: 0 }}>
          An AI-generated summary of your top feedback trends, emerging themes, and prioritization signals —
          delivered every Monday morning.
        </p>
      </div>

      {/* Success banner */}
      {generated && (
        <div style={{ padding: '0.875rem 1.25rem', background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontWeight: 600, color: '#2e7d32', margin: '0 0 0.2rem', fontSize: '0.9rem' }}>Digest generation queued</p>
            <p style={{ color: '#388e3c', fontSize: '0.8rem', margin: 0 }}>Your digest is being compiled. Check your email in a few minutes.</p>
          </div>
          <button
            onClick={() => setGenerated(false)}
            style={{ background: 'none', border: 'none', color: '#6C757D', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error banner */}
      {genError && (
        <div style={{ padding: '0.75rem 1rem', background: '#fff5f5', border: '1px solid #f5c6cb', borderRadius: '0.5rem', color: '#e63946', fontSize: '0.875rem' }}>
          {genError}
        </div>
      )}

      {/* How it works */}
      <div style={CARD}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0A2540', margin: '0 0 1rem' }}>What&apos;s in your digest</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
          {[
            { icon: '🏆', title: 'Top 5 themes', desc: 'The themes with the most new feedback signals this week' },
            { icon: '📈', title: 'Sentiment trend', desc: 'Average sentiment across all feedback in the past 7 days' },
            { icon: '⚡', title: 'Priority changes', desc: 'Themes that moved up or down in CIQ score this week' },
            { icon: '🔔', title: 'Emerging signals', desc: 'New feedback clusters that may need your attention' },
          ].map((item) => (
            <div key={item.title} style={{ padding: '0.875rem', background: '#f8fafc', borderRadius: '0.625rem', border: '1px solid #e9ecef' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{item.icon}</div>
              <div style={{ fontWeight: 600, color: '#0A2540', fontSize: '0.875rem', marginBottom: '0.25rem' }}>{item.title}</div>
              <div style={{ color: '#6C757D', fontSize: '0.78rem', lineHeight: 1.5 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Empty state / CTA */}
      <div style={{ ...CARD, textAlign: 'center', padding: '2.5rem 2rem' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📬</div>
        <p style={{ fontWeight: 700, color: '#0A2540', fontSize: '1.05rem', margin: '0 0 0.5rem' }}>
          No digest generated yet
        </p>
        <p style={{ color: '#6C757D', fontSize: '0.875rem', maxWidth: '420px', margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
          Your first scheduled digest will arrive next Monday. You can also generate one right now
          to see a summary of this week&apos;s feedback.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={handleGenerate}
            disabled={generating || generated}
            style={{
              padding: '0.6rem 1.5rem', borderRadius: '0.5rem',
              border: 'none', background: generating || generated ? '#adb5bd' : '#0A2540',
              color: '#fff', fontSize: '0.875rem', fontWeight: 600,
              cursor: generating || generated ? 'not-allowed' : 'pointer',
            }}
          >
            {generating ? 'Generating…' : generated ? 'Queued ✓' : 'Generate digest now'}
          </button>
          <Link
            href={r.themes}
            style={{ padding: '0.6rem 1.5rem', borderRadius: '0.5rem', border: '1px solid #ced4da', background: '#fff', color: '#495057', fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}
          >
            View themes first
          </Link>
        </div>
        <p style={{ color: '#adb5bd', fontSize: '0.75rem', marginTop: '1.25rem' }}>
          Digests are automatically sent every Monday at 8 AM in your workspace timezone.
        </p>
      </div>
    </div>
  );
}

/**
 * Weekly AI Digest page — BUSINESS plan only.
 * FREE and PRO plan users see an upgrade prompt.
 */
export default function DigestPage() {
  return (
    <PlanGate feature="weeklyDigest" requiredPlan="Business">
      <DigestContent />
    </PlanGate>
  );
}

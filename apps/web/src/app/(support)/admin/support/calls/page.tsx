'use client';

// NOTE: No GET /support/calls endpoint exists on the backend yet.
// This page renders a placeholder UI. When the backend exposes
// GET /workspaces/:id/support/calls, replace the placeholder with
// a real data-fetching component.

import { useState } from 'react';

const PLACEHOLDER_CALLS = [
  { id: '1', title: 'Onboarding call — Acme Corp', summary: 'Customer requested better CSV import and bulk tagging. Mentioned competitor Canny as alternative.', duration: 1847, date: '2026-03-08T10:30:00Z', sentiment: 'NEUTRAL', feedbackExtracted: 2 },
  { id: '2', title: 'Renewal call — TechFlow Inc', summary: 'Very positive call. Customer loves the weekly digest. Asked about Salesforce integration timeline.', duration: 2310, date: '2026-03-07T14:00:00Z', sentiment: 'POSITIVE', feedbackExtracted: 1 },
  { id: '3', title: 'Support escalation — Globex', summary: 'Customer frustrated with slow AI clustering. Reported 3 duplicate themes in the last sprint.', duration: 960, date: '2026-03-06T09:15:00Z', sentiment: 'NEGATIVE', feedbackExtracted: 3 },
];

const SENTIMENT_STYLE: Record<string, { bg: string; color: string }> = {
  POSITIVE: { bg: '#D4EDDA', color: '#155724' },
  NEUTRAL:  { bg: '#E2E3E5', color: '#383D41' },
  NEGATIVE: { bg: '#F8D7DA', color: '#721C24' },
};

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export default function SupportCallsPage() {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div style={{ padding: '2rem', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0A2540', letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>Support Calls</h1>
        <p style={{ color: '#6C757D', fontSize: '0.9rem' }}>AI-transcribed and summarised customer calls. Feedback items are automatically extracted.</p>
      </div>
      <div style={{ background: '#e8f7f7', border: '1px solid #20A4A4', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1.75rem', fontSize: '0.85rem', color: '#0A2540' }}>
        <strong>Note:</strong> Live call data will appear here once the voice feedback API endpoint is enabled. The calls below are illustrative placeholders.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {PLACEHOLDER_CALLS.map((call) => {
          const isOpen = expanded === call.id;
          const sentStyle = SENTIMENT_STYLE[call.sentiment] ?? { bg: '#e9ecef', color: '#495057' };
          return (
            <div key={call.id} style={{ background: '#ffffff', border: '1px solid #e9ecef', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(10,37,64,0.06)' }}>
              <button onClick={() => setExpanded(isOpen ? null : call.id)} style={{ width: '100%', background: 'none', border: 'none', padding: '1rem 1.25rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ color: '#20A4A4', fontSize: '1rem', minWidth: 16 }}>{isOpen ? '▾' : '▸'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0A2540', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{call.title}</div>
                  <div style={{ fontSize: '0.78rem', color: '#6C757D', marginTop: '0.15rem' }}>{new Date(call.date).toLocaleDateString()} · {formatDuration(call.duration)}</div>
                </div>
                <span style={{ background: sentStyle.bg, color: sentStyle.color, fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: 20, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>{call.sentiment}</span>
                <span style={{ background: '#e8f7f7', color: '#20A4A4', fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: 20, whiteSpace: 'nowrap' }}>{call.feedbackExtracted} feedback item{call.feedbackExtracted !== 1 ? 's' : ''}</span>
              </button>
              {isOpen && (
                <div style={{ borderTop: '1px solid #f1f3f5', padding: '1rem 1.25rem 1.25rem', background: '#FAFAFA' }}>
                  <p style={{ fontSize: '0.875rem', color: '#495057', lineHeight: 1.6, margin: 0 }}>{call.summary}</p>
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
                    <button style={{ background: '#0A2540', color: '#ffffff', fontWeight: 600, fontSize: '0.8rem', padding: '0.5rem 1rem', borderRadius: 7, border: 'none', cursor: 'pointer' }}>View Transcript</button>
                    <button style={{ background: 'none', border: '1.5px solid #20A4A4', color: '#20A4A4', fontWeight: 600, fontSize: '0.8rem', padding: '0.5rem 1rem', borderRadius: 7, cursor: 'pointer' }}>View Extracted Feedback</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

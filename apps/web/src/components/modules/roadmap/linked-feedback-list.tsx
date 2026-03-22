'use client';
import { RoadmapItemDetail } from '@/lib/api-types';

type LinkedFeedback = RoadmapItemDetail['linkedFeedback'][number];

// ─── Sentiment badge ──────────────────────────────────────────────────────────
function SentimentBadge({ value }: { value?: number | null }) {
  if (value == null) return null;
  const label = value >= 0.3 ? 'Positive' : value <= -0.3 ? 'Negative' : 'Neutral';
  const color = value >= 0.3 ? '#22c55e' : value <= -0.3 ? '#ef4444' : '#f59e0b';
  return (
    <span style={{
      fontSize: '0.65rem', fontWeight: 600, color,
      background: `${color}15`, padding: '0.1rem 0.45rem',
      borderRadius: '999px', border: `1px solid ${color}30`,
    }}>
      {label}
    </span>
  );
}

// ─── Impact badge ─────────────────────────────────────────────────────────────
function ImpactBadge({ value }: { value?: number | null }) {
  if (value == null) return null;
  return (
    <span style={{
      fontSize: '0.65rem', fontWeight: 600, color: '#1a56db',
      background: '#e8f0fe', padding: '0.1rem 0.45rem',
      borderRadius: '999px',
    }}>
      Impact {value.toFixed(1)}
    </span>
  );
}

// ─── Source badge ─────────────────────────────────────────────────────────────
function SourceBadge({ type }: { type?: string | null }) {
  if (!type) return null;
  const labels: Record<string, string> = {
    MANUAL: 'Manual', PUBLIC_PORTAL: 'Portal', EMAIL: 'Email',
    SLACK: 'Slack', CSV_IMPORT: 'CSV', VOICE: 'Voice', API: 'API',
  };
  return (
    <span style={{
      fontSize: '0.65rem', color: '#6C757D',
      background: '#f8f9fa', padding: '0.1rem 0.45rem',
      borderRadius: '999px', border: '1px solid #e9ecef',
    }}>
      {labels[type] ?? type}
    </span>
  );
}

// ─── LinkedFeedbackList ───────────────────────────────────────────────────────
interface LinkedFeedbackListProps {
  items: LinkedFeedback[];
}

export function LinkedFeedbackList({ items }: LinkedFeedbackListProps) {
  if (items.length === 0) {
    return (
      <div style={{ color: '#adb5bd', fontSize: '0.82rem', fontStyle: 'italic' }}>
        No feedback linked to this theme yet.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
      {items.map((fb) => (
        <div
          key={fb.id}
          style={{
            background: '#f8f9fa',
            border: '1px solid #e9ecef',
            borderRadius: '0.625rem',
            padding: '0.75rem 1rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0A2540', margin: 0, flex: 1 }}>
              {fb.title}
            </p>
            {fb.assignmentConfidence != null && (
              <span style={{ fontSize: '0.65rem', color: '#adb5bd', flexShrink: 0 }}>
                {(fb.assignmentConfidence * 100).toFixed(0)}% match
              </span>
            )}
          </div>
          {fb.description && (
            <p style={{
              fontSize: '0.78rem', color: '#6C757D', margin: '0.25rem 0 0.5rem',
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {fb.description}
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <SentimentBadge value={fb.sentiment} />
            <ImpactBadge value={fb.impactScore} />
            <SourceBadge type={fb.sourceType} />
            {fb.customer?.companyName && (
              <span style={{
                fontSize: '0.65rem', color: '#495057',
                background: '#fff', padding: '0.1rem 0.45rem',
                borderRadius: '999px', border: '1px solid #dee2e6',
              }}>
                {fb.customer.companyName}
                {fb.customer.arrValue ? ` · $${(fb.customer.arrValue / 1000).toFixed(0)}k ARR` : ''}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

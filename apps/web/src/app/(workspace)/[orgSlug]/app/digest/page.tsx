'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PlanGate } from '@/components/shared/plan-gate';
import { useWorkspace } from '@/hooks/use-workspace';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { appRoutes } from '@/lib/routes';
import type { DigestRun, DigestSummary, DigestNarration, DigestTopTheme } from '@/lib/api-types';

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SentimentBadge({ score, trend }: { score: number | null; trend: string }) {
  if (score == null) return null;
  const label = score >= 0.3 ? 'Positive' : score <= -0.3 ? 'Negative' : 'Neutral';
  const color = score >= 0.3 ? '#2e7d32' : score <= -0.3 ? '#c62828' : '#b8860b';
  const bg = score >= 0.3 ? '#f0fdf4' : score <= -0.3 ? '#fff5f5' : '#fffde7';
  const trendIcon = trend === 'improving' ? '↑' : trend === 'declining' ? '↓' : '→';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: bg, color, borderRadius: '0.375rem', padding: '0.2rem 0.6rem', fontSize: '0.78rem', fontWeight: 600 }}>
      {label} {trendIcon}
    </span>
  );
}

function VolumeBadge({ delta }: { delta: number }) {
  const isUp = delta >= 0;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: isUp ? '#f0fdf4' : '#fff5f5', color: isUp ? '#2e7d32' : '#c62828', borderRadius: '0.375rem', padding: '0.2rem 0.6rem', fontSize: '0.78rem', fontWeight: 600 }}>
      {isUp ? '↑' : '↓'} {Math.abs(delta)} vs prior period
    </span>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (!items || items.length === 0) return <p style={{ color: '#adb5bd', fontSize: '0.82rem', margin: 0 }}>No data available.</p>;
  return (
    <ul style={{ margin: 0, padding: '0 0 0 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontSize: '0.875rem', color: '#212529', lineHeight: 1.6 }}>{item}</li>
      ))}
    </ul>
  );
}

function ThemeRow({ theme }: { theme: DigestTopTheme }) {
  // Both ciqScore and priorityScore are stored as 0–100 by the CIQ engine. Do NOT multiply by 100.
  const ciq = theme.ciqScore != null ? Math.round(theme.ciqScore) : theme.priorityScore != null ? Math.round(theme.priorityScore) : null;
  const urgency = theme.urgencyScore != null ? Math.round(theme.urgencyScore) : null;
  const sources: string[] = [];
  if ((theme.feedbackCount ?? 0) > 0) sources.push(`${theme.feedbackCount} feedback`);
  if ((theme.supportCount ?? 0) > 0) sources.push(`${theme.supportCount} support`);
  if ((theme.voiceCount ?? 0) > 0) sources.push(`${theme.voiceCount} voice`);
  const sourceStr = sources.length > 0 ? sources.join(' + ') : `${theme.feedbackCount} signals`;
  return (
    <div style={{ padding: '0.875rem 1rem', background: '#f8fafc', borderRadius: '0.625rem', border: '1px solid #e9ecef' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 700, color: '#0A2540', fontSize: '0.875rem', margin: '0 0 0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{theme.title}</p>
          <p style={{ color: '#6C757D', fontSize: '0.78rem', margin: 0 }}>{sourceStr}</p>
          {theme.crossSourceInsight && <p style={{ color: '#495057', fontSize: '0.78rem', margin: '0.25rem 0 0', fontStyle: 'italic' }}>{theme.crossSourceInsight}</p>}
          {theme.aiSummary && <p style={{ color: '#6C757D', fontSize: '0.75rem', margin: '0.2rem 0 0' }}>{theme.aiSummary}</p>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem', flexShrink: 0 }}>
          {ciq != null && <span style={{ background: ciq >= 70 ? '#e8f5e9' : ciq >= 40 ? '#fff8e1' : '#f5f5f5', color: ciq >= 70 ? '#2e7d32' : ciq >= 40 ? '#b8860b' : '#6C757D', borderRadius: '0.375rem', padding: '0.15rem 0.5rem', fontSize: '0.72rem', fontWeight: 700 }}>CIQ {ciq}/100</span>}
          {urgency != null && urgency > 30 && <span style={{ background: '#fff5f5', color: '#c62828', borderRadius: '0.375rem', padding: '0.15rem 0.5rem', fontSize: '0.72rem', fontWeight: 700 }}>Urgency {urgency}/100</span>}
        </div>
      </div>
      {theme.aiRecommendation && <p style={{ fontSize: '0.75rem', color: '#0369a1', margin: '0.5rem 0 0', paddingTop: '0.5rem', borderTop: '1px solid #e9ecef' }}><strong>Action:</strong> {theme.aiRecommendation}</p>}
    </div>
  );
}

function DigestCard({ digest }: { digest: DigestRun }) {
  const summary = digest.summary as DigestSummary | null;
  const narration = summary?.narration as DigestNarration | null;
  const sentAt = new Date(digest.sentAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem', color: '#6C757D' }}>Generated {sentAt}</span>
          {summary?.generatedBy === 'llm' && <span style={{ background: '#f0f9ff', color: '#0369a1', borderRadius: '0.375rem', padding: '0.15rem 0.5rem', fontSize: '0.72rem', fontWeight: 600 }}>AI-generated</span>}
          {summary?.generatedBy === 'rule-based' && <span style={{ background: '#f8fafc', color: '#6C757D', borderRadius: '0.375rem', padding: '0.15rem 0.5rem', fontSize: '0.72rem', fontWeight: 600 }}>Rule-based fallback</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {summary && <SentimentBadge score={summary.sentimentSummary._avg.sentiment} trend={summary.sentimentSummary.trend} />}
          {summary && <VolumeBadge delta={summary.feedbackVolume.delta} />}
        </div>
      </div>
      {narration?.narrativeSummary && (
        <div style={{ ...CARD, borderLeft: '3px solid #0A2540', padding: '1.25rem 1.5rem' }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.625rem', color: '#0A2540' }}>Executive Summary</p>
          <p style={{ fontSize: '0.9rem', color: '#212529', lineHeight: 1.7, margin: 0 }}>{narration.narrativeSummary}</p>
        </div>
      )}
      {!narration?.narrativeSummary && summary?.summaryText && (
        <div style={{ ...CARD, borderLeft: '3px solid #0A2540', padding: '1.25rem 1.5rem' }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.625rem', color: '#0A2540' }}>Summary</p>
          <p style={{ fontSize: '0.9rem', color: '#212529', lineHeight: 1.7, margin: 0 }}>{summary.summaryText}</p>
        </div>
      )}
      {summary && summary.spikeEvents.length > 0 && (
        <div style={{ ...CARD, borderLeft: '3px solid #c62828', padding: '1.25rem 1.5rem', background: '#fff5f5' }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.625rem', color: '#c62828' }}>Support Spikes Detected</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {summary.spikeEvents.map((spike, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.875rem', color: '#212529', fontWeight: 600 }}>{spike.clusterTitle}</span>
                <span style={{ fontSize: '0.78rem', color: '#c62828' }}>{spike.ticketCount} tickets · z-score {spike.zScore.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
        <div style={CARD}>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.625rem', color: '#c62828' }}>Top Issues</p>
          <BulletList items={narration?.topIssues ?? []} />
        </div>
        <div style={CARD}>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.625rem', color: '#7c3aed' }}>Emerging Trends</p>
          <BulletList items={narration?.emergingTrends ?? []} />
        </div>
        <div style={CARD}>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.625rem', color: '#0369a1' }}>Recommended Actions</p>
          <BulletList items={narration?.recommendations ?? []} />
        </div>
      </div>
      {summary && summary.topThemes.length > 0 && (
        <div style={CARD}>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.625rem', color: '#495057' }}>Top Themes This Period</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {summary.topThemes.map((theme) => <ThemeRow key={theme.id} theme={theme} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {[1, 2, 3].map((i) => <div key={i} style={{ ...CARD, height: i === 1 ? '5rem' : '8rem', background: '#f8fafc', animation: 'pulse 1.5s infinite' }} />)}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
    </div>
  );
}

function DigestContent() {
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;
  const r = appRoutes(orgSlug);
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [genError, setGenError] = useState<string | null>(null);

  const { data: latestDigest, isLoading, isError } = useQuery<DigestRun | null>({
    queryKey: ['digest', 'latest', workspace?.id],
    queryFn: () => {
      if (!workspace?.id) return null;
      return apiClient.digest.getLatest(workspace.id);
    },
    enabled: !!workspace?.id,
    staleTime: 5 * 60 * 1000,
  });

  const generateMutation = useMutation<void, Error, void>({
    mutationFn: () => {
      if (!workspace?.id) throw new Error('Workspace not loaded');
      return apiClient.digest.generate(workspace.id);
    },
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['digest', 'latest', workspace?.id] });
      }, 3000);
    },
    onError: (err) => setGenError(err.message || 'Failed to generate digest.'),
  });

  const handleGenerate = () => {
    setGenError(null);
    generateMutation.mutate();
  };

  const generating = generateMutation.isPending;
  const generated = generateMutation.isSuccess;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0A2540', marginBottom: '0.375rem' }}>Weekly AI Digest</h1>
          <p style={{ color: '#6C757D', fontSize: '0.9rem', margin: 0 }}>AI-generated intelligence briefing — top issues, trends, and recommended actions from your workspace signals.</p>
        </div>
        <button onClick={handleGenerate} disabled={generating || generated} style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', border: 'none', background: generating || generated ? '#adb5bd' : '#0A2540', color: '#fff', fontSize: '0.82rem', fontWeight: 600, cursor: generating || generated ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
          {generating ? 'Generating…' : generated ? 'Queued ✓' : 'Generate now'}
        </button>
      </div>

      {/* Schedule info bar */}
      <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '0.75rem', padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontSize: '1rem' }}>🗓️</span>
        <span style={{ fontSize: '0.82rem', color: '#0c4a6e' }}><strong style={{ color: '#0369a1' }}>Scheduled delivery:</strong> Every Monday at 8:00 AM UTC — sent to all workspace members.</span>
      </div>

      {/* Success banner */}
      {generated && (
        <div style={{ padding: '0.875rem 1.25rem', background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '0.75rem' }}>
          <p style={{ fontWeight: 600, color: '#2e7d32', margin: '0 0 0.2rem', fontSize: '0.9rem' }}>Digest generation queued</p>
          <p style={{ color: '#388e3c', fontSize: '0.8rem', margin: 0 }}>Your digest is being compiled. This page will refresh automatically in a few seconds.</p>
        </div>
      )}

      {/* Error banner */}
      {genError && (
        <div style={{ padding: '0.75rem 1rem', background: '#fff5f5', border: '1px solid #f5c6cb', borderRadius: '0.5rem', color: '#e63946', fontSize: '0.875rem' }}>{genError}</div>
      )}

      {/* Error state */}
      {isError && (
        <div style={{ ...CARD, textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: '#e63946', fontWeight: 600, margin: '0 0 0.5rem' }}>Failed to load digest</p>
          <p style={{ color: '#6C757D', fontSize: '0.875rem', margin: 0 }}>Please refresh the page or try again later.</p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {[1, 2, 3].map((i) => <div key={i} style={{ ...CARD, height: i === 1 ? '5rem' : '8rem', background: '#f8fafc', animation: 'pulse 1.5s infinite' }} />)}
          <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
        </div>
      )}

      {/* Live digest content */}
      {!isLoading && !isError && latestDigest && <DigestCard digest={latestDigest} />}

      {/* Empty state */}
      {!isLoading && !isError && !latestDigest && (
        <div style={{ ...CARD, textAlign: 'center', padding: '3rem 2rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📬</div>
          <p style={{ fontWeight: 700, color: '#0A2540', fontSize: '1.05rem', margin: '0 0 0.5rem' }}>No digest generated yet</p>
          <p style={{ color: '#6C757D', fontSize: '0.875rem', maxWidth: '420px', margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
            Your first scheduled digest will arrive next Monday at 8:00 AM UTC. You can also generate one right now to see a summary of this week&apos;s signals.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleGenerate} disabled={generating || generated} style={{ padding: '0.6rem 1.5rem', borderRadius: '0.5rem', border: 'none', background: generating || generated ? '#adb5bd' : '#0A2540', color: '#fff', fontSize: '0.875rem', fontWeight: 600, cursor: generating || generated ? 'not-allowed' : 'pointer' }}>
              {generating ? 'Generating…' : generated ? 'Queued ✓' : 'Generate digest now'}
            </button>
            <Link href={r.themes} style={{ padding: '0.6rem 1.5rem', borderRadius: '0.5rem', border: '1px solid #ced4da', background: '#fff', color: '#495057', fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>View themes first</Link>
          </div>
          <p style={{ color: '#adb5bd', fontSize: '0.75rem', marginTop: '1.25rem' }}>Digests are automatically sent every Monday at 8:00 AM UTC to all workspace members.</p>
        </div>
      )}

      {/* Footer note */}
      {!isLoading && latestDigest && (
        <p style={{ color: '#adb5bd', fontSize: '0.75rem', textAlign: 'center', margin: 0 }}>
          Showing the most recent digest. Digests are generated automatically every Monday at 8:00 AM UTC.{' '}
          <Link href={r.themes} style={{ color: '#0369a1', textDecoration: 'none' }}>View all themes →</Link>
        </p>
      )}
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

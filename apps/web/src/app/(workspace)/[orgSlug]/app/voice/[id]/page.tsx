'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PlanGate } from '@/components/shared/plan-gate';
import {
  useVoiceUploadDetail,
  useVoiceReprocess,
  useVoiceLinkTheme,
  useVoiceLinkCustomer,
} from '@/hooks/use-voice';
import { useThemeList } from '@/hooks/use-themes';
import { useWorkspace } from '@/hooks/use-workspace';
import { appRoutes } from '@/lib/routes';
import { VoiceUploadDetail } from '@/lib/api-types';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  navy:    '#0A2540',
  teal:    '#20A4A4',
  green:   '#198754',
  amber:   '#FFC107',
  red:     '#DC3545',
  muted:   '#6C757D',
  border:  '#DEE2E6',
  surface: '#FFFFFF',
  bg:      '#F8F9FA',
  purple:  '#6F42C1',
  blue:    '#0D6EFD',
  orange:  '#FD7E14',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatARR(value: number | null): string {
  if (!value) return '';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M ARR`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K ARR`;
  return `$${value} ARR`;
}

function sentimentLabel(v: number | null): { label: string; color: string } {
  if (v === null) return { label: 'N/A', color: C.muted };
  if (v >= 0.3)  return { label: 'Positive', color: C.green };
  if (v <= -0.3) return { label: 'Negative', color: C.red };
  return { label: 'Neutral', color: C.amber };
}

function urgencyColor(v: number | null): string {
  if (v === null) return C.muted;
  if (v >= 70) return C.red;
  if (v >= 40) return C.orange;
  return C.green;
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status, label }: { status: string | null; label?: string }) {
  const map: Record<string, { text: string; bg: string; color: string }> = {
    QUEUED:     { text: 'Queued',      bg: '#FFF3CD', color: '#856404' },
    RUNNING:    { text: 'Processing',  bg: '#CCE5FF', color: '#004085' },
    PROCESSING: { text: 'Processing',  bg: '#CCE5FF', color: '#004085' },
    COMPLETED:  { text: label ?? 'Done', bg: '#D4EDDA', color: '#155724' },
    FAILED:     { text: 'Failed',      bg: '#F8D7DA', color: '#721C24' },
  };
  const s = status ? (map[status] ?? { text: status, bg: '#E9ECEF', color: C.navy }) : { text: 'Unknown', bg: '#E9ECEF', color: C.navy };
  return (
    <span style={{ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, background: s.bg, color: s.color, letterSpacing: '0.02em' }}>
      {s.text}
    </span>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────
function Card({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${accent ? accent + '44' : C.border}`, borderRadius: '0.875rem', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <div style={{ padding: '0.875rem 1.25rem', borderBottom: `1px solid ${accent ? accent + '33' : C.border}`, background: accent ? accent + '08' : C.bg, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontWeight: 700, fontSize: '0.82rem', color: accent ?? C.navy, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</span>
      </div>
      <div style={{ padding: '1.25rem' }}>
        {children}
      </div>
    </div>
  );
}

// ─── Metric tile ──────────────────────────────────────────────────────────────
function MetricTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '0.625rem', padding: '0.875rem 1rem' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: '1.05rem', color: color ?? C.navy }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: C.muted, marginTop: '0.15rem' }}>{sub}</div>}
    </div>
  );
}

// ─── Signal bar ───────────────────────────────────────────────────────────────
function SignalBar({ label, value, color, max = 100 }: { label: string; value: number | null; color: string; max?: number }) {
  if (value === null) return null;
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <div style={{ width: 90, fontSize: '0.78rem', color: C.muted, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 8, background: '#E9ECEF', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.5s' }} />
      </div>
      <div style={{ width: 36, fontSize: '0.78rem', fontWeight: 700, color, textAlign: 'right', flexShrink: 0 }}>{value}</div>
    </div>
  );
}

// ─── Tag pill ─────────────────────────────────────────────────────────────────
function TagPill({ text, color }: { text: string; color: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '0.25rem 0.7rem', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 500, background: color + '18', color, border: `1px solid ${color}33`, marginRight: '0.4rem', marginBottom: '0.4rem' }}>
      {text}
    </span>
  );
}

// ─── Link theme panel ─────────────────────────────────────────────────────────
function LinkThemePanel({ uploadId, orgSlug, currentThemeId }: { uploadId: string; orgSlug: string; currentThemeId: string | null }) {
  const [selected, setSelected] = useState('');
  const { data: themePages } = useThemeList({ limit: 100 });
  const { mutate: linkTheme, isPending, isSuccess, isError } = useVoiceLinkTheme(orgSlug);
  const themes = themePages?.pages.flatMap((p: { data: { id: string; title: string }[] }) => p.data) ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {currentThemeId && (
        <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: '0.5rem', padding: '0.6rem 0.875rem', fontSize: '0.82rem', color: C.purple, fontWeight: 600 }}>
          Currently linked to a theme. Selecting a new theme below will override the existing link.
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          style={{ flex: 1, padding: '0.6rem 0.875rem', border: `1px solid ${C.border}`, borderRadius: '0.5rem', fontSize: '0.875rem', color: C.navy, background: C.surface, outline: 'none' }}
        >
          <option value="">— Select a theme —</option>
          {themes.map(t => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
        <button
          onClick={() => selected && linkTheme({ uploadId, themeId: selected })}
          disabled={!selected || isPending}
          style={{ padding: '0.6rem 1.25rem', background: selected ? C.navy : '#E9ECEF', color: selected ? '#fff' : C.muted, border: 'none', borderRadius: '0.5rem', fontWeight: 600, fontSize: '0.875rem', cursor: selected ? 'pointer' : 'not-allowed' }}
        >
          {isPending ? 'Linking…' : 'Link Theme'}
        </button>
      </div>
      {isSuccess && (
        <div style={{ fontSize: '0.82rem', color: C.green, fontWeight: 600 }}>
          ✓ Theme linked. CIQ scores will be updated shortly.
        </div>
      )}
      {isError && (
        <div style={{ fontSize: '0.82rem', color: C.red }}>
          Failed to link theme. Please try again.
        </div>
      )}
    </div>
  );
}

// ─── Detail page inner ────────────────────────────────────────────────────────
function VoiceDetailInner() {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const uploadId = params.id as string;
  const router = useRouter();
  const r = appRoutes(orgSlug);
  const { workspace } = useWorkspace();

  const { data: detail, isLoading, isError, refetch } = useVoiceUploadDetail(orgSlug, uploadId, true);
  const { mutate: reprocess, isPending: isReprocessing } = useVoiceReprocess(orgSlug);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 900 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ height: 120, background: '#E9ECEF', borderRadius: '0.875rem', animation: 'shimmer 1.5s infinite' }} />
        ))}
        <style>{`@keyframes shimmer { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
      </div>
    );
  }

  if (isError || !detail) {
    return (
      <div style={{ padding: '3rem 2rem', textAlign: 'center', color: C.red }}>
        <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Failed to load voice upload.</div>
        <button onClick={() => refetch()} style={{ padding: '0.5rem 1.25rem', background: C.navy, color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}>
          Retry
        </button>
      </div>
    );
  }

  const d = detail as VoiceUploadDetail;
  const intel = d.intelligence;
  const sentInfo = sentimentLabel(d.sentiment ?? intel?.sentiment ?? null);
  const displayTitle = d.label ?? d.feedbackTitle ?? d.fileName;

  // Determine overall status
  const overallStatus = (() => {
    if (d.intelligenceStatus === 'COMPLETED') return 'Analysed';
    if (d.intelligenceStatus === 'RUNNING' || d.intelligenceStatus === 'QUEUED' || d.intelligenceStatus === 'PROCESSING') return 'Extracting intelligence…';
    if (d.jobStatus === 'COMPLETED') return 'Transcribed';
    if (d.jobStatus === 'RUNNING' || d.jobStatus === 'QUEUED' || d.jobStatus === 'PROCESSING') return 'Transcribing…';
    if (d.jobStatus === 'FAILED') return 'Failed';
    return 'Unknown';
  })();

  const isFailed = d.jobStatus === 'FAILED' || d.intelligenceStatus === 'FAILED';
  const isInProgress = d.jobStatus === 'QUEUED' || d.jobStatus === 'RUNNING' || d.jobStatus === 'PROCESSING' ||
                       d.intelligenceStatus === 'QUEUED' || d.intelligenceStatus === 'RUNNING' || d.intelligenceStatus === 'PROCESSING';

  // Revenue influence display
  const revenueInfluence = d.customer?.arrValue ?? null;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Back navigation */}
      <button
        onClick={() => router.push(r.voice)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: '0.85rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem', padding: 0 }}
      >
        ← Back to Voice Feedback
      </button>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.75rem', gap: '1rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
            <div style={{ width: 36, height: 36, borderRadius: '0.5rem', background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.purple} strokeWidth="2">
                <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: C.navy, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayTitle}
            </h1>
            <StatusBadge status={d.intelligenceStatus === 'COMPLETED' ? 'COMPLETED' : d.jobStatus} label={overallStatus} />
          </div>
          <div style={{ fontSize: '0.8rem', color: C.muted, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span>{formatBytes(d.sizeBytes)}</span>
            {d.durationSeconds && <><span>·</span><span>{formatDuration(d.durationSeconds)}</span></>}
            <span>·</span>
            <span>{new Date(d.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            {d.customer && (
              <span style={{ background: '#EFF6FF', color: '#1E40AF', padding: '0.1rem 0.45rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, border: '1px solid #BFDBFE' }}>
                {d.customer.companyName ?? d.customer.name}
                {d.customer.arrValue ? ` · ${formatARR(d.customer.arrValue)}` : ''}
              </span>
            )}
            {d.deal && (
              <span style={{ background: '#F0FDF4', color: '#166534', padding: '0.1rem 0.45rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, border: '1px solid #BBF7D0' }}>
                {d.deal.title}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
          {isFailed && (
            <button
              onClick={() => reprocess(uploadId)}
              disabled={isReprocessing}
              style={{ padding: '0.55rem 1.1rem', background: 'transparent', border: `1px solid ${C.orange}`, borderRadius: '0.5rem', color: C.orange, fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}
            >
              {isReprocessing ? '…' : '↻ Retry'}
            </button>
          )}
          {d.downloadUrl && (
            <a
              href={d.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ padding: '0.55rem 1.1rem', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: '0.5rem', color: C.muted, fontWeight: 600, fontSize: '0.82rem', textDecoration: 'none' }}
            >
              ↓ Download
            </a>
          )}
          {d.feedbackId && (
            <button
              onClick={() => router.push(r.inboxItem(d.feedbackId!))}
              style={{ padding: '0.55rem 1.1rem', background: C.teal, border: 'none', borderRadius: '0.5rem', color: '#fff', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}
            >
              View Feedback →
            </button>
          )}
        </div>
      </div>

      {/* In-progress banner */}
      {isInProgress && (
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '0.75rem', padding: '0.875rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.blue, animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
          <span style={{ fontSize: '0.875rem', color: C.navy }}>
            <strong>{d.jobStatus !== 'COMPLETED' ? 'Transcribing audio…' : 'Extracting product intelligence…'}</strong> This page will automatically refresh when complete.
          </span>
        </div>
      )}

      {/* Error banner */}
      {d.error && (
        <div style={{ background: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: '0.75rem', padding: '0.875rem 1.25rem', marginBottom: '1.5rem', fontSize: '0.875rem', color: C.red }}>
          <strong>Pipeline error:</strong> {d.error}
        </div>
      )}

      {/* Main grid: left column (2/3) + right column (1/3) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.25rem', alignItems: 'start' }}>

        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* AI Insight Summary */}
          {intel?.summary && (
            <Card title="AI Insight Summary" accent={C.purple}>
              <p style={{ margin: 0, fontSize: '0.9rem', color: C.navy, lineHeight: 1.7 }}>{intel.summary}</p>
            </Card>
          )}

          {/* Transcript */}
          {d.transcript ? (
            <Card title="Transcript">
              <div style={{ fontSize: '0.875rem', color: C.navy, lineHeight: 1.75, maxHeight: 400, overflowY: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace', background: '#FAFAFA', borderRadius: '0.375rem', padding: '0.875rem' }}>
                {d.transcript}
              </div>
            </Card>
          ) : (d.jobStatus === 'QUEUED' || d.jobStatus === 'RUNNING' || d.jobStatus === 'PROCESSING') ? (
            <Card title="Transcript">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: C.muted, fontSize: '0.875rem' }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#CCE5FF', animation: 'pulse 1.5s infinite' }} />
                Transcription in progress — this may take a minute.
              </div>
            </Card>
          ) : null}

          {/* Detected feature requests */}
          {intel?.featureRequests && intel.featureRequests.length > 0 && (
            <Card title="Detected Feature Requests" accent={C.teal}>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {intel.featureRequests.map((f, i) => (
                  <li key={i} style={{ fontSize: '0.875rem', color: C.navy, lineHeight: 1.6 }}>{f}</li>
                ))}
              </ul>
            </Card>
          )}

          {/* Pain points */}
          {intel?.painPoints && intel.painPoints.length > 0 && (
            <Card title="Pain Points" accent={C.red}>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {intel.painPoints.map((p, i) => (
                  <li key={i} style={{ fontSize: '0.875rem', color: C.navy, lineHeight: 1.6 }}>{p}</li>
                ))}
              </ul>
            </Card>
          )}

          {/* Generated feedback */}
          {d.feedback && (
            <Card title="Generated Feedback Record">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: C.navy, fontSize: '0.9rem', marginBottom: '0.35rem' }}>{d.feedback.title}</div>
                  {d.feedback.summary && (
                    <div style={{ fontSize: '0.82rem', color: C.muted, lineHeight: 1.6, marginBottom: '0.5rem' }}>{d.feedback.summary}</div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.5rem' }}>
                    {d.feedback.themes?.map(t => (
                      <span
                        key={t.id}
                        onClick={() => router.push(r.themeItem(t.id))}
                        style={{ background: '#F5F3FF', color: C.purple, padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid #DDD6FE', cursor: 'pointer' }}
                      >
                        {t.title}
                        {t.priorityScore !== null && t.priorityScore !== undefined ? ` · ${Math.round(t.priorityScore)}` : ''}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => router.push(r.inboxItem(d.feedback!.id))}
                  style={{ padding: '0.4rem 0.875rem', background: 'transparent', border: `1px solid ${C.teal}`, borderRadius: '0.5rem', color: C.teal, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
                >
                  Open →
                </button>
              </div>
            </Card>
          )}

          {/* Link to theme */}
          <Card title="Link to Theme">
            <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: C.muted, lineHeight: 1.6 }}>
              Manually link this recording to a theme. This will update the theme&apos;s CIQ priority score to include the voice signal.
            </p>
            <LinkThemePanel
              uploadId={uploadId}
              orgSlug={orgSlug}
              currentThemeId={intel?.linkedThemeId ?? null}
            />
          </Card>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Signal metrics */}
          <Card title="Signal Metrics">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              <MetricTile
                label="Sentiment"
                value={sentInfo.label}
                sub={d.sentiment !== null ? `${d.sentiment > 0 ? '+' : ''}${d.sentiment?.toFixed(2)}` : undefined}
                color={sentInfo.color}
              />
              {intel?.confidenceScore !== null && intel?.confidenceScore !== undefined && (
                <MetricTile
                  label="Signal Confidence"
                  value={`${Math.round(intel.confidenceScore * 100)}%`}
                  sub={intel.confidenceScore >= 0.7 ? 'High signal' : intel.confidenceScore >= 0.4 ? 'Medium signal' : 'Low signal'}
                  color={intel.confidenceScore >= 0.7 ? C.green : intel.confidenceScore >= 0.4 ? C.amber : C.red}
                />
              )}
              {d.durationSeconds && (
                <MetricTile label="Duration" value={formatDuration(d.durationSeconds)} />
              )}
            </div>
          </Card>

          {/* CIQ Signal Visualization */}
          {(d.urgencySignal !== null || d.churnSignal !== null || d.sentiment !== null) && (
            <Card title="CIQ Signal Intensity" accent={C.purple}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                <SignalBar label="Urgency" value={d.urgencySignal} color={urgencyColor(d.urgencySignal)} />
                <SignalBar label="Churn Risk" value={d.churnSignal} color={C.red} />
                {d.sentiment !== null && (
                  <SignalBar
                    label="Sentiment"
                    value={Math.round(Math.abs(d.sentiment ?? 0) * 100)}
                    color={sentimentLabel(d.sentiment).color}
                  />
                )}
                {intel?.confidenceScore !== null && intel?.confidenceScore !== undefined && (
                  <SignalBar
                    label="Confidence"
                    value={Math.round(intel.confidenceScore * 100)}
                    color={C.teal}
                  />
                )}
              </div>
              <div style={{ marginTop: '0.875rem', padding: '0.625rem 0.875rem', background: '#F5F3FF', borderRadius: '0.5rem', fontSize: '0.78rem', color: C.purple, lineHeight: 1.55 }}>
                These signals feed directly into the CIQ priority score for linked themes.
              </div>
            </Card>
          )}

          {/* Revenue influence */}
          {revenueInfluence && (
            <Card title="Revenue Influence" accent={C.green}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ fontWeight: 700, fontSize: '1.25rem', color: C.green }}>{formatARR(revenueInfluence)}</div>
                <div style={{ fontSize: '0.78rem', color: C.muted, lineHeight: 1.55 }}>
                  From linked customer: {d.customer?.companyName ?? d.customer?.name}
                  {d.customer?.churnRisk !== null && d.customer?.churnRisk !== undefined && d.customer.churnRisk >= 50 && (
                    <span style={{ marginLeft: '0.5rem', color: C.red, fontWeight: 600 }}>⚠ AT RISK</span>
                  )}
                </div>
                {d.deal && (
                  <div style={{ marginTop: '0.25rem', fontSize: '0.78rem', color: C.muted }}>
                    Deal: <strong style={{ color: C.navy }}>{d.deal.title}</strong> · {d.deal.stage}
                    {d.deal.annualValue ? ` · $${(d.deal.annualValue / 1000).toFixed(0)}K` : ''}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Key topics */}
          {intel?.keyTopics && intel.keyTopics.length > 0 && (
            <Card title="Key Topics">
              <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                {intel.keyTopics.map(t => <TagPill key={t} text={t} color={C.teal} />)}
              </div>
            </Card>
          )}

          {/* Detected themes */}
          {d.feedback?.themes && d.feedback.themes.length > 0 && (
            <Card title="Detected Themes" accent={C.purple}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {d.feedback.themes.map(t => (
                  <div
                    key={t.id}
                    onClick={() => router.push(r.themeItem(t.id))}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: '#F5F3FF', borderRadius: '0.5rem', cursor: 'pointer', border: '1px solid #EDE9FE' }}
                  >
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: C.purple, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                    {t.priorityScore !== null && t.priorityScore !== undefined && (
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: C.purple, background: '#EDE9FE', padding: '0.1rem 0.45rem', borderRadius: '999px', flexShrink: 0, marginLeft: '0.5rem' }}>
                        CIQ {Math.round(t.priorityScore)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Pipeline status */}
          <Card title="Pipeline Status">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.82rem', color: C.muted }}>Transcription</span>
                <StatusBadge status={d.jobStatus} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.82rem', color: C.muted }}>Intelligence</span>
                <StatusBadge status={d.intelligenceStatus} />
              </div>
              {d.feedbackId && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.82rem', color: C.muted }}>Feedback created</span>
                  <StatusBadge status="COMPLETED" label="Yes" />
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <style>{`
        @keyframes shimmer { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────
export default function VoiceDetailPage() {
  return (
    <PlanGate feature="voiceFeedback" requiredPlan="Pro">
      <VoiceDetailInner />
    </PlanGate>
  );
}

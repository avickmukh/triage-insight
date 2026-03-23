'use client';

import { useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PlanGate } from '@/components/shared/plan-gate';
import {
  useVoiceUploads,
  useVoiceUploadDetail,
  useVoiceUpload,
} from '@/hooks/use-voice';
import { useCurrentMemberRole } from '@/hooks/use-workspace';
import { WorkspaceRole } from '@/lib/api-types';
import { appRoutes } from '@/lib/routes';

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
};

function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    QUEUED:    { label: 'Queued',      bg: '#FFF3CD', color: '#856404' },
    RUNNING:   { label: 'Processing',  bg: '#CCE5FF', color: '#004085' },
    COMPLETED: { label: 'Transcribed', bg: '#D4EDDA', color: '#155724' },
    FAILED:    { label: 'Failed',      bg: '#F8D7DA', color: '#721C24' },
  };
  const s = status ? (map[status] ?? { label: status, bg: '#E9ECEF', color: C.navy }) : { label: 'Unknown', bg: '#E9ECEF', color: C.navy };
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.2rem 0.6rem',
      borderRadius: '999px',
      fontSize: '0.75rem',
      fontWeight: 600,
      background: s.bg,
      color: s.color,
    }}>
      {s.label}
    </span>
  );
}

interface VoiceUploadListItem {
  id: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
  jobStatus: string | null;
  jobId: string | null;
  transcript: string | null;
  feedbackId: string | null;
  feedbackTitle: string | null;
  error: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadRow({ item, orgSlug }: { item: VoiceUploadListItem; orgSlug: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data: detail, isLoading } = useVoiceUploadDetail(orgSlug, item.id, expanded);
  const router = useRouter();
  const r = appRoutes(orgSlug);

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0.75rem', overflow: 'hidden', marginBottom: '0.75rem' }}>
      <div onClick={() => setExpanded(e => !e)} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', cursor: 'pointer' }}>
        <div style={{ width: 40, height: 40, borderRadius: '0.5rem', background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.purple} strokeWidth="2">
            <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: C.navy, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.fileName}</div>
          <div style={{ fontSize: '0.78rem', color: C.muted, marginTop: '0.15rem' }}>
            {formatBytes(item.sizeBytes)} · {new Date(item.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        </div>
        <StatusBadge status={item.jobStatus} />
        {item.feedbackId && (
          <button onClick={e => { e.stopPropagation(); router.push(r.inboxItem(item.feedbackId!)); }} style={{ padding: '0.3rem 0.75rem', borderRadius: '0.5rem', border: `1px solid ${C.teal}`, background: 'transparent', color: C.teal, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
            View Feedback →
          </button>
        )}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '1rem 1.25rem', background: C.bg }}>
          {isLoading ? (
            <div style={{ color: C.muted, fontSize: '0.875rem' }}>Loading detail…</div>
          ) : detail ? (
            <div>
              {detail.transcript && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Transcript</div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0.5rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: C.navy, lineHeight: 1.6, maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                    {detail.transcript}
                  </div>
                </div>
              )}
              {detail.error && (
                <div style={{ background: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: '0.5rem', padding: '0.75rem 1rem', fontSize: '0.875rem', color: C.red, marginBottom: '1rem' }}>
                  <strong>Error:</strong> {detail.error}
                </div>
              )}
              {detail.feedback && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Generated Feedback</div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0.5rem', padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: C.navy, fontSize: '0.875rem' }}>{detail.feedback.title}</div>
                      <div style={{ fontSize: '0.78rem', color: C.muted, marginTop: '0.2rem' }}>{new Date(detail.feedback.createdAt).toLocaleDateString('en-GB')}</div>
                    </div>
                    <button onClick={() => router.push(r.inboxItem(detail.feedback!.id))} style={{ padding: '0.3rem 0.75rem', borderRadius: '0.5rem', border: `1px solid ${C.teal}`, background: 'transparent', color: C.teal, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                      Open →
                    </button>
                  </div>
                </div>
              )}
              {(detail.jobStatus === 'QUEUED' || detail.jobStatus === 'RUNNING') && !detail.transcript && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: C.muted, fontSize: '0.875rem' }}>
                  <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: '#CCE5FF' }} />
                  Transcription in progress — this may take a minute.
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

const ALLOWED_TYPES = ['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/wave','audio/m4a','audio/x-m4a','audio/mp4','audio/ogg','audio/webm','audio/flac'];
const MAX_SIZE_BYTES = 100 * 1024 * 1024;

function UploadZone({ workspaceId, orgSlug }: { workspaceId: string; orgSlug: string }) {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const [uploadState, setUploadState] = useState<'idle'|'uploading'|'finalizing'|'done'|'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload } = useVoiceUpload(workspaceId);

  const handleFile = useCallback((f: File) => {
    if (!ALLOWED_TYPES.includes(f.type)) { setErrorMsg(`Unsupported type: ${f.type}`); return; }
    if (f.size > MAX_SIZE_BYTES) { setErrorMsg(`File too large (${formatBytes(f.size)}). Max 100 MB.`); return; }
    setErrorMsg(''); setFile(f);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const dropped = e.dataTransfer.files[0]; if (dropped) handleFile(dropped);
  }, [handleFile]);

  const handleUpload = async () => {
    if (!file) return;
    setUploadState('uploading'); setProgress(0); setErrorMsg('');
    try {
      await upload(file, label || undefined, (p) => setProgress(p));
      setUploadState('finalizing');
      await new Promise(r => setTimeout(r, 800));
      setUploadState('done'); setFile(null); setLabel(''); setProgress(0);
    } catch (err) {
      setErrorMsg((err as Error).message ?? 'Upload failed.'); setUploadState('error');
    }
  };

  const reset = () => { setFile(null); setLabel(''); setUploadState('idle'); setProgress(0); setErrorMsg(''); };

  return (
    <div style={{ marginBottom: '2rem' }}>
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !file && fileInputRef.current?.click()}
        style={{ border: `2px dashed ${dragOver ? C.teal : file ? C.green : C.border}`, borderRadius: '0.875rem', padding: '2.5rem 2rem', textAlign: 'center', background: dragOver ? '#F0FAFA' : file ? '#F0FFF4' : C.bg, cursor: file ? 'default' : 'pointer', transition: 'all 0.2s' }}
      >
        <input ref={fileInputRef} type="file" accept={ALLOWED_TYPES.join(',')} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        {!file ? (
          <>
            <div style={{ marginBottom: '0.75rem' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="1.5" style={{ margin: '0 auto' }}>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </div>
            <div style={{ fontWeight: 600, color: C.navy, marginBottom: '0.25rem' }}>Drop audio file here or click to browse</div>
            <div style={{ fontSize: '0.8rem', color: C.muted }}>Supports mp3, wav, m4a, ogg, webm, flac · Max 100 MB</div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2">
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 600, color: C.navy, fontSize: '0.9rem' }}>{file.name}</div>
              <div style={{ fontSize: '0.78rem', color: C.muted }}>{formatBytes(file.size)}</div>
            </div>
            <button onClick={e => { e.stopPropagation(); reset(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: '0.25rem' }}>✕</button>
          </div>
        )}
      </div>
      {errorMsg && <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', background: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: '0.5rem', color: C.red, fontSize: '0.875rem' }}>{errorMsg}</div>}
      {file && uploadState === 'idle' && (
        <div style={{ marginTop: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: C.navy, marginBottom: '0.35rem' }}>Label (optional)</label>
          <input type="text" placeholder="e.g. Customer call with Acme Corp" value={label} onChange={e => setLabel(e.target.value)} style={{ width: '100%', padding: '0.6rem 0.875rem', border: `1px solid ${C.border}`, borderRadius: '0.5rem', fontSize: '0.875rem', color: C.navy, outline: 'none', boxSizing: 'border-box' }} />
        </div>
      )}
      {(uploadState === 'uploading' || uploadState === 'finalizing') && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: C.muted, marginBottom: '0.35rem' }}>
            <span>{uploadState === 'finalizing' ? 'Finalizing…' : `Uploading… ${progress}%`}</span>
            <span>{progress}%</span>
          </div>
          <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${uploadState === 'finalizing' ? 100 : progress}%`, background: C.teal, borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}
      {uploadState === 'done' && (
        <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', background: '#D4EDDA', border: '1px solid #C3E6CB', borderRadius: '0.5rem', color: '#155724', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
          Upload complete. Transcription has been queued — your feedback will appear below once processing finishes.
        </div>
      )}
      {file && uploadState === 'idle' && (
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
          <button onClick={handleUpload} style={{ padding: '0.65rem 1.5rem', background: C.navy, color: '#fff', border: 'none', borderRadius: '0.5rem', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>
            Upload &amp; Transcribe
          </button>
          <button onClick={reset} style={{ padding: '0.65rem 1rem', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function VoicePageInner() {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const { role } = useCurrentMemberRole();
  const canUpload = role === WorkspaceRole.ADMIN || role === WorkspaceRole.EDITOR;
  const { data, isLoading, isError, refetch } = useVoiceUploads(orgSlug);
  const uploads: VoiceUploadListItem[] = data?.data ?? [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: C.navy, margin: 0 }}>Voice Feedback</h1>
          <p style={{ color: C.muted, marginTop: '0.35rem', fontSize: '0.9rem' }}>
            Upload audio recordings to automatically transcribe and convert them into feedback signals.
          </p>
        </div>
        <button onClick={() => refetch()} style={{ padding: '0.5rem 1rem', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: '0.5rem', color: C.muted, fontSize: '0.8rem', cursor: 'pointer' }}>
          ↻ Refresh
        </button>
      </div>

      {canUpload && (
        <section style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>New Upload</div>
          <UploadZone workspaceId={orgSlug} orgSlug={orgSlug} />
        </section>
      )}

      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Uploads {data?.total !== undefined && `(${data.total})`}
          </div>
        </div>
        {isLoading && [1,2,3].map(i => (
          <div key={i} style={{ height: 72, background: '#E9ECEF', borderRadius: '0.75rem', marginBottom: '0.75rem', animation: 'shimmer 1.5s infinite' }} />
        ))}
        {isError && <div style={{ padding: '2rem', textAlign: 'center', color: C.red, fontSize: '0.875rem' }}>Failed to load uploads. Please refresh.</div>}
        {!isLoading && !isError && uploads.length === 0 && (
          <div style={{ padding: '3rem 2rem', textAlign: 'center', border: `2px dashed ${C.border}`, borderRadius: '0.875rem', color: C.muted }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={C.border} strokeWidth="1.5" style={{ margin: '0 auto 0.75rem' }}>
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No uploads yet</div>
            <div style={{ fontSize: '0.8rem' }}>{canUpload ? 'Upload your first audio file above to get started.' : 'No voice uploads have been added to this workspace yet.'}</div>
          </div>
        )}
        {!isLoading && !isError && uploads.map(item => <UploadRow key={item.id} item={item} orgSlug={orgSlug} />)}
      </section>

      <style>{`
        @keyframes shimmer { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}

export default function VoicePage() {
  return (
    <PlanGate feature="voiceFeedback" requiredPlan="Pro">
      <VoicePageInner />
    </PlanGate>
  );
}

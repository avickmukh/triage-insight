'use client';

/**
 * AIPipelineProgress — v4 (Ghost-Pipeline Fix)
 *
 * Changes vs v3:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. IDLE guard: when backend returns stage === 'IDLE' or total === 0 and
 *    isRunning === false, the banner is hidden immediately and localStorage
 *    flag is cleared. Fixes the ghost "AI Pipeline Running" banner.
 *
 * 2. Stale localStorage TTL (30 min): the pipelineRunning_<workspaceId> key
 *    is ignored if it is older than 30 minutes. Prevents ghost banners on
 *    page load hours after the last upload.
 *
 * 3. Dismiss button: a × button lets users manually dismiss the banner.
 *    Clicking it calls POST /feedback/reset-pipeline (heals stuck RUNNING
 *    records in the DB) and clears the localStorage flag.
 *
 * 4. Batch-status path unchanged: batchId polling still uses the batch-scoped
 *    endpoint. IDLE guard still applies.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import apiClient from '@/lib/api-client';

export interface PipelineStatus {
  isRunning: boolean;
  stage: string;
  total: number;
  completed: number;
  failed: number;
  pending: number;
  pct: number;
  estimatedSecondsLeft?: number | null;
  batchId?: string;
}

const LS_RUNNING_KEY   = (workspaceId: string) => `pipelineRunning_${workspaceId}`;
const LS_BATCH_KEY     = (workspaceId: string) => `pipelineBatchId_${workspaceId}`;
const POLL_INTERVAL_MS = 3_000;
/** localStorage flag expires after 30 minutes to prevent ghost banners on page reload */
const LS_TTL_MS        = 30 * 60 * 1_000;

const STAGE_LABELS: Record<string, string> = {
  IDLE:       'Idle',
  UPLOADED:   'Upload complete — queuing for analysis…',
  QUEUED:     'Queued — waiting to start…',
  ANALYZING:  'Analysing feedback — generating embeddings & summaries…',
  CLUSTERING: 'Clustering — grouping similar feedback into themes…',
  COMPLETED:  'Analysis complete ✓',
  FAILED:     'Some items failed — retrying automatically…',
};

export function markPipelineStarted(workspaceId: string, batchId?: string) {
  try {
    localStorage.setItem(LS_RUNNING_KEY(workspaceId), String(Date.now()));
    if (batchId) {
      localStorage.setItem(LS_BATCH_KEY(workspaceId), batchId);
    }
  } catch { /* SSR / private mode */ }
}

function clearPipelineFlag(workspaceId: string) {
  try {
    localStorage.removeItem(LS_RUNNING_KEY(workspaceId));
    localStorage.removeItem(LS_BATCH_KEY(workspaceId));
  } catch { /* ignore */ }
}

/**
 * Returns true only if the localStorage flag exists AND is younger than LS_TTL_MS.
 * Stale flags are removed immediately to prevent ghost banners on page load.
 */
function hasFreshPipelineFlag(workspaceId: string): boolean {
  try {
    const raw = localStorage.getItem(LS_RUNNING_KEY(workspaceId));
    if (!raw) return false;
    const ts = Number(raw);
    if (isNaN(ts) || Date.now() - ts > LS_TTL_MS) {
      clearPipelineFlag(workspaceId);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function getStoredBatchId(workspaceId: string): string | null {
  try { return localStorage.getItem(LS_BATCH_KEY(workspaceId)); }
  catch { return null; }
}

interface Props {
  workspaceId: string;
  batchId?: string;
  onComplete?: () => void;
}

export function AIPipelineProgress({ workspaceId, batchId: propBatchId, onComplete }: Props) {
  const [status, setStatus]         = useState<PipelineStatus | null>(null);
  const [visible, setVisible]       = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // ── Capture batchId ONCE at mount time ──────────────────────────────────
  // Using a ref means clearing localStorage later does NOT change this value,
  // which previously caused the useEffect to re-run and restart polling
  // against the workspace endpoint after the batch was already COMPLETED.
  const batchIdRef = useRef<string | undefined>(
    propBatchId ?? getStoredBatchId(workspaceId) ?? undefined
  );
  // If a new propBatchId arrives (new upload), update the ref
  if (propBatchId && propBatchId !== batchIdRef.current) {
    batchIdRef.current = propBatchId;
  }

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hideBanner = useCallback(() => {
    stopPolling();
    clearPipelineFlag(workspaceId);
    batchIdRef.current = undefined;
    setVisible(false);
  }, [workspaceId, stopPolling]);

  const poll = useCallback(async () => {
    try {
      let s: PipelineStatus;
      const batchId = batchIdRef.current;

      if (batchId) {
        const r = await apiClient.feedback.getBatchStatus(workspaceId, batchId);
        s = { isRunning: r.isRunning, stage: r.stage, total: r.total,
               completed: r.completed, failed: r.failed, pending: r.pending,
               pct: r.pct, batchId: r.batchId };
      } else {
        s = await apiClient.feedback.getPipelineStatus(workspaceId) as PipelineStatus;
      }

      setStatus(s);

      const isIdle = s.stage === 'IDLE' || (s.total === 0 && !s.isRunning);
      const isDone = s.stage === 'COMPLETED' || s.stage === 'FAILED';
      const active = !isIdle && !isDone && (s.isRunning || s.stage === 'QUEUED' || s.stage === 'UPLOADED');

      if (isIdle) {
        // Backend says nothing is running — hide immediately and clear the flag.
        // PRIMARY FIX for the ghost-pipeline bug.
        hideBanner();
      } else if (active) {
        setVisible(true);
        try { localStorage.setItem(LS_RUNNING_KEY(workspaceId), String(Date.now())); } catch { /* ignore */ }
      } else if (isDone) {
        stopPolling();
        clearPipelineFlag(workspaceId);
        batchIdRef.current = undefined;
        if (visible) {
          setTimeout(() => {
            setVisible(false);
            onCompleteRef.current?.();
          }, 2_500);
        } else {
          onCompleteRef.current?.();
        }
      }
    } catch {
      // Network error — keep polling silently
    }
  }, [workspaceId, visible, stopPolling, hideBanner]);

  /** Dismiss handler: calls backend reset then hides the banner */
  const handleDismiss = useCallback(async () => {
    setDismissing(true);
    try {
      await apiClient.feedback.resetPipelineStatus(workspaceId);
    } catch { /* ignore — still hide */ }
    hideBanner();
    setDismissing(false);
  }, [workspaceId, hideBanner]);

  useEffect(() => {
    // Show banner immediately only if the localStorage flag is fresh (< 30 min)
    if (hasFreshPipelineFlag(workspaceId)) {
      setVisible(true);
    }

    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, propBatchId]); // re-run only when workspaceId or a NEW propBatchId arrives

  if (!visible || !status) return null;

  const pct        = status.pct ?? 0;
  const stage      = status.stage ?? 'QUEUED';
  const stageLabel = STAGE_LABELS[stage] ?? stage;
  const eta        = status.estimatedSecondsLeft ?? null;
  const etaLabel   = eta === null ? '' : eta < 60 ? `~${eta}s remaining` : `~${Math.ceil(eta / 60)}m remaining`;

  const isCompleted = stage === 'COMPLETED';
  const isFailed    = stage === 'FAILED';
  const barColor    = isCompleted ? '#2e7d32' : isFailed ? '#c62828' : 'linear-gradient(90deg, #20A4A4, #1a73e8)';
  const bgColor     = isCompleted ? '#e8f5e9' : isFailed ? '#ffebee' : '#e3f2fd';
  const borderColor = isCompleted ? '#a5d6a7' : isFailed ? '#ef9a9a' : '#90caf9';

  return (
    <div
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: '0.75rem',
        padding: '1rem 1.25rem',
        marginBottom: '1.5rem',
        position: 'relative',
      }}
      aria-live="polite"
      aria-label="AI pipeline processing"
    >
      {/* Dismiss / close button */}
      <button
        onClick={handleDismiss}
        disabled={dismissing}
        title="Dismiss pipeline banner"
        style={{
          position: 'absolute',
          top: '0.6rem',
          right: '0.75rem',
          background: 'transparent',
          border: 'none',
          cursor: dismissing ? 'not-allowed' : 'pointer',
          fontSize: '1.1rem',
          color: '#546e7a',
          lineHeight: 1,
          padding: '0.1rem 0.3rem',
          borderRadius: '4px',
        }}
        aria-label="Dismiss pipeline banner"
      >
        ×
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem', paddingRight: '1.5rem' }}>
        {isCompleted ? (
          <span style={{ fontSize: '1.25rem' }}>✅</span>
        ) : isFailed ? (
          <span style={{ fontSize: '1.25rem' }}>⚠️</span>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20"
            style={{ animation: 'spin 1.2s linear infinite', flexShrink: 0 }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <circle cx="10" cy="10" r="8" fill="none" stroke="#90caf9" strokeWidth="2.5" />
            <path d="M10 2 a8 8 0 0 1 8 8" fill="none" stroke="#1a73e8"
              strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        )}

        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0a2540' }}>
            {isCompleted ? 'AI Analysis Complete' : isFailed ? 'AI Pipeline — Some Items Failed' : 'AI Pipeline Running'}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#546e7a', marginTop: '0.1rem' }}>
            {stageLabel}
            {status.total > 0 && !isCompleted && (
              <> — <strong>{status.completed}</strong> / <strong>{status.total}</strong> items</>
            )}
            {etaLabel && !isCompleted && <> · {etaLabel}</>}
          </div>
        </div>

        {!isCompleted && (
          <span style={{
            fontSize: '0.8rem', fontWeight: 700, color: '#1a73e8',
            background: '#fff', border: '1px solid #90caf9',
            borderRadius: '999px', padding: '0.15rem 0.6rem', flexShrink: 0,
          }}>
            {pct}%
          </span>
        )}
      </div>

      {!isCompleted && (
        <div style={{ background: '#fff', borderRadius: '999px', height: '6px', overflow: 'hidden' }}>
          <div style={{
            background: barColor, height: '100%', width: `${pct}%`,
            borderRadius: '999px', transition: 'width 0.6s ease',
          }} />
        </div>
      )}

      {status.failed > 0 && (
        <p style={{ fontSize: '0.75rem', color: '#c62828', margin: '0.5rem 0 0' }}>
          ⚠ {status.failed} item{status.failed > 1 ? 's' : ''} failed — retrying automatically.
        </p>
      )}
    </div>
  );
}

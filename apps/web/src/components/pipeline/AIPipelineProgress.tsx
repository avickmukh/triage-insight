'use client';

/**
 * AIPipelineProgress
 *
 * Inline dashboard banner — NOT a full-page overlay.
 *
 * When a `batchId` is provided (set after a CSV upload), polls:
 *   GET /workspaces/:id/imports/:batchId/status
 * This returns total = rows in THIS upload (e.g. 50), not workspace history.
 *
 * When no `batchId` is provided, falls back to the workspace-level endpoint:
 *   GET /workspaces/:id/feedback/pipeline-status
 *
 * ── Key fix (v3) ─────────────────────────────────────────────────────────────
 * The batchId is captured in a ref at mount time so that clearing localStorage
 * does NOT cause effectiveBatchId to change, which previously re-triggered the
 * useEffect and restarted polling against the workspace endpoint after the
 * batch was already COMPLETED.
 *
 * Polling stops permanently once stage = COMPLETED or FAILED. The banner
 * auto-dismisses 2.5 s after completion.
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

const LS_RUNNING_KEY = (workspaceId: string) => `pipelineRunning_${workspaceId}`;
const LS_BATCH_KEY   = (workspaceId: string) => `pipelineBatchId_${workspaceId}`;
const POLL_INTERVAL_MS = 3000;

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

function hasPipelineFlag(workspaceId: string): boolean {
  try { return !!localStorage.getItem(LS_RUNNING_KEY(workspaceId)); }
  catch { return false; }
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
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [visible, setVisible] = useState(false);

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

      const isDone = s.stage === 'COMPLETED' || s.stage === 'FAILED';
      const active = !isDone && (s.isRunning || s.stage === 'QUEUED' || s.stage === 'UPLOADED');

      if (active) {
        setVisible(true);
        // Refresh LS timestamp but do NOT call markPipelineStarted here —
        // that would re-write the batchId key we might be about to clear.
        try { localStorage.setItem(LS_RUNNING_KEY(workspaceId), String(Date.now())); } catch { /* ignore */ }
      } else if (isDone) {
        // Pipeline finished — stop polling immediately
        stopPolling();
        clearPipelineFlag(workspaceId);
        batchIdRef.current = undefined; // prevent any future re-use

        if (visible) {
          // Brief delay so user sees 100% / "complete" state before banner hides
          setTimeout(() => {
            setVisible(false);
            onCompleteRef.current?.();
          }, 2500);
        } else {
          onCompleteRef.current?.();
        }
      }
    } catch {
      // Network error — keep polling silently
    }
  }, [workspaceId, visible, stopPolling]);

  useEffect(() => {
    // Show banner immediately if localStorage flag is set (fast-path)
    if (hasPipelineFlag(workspaceId)) {
      setVisible(true);
    }

    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, propBatchId]); // re-run only when workspaceId or a NEW propBatchId arrives

  if (!visible || !status) return null;

  const pct       = status.pct;
  const stage     = status.stage ?? 'QUEUED';
  const stageLabel = STAGE_LABELS[stage] ?? stage;
  const eta       = status.estimatedSecondsLeft ?? null;
  const etaLabel  = eta === null ? '' : eta < 60 ? `~${eta}s remaining` : `~${Math.ceil(eta / 60)}m remaining`;

  const isCompleted = stage === 'COMPLETED';
  const isFailed    = stage === 'FAILED';
  const barColor    = isCompleted ? '#2e7d32' : isFailed ? '#c62828' : 'linear-gradient(90deg, #20A4A4, #1a73e8)';

  return (
    <div
      style={{
        background: isCompleted ? '#e8f5e9' : isFailed ? '#ffebee' : '#e3f2fd',
        border: `1px solid ${isCompleted ? '#a5d6a7' : isFailed ? '#ef9a9a' : '#90caf9'}`,
        borderRadius: '0.75rem',
        padding: '1rem 1.25rem',
        marginBottom: '1.5rem',
      }}
      aria-live="polite"
      aria-label="AI pipeline processing"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
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
            {isCompleted ? 'AI Analysis Complete' : 'AI Pipeline Running'}
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

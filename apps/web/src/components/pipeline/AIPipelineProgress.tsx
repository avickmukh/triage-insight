'use client';

/**
 * AIPipelineProgress
 *
 * Inline dashboard banner — NOT a full-page overlay.
 *
 * When a `batchId` is provided (set after a CSV upload), polls:
 *   GET /workspaces/:id/imports/:batchId/status
 * This returns total = rows in THIS upload (e.g. 50), not workspace history (2307).
 *
 * When no `batchId` is provided, falls back to the workspace-level endpoint:
 *   GET /workspaces/:id/feedback/pipeline-status
 *
 * Persistence across tab close / re-login:
 *   - batchId is stored in localStorage so the correct endpoint is polled on re-login.
 *   - When the pipeline finishes (stage = COMPLETED | FAILED), localStorage is cleared.
 *   - Callers should call `markPipelineStarted(workspaceId, batchId)` immediately after
 *     triggering an import to show the banner without waiting for the first poll.
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

/** Human-readable label for each pipeline stage. */
const STAGE_LABELS: Record<string, string> = {
  IDLE:       'Idle',
  UPLOADED:   'Upload complete — queuing for analysis…',
  QUEUED:     'Queued — waiting to start…',
  ANALYZING:  'Analysing feedback — generating embeddings & summaries…',
  CLUSTERING: 'Clustering — grouping similar feedback into themes…',
  COMPLETED:  'Analysis complete ✓',
  FAILED:     'Some items failed — retrying automatically…',
};

/**
 * Call this immediately after triggering a CSV import or reprocess.
 * Stores the batchId (if provided) so polling survives tab close / re-login.
 */
export function markPipelineStarted(workspaceId: string, batchId?: string) {
  try {
    localStorage.setItem(LS_RUNNING_KEY(workspaceId), String(Date.now()));
    if (batchId) {
      localStorage.setItem(LS_BATCH_KEY(workspaceId), batchId);
    }
  } catch {
    // localStorage unavailable (SSR, private mode) — silently ignore
  }
}

function clearPipelineFlag(workspaceId: string) {
  try {
    localStorage.removeItem(LS_RUNNING_KEY(workspaceId));
    localStorage.removeItem(LS_BATCH_KEY(workspaceId));
  } catch {
    // ignore
  }
}

function hasPipelineFlag(workspaceId: string): boolean {
  try {
    return !!localStorage.getItem(LS_RUNNING_KEY(workspaceId));
  } catch {
    return false;
  }
}

function getStoredBatchId(workspaceId: string): string | null {
  try {
    return localStorage.getItem(LS_BATCH_KEY(workspaceId));
  } catch {
    return null;
  }
}

interface Props {
  workspaceId: string;
  /** batchId returned by the CSV import endpoint — scopes progress to this upload. */
  batchId?: string;
  /** Called when the pipeline transitions from running → done. */
  onComplete?: () => void;
}

export function AIPipelineProgress({ workspaceId, batchId: propBatchId, onComplete }: Props) {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Resolve effective batchId: prop takes priority, then localStorage
  const effectiveBatchId = propBatchId ?? getStoredBatchId(workspaceId) ?? undefined;

  const poll = useCallback(async () => {
    try {
      let s: PipelineStatus;

      if (effectiveBatchId) {
        // Batch-scoped endpoint: total = rows in this upload (e.g. 50, NOT 2307)
        const batchStatus = await apiClient.feedback.getBatchStatus(workspaceId, effectiveBatchId);
        s = {
          isRunning: batchStatus.isRunning,
          stage:     batchStatus.stage,
          total:     batchStatus.total,
          completed: batchStatus.completed,
          failed:    batchStatus.failed,
          pending:   batchStatus.pending,
          pct:       batchStatus.pct,
          batchId:   batchStatus.batchId,
        };
      } else {
        // Workspace-level fallback (used when no batchId is available)
        s = await apiClient.feedback.getPipelineStatus(workspaceId) as PipelineStatus;
      }

      setStatus(s);

      const active = s.isRunning || s.stage === 'QUEUED' || s.stage === 'UPLOADED';

      if (active) {
        setVisible(true);
        markPipelineStarted(workspaceId, effectiveBatchId); // refresh the LS timestamp
      } else {
        // Pipeline finished (COMPLETED or FAILED)
        if (visible) {
          // Brief delay so user sees 100% / "complete" state
          setTimeout(() => {
            setVisible(false);
            clearPipelineFlag(workspaceId);
            onCompleteRef.current?.();
          }, 2500);
        } else {
          clearPipelineFlag(workspaceId);
        }
        // Stop polling
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    } catch {
      // Network error — keep polling silently
    }
  }, [workspaceId, effectiveBatchId, visible]);

  useEffect(() => {
    // On mount: show banner immediately if localStorage flag is set
    // (fast-path before first poll resolves)
    if (hasPipelineFlag(workspaceId)) {
      setVisible(true);
    }

    // Start polling immediately, then every 3 seconds
    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, effectiveBatchId]);

  if (!visible || !status) return null;

  const pct = status.pct;
  const stage = status.stage ?? 'QUEUED';
  const stageLabel = STAGE_LABELS[stage] ?? stage;
  const eta = status.estimatedSecondsLeft ?? null;
  const etaLabel =
    eta === null
      ? ''
      : eta < 60
      ? `~${eta}s remaining`
      : `~${Math.ceil(eta / 60)}m remaining`;

  const isCompleted = stage === 'COMPLETED';
  const isFailed = stage === 'FAILED';
  const barColor = isCompleted
    ? '#2e7d32'
    : isFailed
    ? '#c62828'
    : 'linear-gradient(90deg, #20A4A4, #1a73e8)';

  return (
    /* Inline dashboard banner — not a blocking overlay */
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
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
        {/* Spinner or check icon */}
        {isCompleted ? (
          <span style={{ fontSize: '1.25rem' }}>✅</span>
        ) : isFailed ? (
          <span style={{ fontSize: '1.25rem' }}>⚠️</span>
        ) : (
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            style={{ animation: 'spin 1.2s linear infinite', flexShrink: 0 }}
          >
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <circle cx="10" cy="10" r="8" fill="none" stroke="#90caf9" strokeWidth="2.5" />
            <path
              d="M10 2 a8 8 0 0 1 8 8"
              fill="none"
              stroke="#1a73e8"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
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

        {/* Percentage badge */}
        {!isCompleted && (
          <span
            style={{
              fontSize: '0.8rem',
              fontWeight: 700,
              color: '#1a73e8',
              background: '#fff',
              border: '1px solid #90caf9',
              borderRadius: '999px',
              padding: '0.15rem 0.6rem',
              flexShrink: 0,
            }}
          >
            {pct}%
          </span>
        )}
      </div>

      {/* Progress bar */}
      {!isCompleted && (
        <div
          style={{
            background: '#fff',
            borderRadius: '999px',
            height: '6px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              background: barColor,
              height: '100%',
              width: `${pct}%`,
              borderRadius: '999px',
              transition: 'width 0.6s ease',
            }}
          />
        </div>
      )}

      {/* Failed items warning */}
      {status.failed > 0 && (
        <p style={{ fontSize: '0.75rem', color: '#c62828', margin: '0.5rem 0 0' }}>
          ⚠ {status.failed} item{status.failed > 1 ? 's' : ''} failed — retrying automatically.
        </p>
      )}
    </div>
  );
}

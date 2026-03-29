'use client';

/**
 * AIPipelineProgress
 *
 * Polls GET /workspaces/:id/feedback/pipeline-status every 3 seconds.
 * While the pipeline is running it renders a full-page blocking overlay
 * with a progress bar and estimated time remaining.
 *
 * Persistence across tab close / re-login:
 *   - On mount, checks localStorage for a "pipelineRunning_<workspaceId>" key.
 *   - If found, immediately shows the overlay and starts polling.
 *   - When the pipeline finishes (isRunning = false), clears the key.
 *   - When a new import triggers the pipeline, callers should call
 *     `markPipelineStarted(workspaceId)` (exported helper) to set the key.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import apiClient from '@/lib/api-client';

export interface PipelineStatus {
  isRunning: boolean;
  total: number;
  completed: number;
  failed: number;
  pending: number;
  pct: number;
  estimatedSecondsLeft: number | null;
}

const LS_KEY = (workspaceId: string) => `pipelineRunning_${workspaceId}`;
const POLL_INTERVAL_MS = 3000;

/** Call this immediately after triggering a CSV import or reprocess. */
export function markPipelineStarted(workspaceId: string) {
  try {
    localStorage.setItem(LS_KEY(workspaceId), String(Date.now()));
  } catch {
    // localStorage unavailable (SSR, private mode) — silently ignore
  }
}

function clearPipelineFlag(workspaceId: string) {
  try {
    localStorage.removeItem(LS_KEY(workspaceId));
  } catch {
    // ignore
  }
}

function hasPipelineFlag(workspaceId: string): boolean {
  try {
    return !!localStorage.getItem(LS_KEY(workspaceId));
  } catch {
    return false;
  }
}

interface Props {
  workspaceId: string;
  /** Called when the pipeline transitions from running → done. */
  onComplete?: () => void;
}

export function AIPipelineProgress({ workspaceId, onComplete }: Props) {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const poll = useCallback(async () => {
    try {
      const s = await apiClient.feedback.getPipelineStatus(workspaceId);
      setStatus(s);

      if (s.isRunning) {
        setVisible(true);
        markPipelineStarted(workspaceId); // refresh the LS timestamp
      } else {
        // Pipeline finished
        if (visible) {
          // Brief delay so user sees 100%
          setTimeout(() => {
            setVisible(false);
            clearPipelineFlag(workspaceId);
            onCompleteRef.current?.();
          }, 1200);
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
  }, [workspaceId, visible]);

  useEffect(() => {
    // On mount: check if a pipeline was running before the tab was closed
    const shouldShow = hasPipelineFlag(workspaceId);
    if (shouldShow) {
      setVisible(true);
    }

    // Start polling immediately, then every 3 seconds
    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  if (!visible || !status) return null;

  const pct = status.pct;
  const eta = status.estimatedSecondsLeft;
  const etaLabel =
    eta === null
      ? ''
      : eta < 60
      ? `~${eta}s remaining`
      : `~${Math.ceil(eta / 60)}m remaining`;

  return (
    /* Full-page blocking overlay */
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(10, 37, 64, 0.72)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      aria-live="polite"
      aria-label="AI pipeline processing"
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '1rem',
          padding: '2.5rem 3rem',
          maxWidth: '480px',
          width: '90%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          textAlign: 'center',
        }}
      >
        {/* Spinner */}
        <div style={{ marginBottom: '1.25rem' }}>
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            style={{ animation: 'spin 1.2s linear infinite', display: 'inline-block' }}
          >
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="#e9ecef"
              strokeWidth="4"
            />
            <path
              d="M24 4 a20 20 0 0 1 20 20"
              fill="none"
              stroke="#20A4A4"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0a2540', margin: '0 0 0.4rem' }}>
          AI Pipeline Running
        </h2>
        <p style={{ fontSize: '0.875rem', color: '#6C757D', margin: '0 0 1.5rem' }}>
          Analysing feedback — generating embeddings, detecting themes, and computing CIQ scores.
          {status.total > 0 && (
            <> Processing <strong>{status.completed}</strong> of <strong>{status.total}</strong> items.</>
          )}
        </p>

        {/* Progress bar */}
        <div
          style={{
            background: '#e9ecef',
            borderRadius: '999px',
            height: '10px',
            overflow: 'hidden',
            marginBottom: '0.6rem',
          }}
        >
          <div
            style={{
              background: 'linear-gradient(90deg, #20A4A4, #1a73e8)',
              height: '100%',
              width: `${pct}%`,
              borderRadius: '999px',
              transition: 'width 0.6s ease',
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.78rem',
            color: '#6C757D',
          }}
        >
          <span>{pct}% complete</span>
          {etaLabel && <span>{etaLabel}</span>}
        </div>

        {status.failed > 0 && (
          <p style={{ fontSize: '0.75rem', color: '#c62828', marginTop: '0.75rem' }}>
            {status.failed} item{status.failed > 1 ? 's' : ''} failed — they will be retried automatically.
          </p>
        )}

        <p style={{ fontSize: '0.72rem', color: '#adb5bd', marginTop: '1.25rem' }}>
          You can close this tab — progress will resume when you return.
        </p>
      </div>
    </div>
  );
}

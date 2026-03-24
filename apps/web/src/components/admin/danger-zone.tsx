'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

interface DangerZoneProps {
  workspaceId: string;
  workspaceName: string;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  REQUESTED: { label: 'Pending Approval', color: '#f59e0b' },
  APPROVED: { label: 'Approved', color: '#3b82f6' },
  SCHEDULED: { label: 'Scheduled', color: '#8b5cf6' },
  IN_PROGRESS: { label: 'In Progress', color: '#f97316' },
  COMPLETED: { label: 'Completed', color: '#10b981' },
  FAILED: { label: 'Failed', color: '#ef4444' },
  CANCELLED: { label: 'Cancelled', color: '#6b7280' },
};

export function DangerZone({ workspaceId, workspaceName }: DangerZoneProps) {
  const qc = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [error, setError] = useState('');

  const { data: requests } = useQuery({
    queryKey: ['purge-requests', workspaceId],
    queryFn: () => apiClient.purge.listRequests(workspaceId),
  });

  const requestList = Array.isArray(requests) ? requests : [];
  const activeRequest = requestList.find((r: any) =>
    !['COMPLETED', 'CANCELLED'].includes(r.status),
  );

  const requestMutation = useMutation({
    mutationFn: () =>
      apiClient.purge.requestDeletion(workspaceId, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purge-requests', workspaceId] });
      setShowConfirm(false);
      setReason('');
      setConfirmName('');
      setError('');
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message ?? 'Failed to submit deletion request.');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (requestId: string) =>
      apiClient.purge.cancelRequest(workspaceId, requestId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purge-requests', workspaceId] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message ?? 'Failed to cancel request.');
    },
  });

  const canSubmit = confirmName === workspaceName && reason.length >= 10;

  return (
    <div
      style={{
        background: '#fff',
        border: '1.5px solid #ef4444',
        borderRadius: '0.875rem',
        padding: '1.5rem',
        marginTop: '2rem',
      }}
    >
      <h2
        style={{
          fontSize: '1rem',
          fontWeight: 700,
          color: '#ef4444',
          marginBottom: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        ⚠ Danger Zone
      </h2>
      <p style={{ fontSize: '0.85rem', color: '#6C757D', marginBottom: '1.25rem' }}>
        Actions in this section are irreversible. Deleting this workspace will permanently
        remove all feedback, themes, customers, surveys, roadmap items, voice recordings,
        and all other data associated with it. This action cannot be undone.
      </p>

      {/* Active request status */}
      {activeRequest && (
        <div
          style={{
            background: '#fef9f0',
            border: '1px solid #f59e0b',
            borderRadius: '0.6rem',
            padding: '1rem',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0A2540', margin: 0 }}>
                Deletion Request Active
              </p>
              <p style={{ fontSize: '0.8rem', color: '#6C757D', margin: '0.25rem 0 0' }}>
                Submitted {new Date(activeRequest.requestedAt).toLocaleDateString()} ·{' '}
                <span
                  style={{
                    fontWeight: 700,
                    color: STATUS_LABEL[activeRequest.status]?.color ?? '#6b7280',
                  }}
                >
                  {STATUS_LABEL[activeRequest.status]?.label ?? activeRequest.status}
                </span>
              </p>
              {activeRequest.reason && (
                <p style={{ fontSize: '0.78rem', color: '#6C757D', margin: '0.2rem 0 0', fontStyle: 'italic' }}>
                  Reason: {activeRequest.reason}
                </p>
              )}
            </div>
            {['REQUESTED', 'APPROVED', 'SCHEDULED'].includes(activeRequest.status) && (
              <button
                onClick={() => cancelMutation.mutate(activeRequest.id)}
                disabled={cancelMutation.isPending}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.4rem',
                  border: '1px solid #ef4444',
                  background: '#fff',
                  color: '#ef4444',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  cursor: cancelMutation.isPending ? 'not-allowed' : 'pointer',
                  opacity: cancelMutation.isPending ? 0.6 : 1,
                }}
              >
                {cancelMutation.isPending ? 'Cancelling…' : 'Cancel Request'}
              </button>
            )}
          </div>
          {/* Audit log steps */}
          {activeRequest.auditLogs && activeRequest.auditLogs.length > 0 && (
            <div style={{ marginTop: '0.75rem', borderTop: '1px solid #f0e0c0', paddingTop: '0.75rem' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6C757D', marginBottom: '0.4rem' }}>
                PURGE STEPS
              </p>
              {activeRequest.auditLogs.map((log: any) => (
                <div
                  key={log.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.78rem',
                    color: '#0A2540',
                    marginBottom: '0.2rem',
                  }}
                >
                  <span>{log.status === 'SUCCESS' ? '✓' : log.status === 'FAILED' ? '✗' : '○'}</span>
                  <span style={{ fontWeight: 600 }}>{log.stepName}</span>
                  <span style={{ color: '#6C757D' }}>
                    {log.status === 'SUCCESS' ? 'Completed' : log.status === 'FAILED' ? `Failed: ${log.errorMessage}` : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Request deletion button */}
      {!activeRequest && !showConfirm && (
        <button
          onClick={() => setShowConfirm(true)}
          style={{
            padding: '0.65rem 1.5rem',
            borderRadius: '0.5rem',
            border: '1.5px solid #ef4444',
            background: '#fff',
            color: '#ef4444',
            fontWeight: 700,
            fontSize: '0.88rem',
            cursor: 'pointer',
          }}
        >
          Request Workspace Deletion
        </button>
      )}

      {/* Confirmation form */}
      {showConfirm && !activeRequest && (
        <div
          style={{
            background: '#fff5f5',
            border: '1px solid #fecaca',
            borderRadius: '0.6rem',
            padding: '1.25rem',
          }}
        >
          <p style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0A2540', marginBottom: '0.75rem' }}>
            Confirm Workspace Deletion Request
          </p>
          <p style={{ fontSize: '0.82rem', color: '#6C757D', marginBottom: '1rem' }}>
            This will submit a deletion request to the platform admin team. Your workspace will
            remain active until a platform admin approves and executes the purge. You can cancel
            the request at any time before execution begins.
          </p>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#6C757D', marginBottom: '0.35rem' }}>
              REASON FOR DELETION
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Please provide a reason (minimum 10 characters)"
              rows={3}
              style={{
                width: '100%',
                padding: '0.65rem 0.9rem',
                borderRadius: '0.5rem',
                border: '1px solid #dee2e6',
                fontSize: '0.88rem',
                color: '#0A2540',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#6C757D', marginBottom: '0.35rem' }}>
              TYPE WORKSPACE NAME TO CONFIRM: <strong style={{ color: '#ef4444' }}>{workspaceName}</strong>
            </label>
            <input
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={workspaceName}
              style={{
                width: '100%',
                padding: '0.65rem 0.9rem',
                borderRadius: '0.5rem',
                border: `1px solid ${confirmName === workspaceName ? '#10b981' : '#dee2e6'}`,
                fontSize: '0.88rem',
                color: '#0A2540',
                boxSizing: 'border-box',
              }}
            />
          </div>
          {error && (
            <p style={{ fontSize: '0.82rem', color: '#ef4444', marginBottom: '0.75rem' }}>{error}</p>
          )}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => requestMutation.mutate()}
              disabled={!canSubmit || requestMutation.isPending}
              style={{
                padding: '0.65rem 1.5rem',
                borderRadius: '0.5rem',
                border: 'none',
                background: canSubmit && !requestMutation.isPending ? '#ef4444' : '#fca5a5',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: canSubmit && !requestMutation.isPending ? 'pointer' : 'not-allowed',
              }}
            >
              {requestMutation.isPending ? 'Submitting…' : 'Submit Deletion Request'}
            </button>
            <button
              onClick={() => { setShowConfirm(false); setReason(''); setConfirmName(''); setError(''); }}
              style={{
                padding: '0.65rem 1.5rem',
                borderRadius: '0.5rem',
                border: '1px solid #dee2e6',
                background: '#fff',
                color: '#6C757D',
                fontWeight: 600,
                fontSize: '0.88rem',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

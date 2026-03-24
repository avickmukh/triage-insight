'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

// ── Design tokens ─────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
};

const BADGE_BASE: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.2rem 0.6rem',
  borderRadius: '999px',
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
};

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  REQUESTED:   { ...BADGE_BASE, background: '#fef3c7', color: '#92400e' },
  APPROVED:    { ...BADGE_BASE, background: '#dbeafe', color: '#1e40af' },
  SCHEDULED:   { ...BADGE_BASE, background: '#ede9fe', color: '#5b21b6' },
  IN_PROGRESS: { ...BADGE_BASE, background: '#ffedd5', color: '#9a3412' },
  COMPLETED:   { ...BADGE_BASE, background: '#d1fae5', color: '#065f46' },
  FAILED:      { ...BADGE_BASE, background: '#fee2e2', color: '#991b1b' },
  CANCELLED:   { ...BADGE_BASE, background: '#f3f4f6', color: '#374151' },
};

const BTN_DANGER: React.CSSProperties = {
  padding: '0.5rem 1rem',
  borderRadius: '0.4rem',
  border: 'none',
  background: '#ef4444',
  color: '#fff',
  fontWeight: 700,
  fontSize: '0.8rem',
  cursor: 'pointer',
};

const BTN_APPROVE: React.CSSProperties = {
  padding: '0.5rem 1rem',
  borderRadius: '0.4rem',
  border: 'none',
  background: '#3b82f6',
  color: '#fff',
  fontWeight: 700,
  fontSize: '0.8rem',
  cursor: 'pointer',
};

const BTN_GHOST: React.CSSProperties = {
  padding: '0.5rem 1rem',
  borderRadius: '0.4rem',
  border: '1px solid #dee2e6',
  background: '#fff',
  color: '#6C757D',
  fontWeight: 600,
  fontSize: '0.8rem',
  cursor: 'pointer',
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function PurgeManagementPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const { data: requests, isLoading } = useQuery({
    queryKey: ['platform', 'purge-requests'],
    queryFn: () => apiClient.platform.listPurgeRequests(),
    refetchInterval: 15_000, // poll every 15s for in-progress purges
  });

  const requestList: any[] = Array.isArray(requests) ? requests : [];
  const selected = requestList.find((r) => r.id === selectedId) ?? null;

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiClient.platform.approvePurgeRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform', 'purge-requests'] });
      setActionSuccess('Request approved. It will execute after the cooling-off period.');
      setActionError('');
    },
    onError: (err: any) => {
      setActionError(err?.response?.data?.message ?? 'Failed to approve request.');
    },
  });

  const executeMutation = useMutation({
    mutationFn: (id: string) => apiClient.platform.executePurge(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform', 'purge-requests'] });
      setActionSuccess('Purge job enqueued. Monitor the audit log for step-by-step progress.');
      setActionError('');
    },
    onError: (err: any) => {
      setActionError(err?.response?.data?.message ?? 'Failed to execute purge.');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiClient.platform.cancelPurgeRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform', 'purge-requests'] });
      setActionSuccess('Request cancelled.');
      setActionError('');
    },
    onError: (err: any) => {
      setActionError(err?.response?.data?.message ?? 'Failed to cancel request.');
    },
  });

  const clearMessages = () => { setActionError(''); setActionSuccess(''); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0A2540', marginBottom: '0.25rem' }}>
          Workspace Purge Management
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#6C757D' }}>
          Review, approve, and execute workspace deletion requests. All actions are logged in the
          audit trail. A purge permanently removes all workspace data including S3 files, database
          records, and embeddings.
        </p>
      </div>

      {/* Action feedback */}
      {actionSuccess && (
        <div style={{ background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: '0.5rem', padding: '0.75rem 1rem', fontSize: '0.88rem', color: '#065f46', display: 'flex', justifyContent: 'space-between' }}>
          <span>✓ {actionSuccess}</span>
          <button onClick={() => setActionSuccess('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065f46', fontWeight: 700 }}>×</button>
        </div>
      )}
      {actionError && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '0.5rem', padding: '0.75rem 1rem', fontSize: '0.88rem', color: '#991b1b', display: 'flex', justifyContent: 'space-between' }}>
          <span>⚠ {actionError}</span>
          <button onClick={() => setActionError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>×</button>
        </div>
      )}

      {/* Two-panel layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '1.5rem', alignItems: 'flex-start' }}>

        {/* Left: request list */}
        <div style={CARD}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0A2540', marginBottom: '1rem' }}>
            Deletion Requests
          </h2>
          {isLoading && (
            <p style={{ fontSize: '0.85rem', color: '#6C757D' }}>Loading…</p>
          )}
          {!isLoading && requestList.length === 0 && (
            <p style={{ fontSize: '0.85rem', color: '#6C757D' }}>No deletion requests yet.</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {requestList.map((req) => (
              <button
                key={req.id}
                onClick={() => { setSelectedId(req.id); clearMessages(); }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.3rem',
                  padding: '0.875rem 1rem',
                  borderRadius: '0.6rem',
                  border: `1.5px solid ${selectedId === req.id ? '#3b82f6' : '#e9ecef'}`,
                  background: selectedId === req.id ? '#eff6ff' : '#fff',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0A2540' }}>
                    {req.workspace?.name ?? req.workspaceId}
                  </span>
                  <span style={STATUS_STYLE[req.status] ?? BADGE_BASE}>{req.status}</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#6C757D' }}>
                  Requested {new Date(req.requestedAt).toLocaleDateString()} by {req.requestedBy?.email ?? 'unknown'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Right: detail panel */}
        <div style={CARD}>
          {!selected ? (
            <p style={{ fontSize: '0.85rem', color: '#6C757D' }}>
              Select a request from the list to review it.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Title */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0A2540', margin: 0 }}>
                    {selected.workspace?.name ?? selected.workspaceId}
                  </h2>
                  <span style={STATUS_STYLE[selected.status] ?? BADGE_BASE}>{selected.status}</span>
                </div>
                <p style={{ fontSize: '0.78rem', color: '#6C757D', margin: 0 }}>
                  Workspace ID: <code style={{ fontSize: '0.75rem' }}>{selected.workspaceId}</code>
                </p>
              </div>

              {/* Meta */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {[
                  { label: 'Requested by', value: selected.requestedBy?.email ?? '—' },
                  { label: 'Requested at', value: new Date(selected.requestedAt).toLocaleString() },
                  { label: 'Approved by', value: selected.approvedBy?.email ?? '—' },
                  { label: 'Approved at', value: selected.approvedAt ? new Date(selected.approvedAt).toLocaleString() : '—' },
                  { label: 'Scheduled for', value: selected.scheduledFor ? new Date(selected.scheduledFor).toLocaleString() : '—' },
                  { label: 'Completed at', value: selected.completedAt ? new Date(selected.completedAt).toLocaleString() : '—' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6C757D', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
                    <p style={{ fontSize: '0.85rem', color: '#0A2540', margin: '0.1rem 0 0', wordBreak: 'break-all' }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Reason */}
              {selected.reason && (
                <div style={{ background: '#f8f9fa', borderRadius: '0.5rem', padding: '0.75rem 1rem' }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6C757D', margin: '0 0 0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reason</p>
                  <p style={{ fontSize: '0.85rem', color: '#0A2540', margin: 0 }}>{selected.reason}</p>
                </div>
              )}

              {/* Audit steps */}
              {selected.auditLogs && selected.auditLogs.length > 0 && (
                <div>
                  <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6C757D', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Purge Steps</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {selected.auditLogs.map((log: any) => (
                      <div
                        key={log.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '0.6rem',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '0.4rem',
                          background: log.status === 'SUCCESS' ? '#f0fdf4' : log.status === 'FAILED' ? '#fef2f2' : '#f8f9fa',
                          border: `1px solid ${log.status === 'SUCCESS' ? '#bbf7d0' : log.status === 'FAILED' ? '#fecaca' : '#e9ecef'}`,
                        }}
                      >
                        <span style={{ fontSize: '0.85rem' }}>
                          {log.status === 'SUCCESS' ? '✓' : log.status === 'FAILED' ? '✗' : '○'}
                        </span>
                        <div>
                          <p style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0A2540', margin: 0 }}>{log.stepName}</p>
                          {log.errorMessage && (
                            <p style={{ fontSize: '0.75rem', color: '#991b1b', margin: '0.15rem 0 0' }}>{log.errorMessage}</p>
                          )}
                          {log.metadata && (
                            <p style={{ fontSize: '0.72rem', color: '#6C757D', margin: '0.1rem 0 0', fontFamily: 'monospace' }}>
                              {JSON.stringify(log.metadata)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', borderTop: '1px solid #e9ecef', paddingTop: '1rem' }}>
                {selected.status === 'REQUESTED' && (
                  <button
                    onClick={() => approveMutation.mutate(selected.id)}
                    disabled={approveMutation.isPending}
                    style={{ ...BTN_APPROVE, opacity: approveMutation.isPending ? 0.6 : 1, cursor: approveMutation.isPending ? 'not-allowed' : 'pointer' }}
                  >
                    {approveMutation.isPending ? 'Approving…' : '✓ Approve Request'}
                  </button>
                )}
                {selected.status === 'APPROVED' && (
                  <button
                    onClick={() => executeMutation.mutate(selected.id)}
                    disabled={executeMutation.isPending}
                    style={{ ...BTN_DANGER, opacity: executeMutation.isPending ? 0.6 : 1, cursor: executeMutation.isPending ? 'not-allowed' : 'pointer' }}
                  >
                    {executeMutation.isPending ? 'Executing…' : '⚠ Execute Purge Now'}
                  </button>
                )}
                {['REQUESTED', 'APPROVED', 'SCHEDULED'].includes(selected.status) && (
                  <button
                    onClick={() => cancelMutation.mutate(selected.id)}
                    disabled={cancelMutation.isPending}
                    style={{ ...BTN_GHOST, opacity: cancelMutation.isPending ? 0.6 : 1, cursor: cancelMutation.isPending ? 'not-allowed' : 'pointer' }}
                  >
                    {cancelMutation.isPending ? 'Cancelling…' : 'Cancel Request'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

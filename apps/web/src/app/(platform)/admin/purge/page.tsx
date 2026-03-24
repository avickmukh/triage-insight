'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { LoadingSpinner } from '@/components/shared/common/loading-spinner';
import { AlertTriangle, CheckCircle, XCircle, Clock, Play } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  REQUESTED:   'text-yellow-400 bg-yellow-400/10',
  APPROVED:    'text-blue-400 bg-blue-400/10',
  SCHEDULED:   'text-violet-400 bg-violet-400/10',
  IN_PROGRESS: 'text-orange-400 bg-orange-400/10',
  COMPLETED:   'text-green-400 bg-green-400/10',
  FAILED:      'text-red-400 bg-red-400/10',
  CANCELLED:   'text-gray-400 bg-gray-400/10',
};

const STEP_COLORS: Record<string, string> = {
  SUCCESS: 'bg-green-400/10 border-green-400/20 text-green-400',
  FAILED:  'bg-red-400/10 border-red-400/20 text-red-400',
  PENDING: 'bg-gray-800 border-gray-700 text-gray-400',
};

export default function PurgeManagementPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const { data: requests, isLoading } = useQuery({
    queryKey: ['platform', 'purge-requests'],
    queryFn: () => apiClient.platform.listPurgeRequests(),
    refetchInterval: 15_000,
  });

  const requestList: any[] = Array.isArray(requests) ? requests : [];
  const selected = requestList.find((r) => r.id === selectedId) ?? null;

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiClient.platform.approvePurgeRequest(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform', 'purge-requests'] }); setActionSuccess('Request approved. It will execute after the cooling-off period.'); setActionError(''); },
    onError: (err: any) => { setActionError(err?.response?.data?.message ?? 'Failed to approve request.'); },
  });

  const executeMutation = useMutation({
    mutationFn: (id: string) => apiClient.platform.executePurge(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform', 'purge-requests'] }); setActionSuccess('Purge job enqueued. Monitor the audit log for step-by-step progress.'); setActionError(''); },
    onError: (err: any) => { setActionError(err?.response?.data?.message ?? 'Failed to execute purge.'); },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiClient.platform.cancelPurgeRequest(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform', 'purge-requests'] }); setActionSuccess('Request cancelled.'); setActionError(''); },
    onError: (err: any) => { setActionError(err?.response?.data?.message ?? 'Failed to cancel request.'); },
  });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Workspace Purge Management</h1>
        <p className="text-sm text-gray-400 mt-1">
          Review, approve, and execute workspace deletion requests. All actions are logged in the audit trail.
          A purge permanently removes all workspace data including S3 files, database records, and embeddings.
        </p>
      </div>

      {actionSuccess && (
        <div className="flex items-center justify-between px-4 py-3 bg-green-400/10 border border-green-400/20 rounded-lg text-sm text-green-400">
          <span><CheckCircle className="inline h-4 w-4 mr-2" />{actionSuccess}</span>
          <button onClick={() => setActionSuccess('')} className="text-green-400/70 hover:text-green-400 ml-4">✕</button>
        </div>
      )}
      {actionError && (
        <div className="flex items-center justify-between px-4 py-3 bg-red-400/10 border border-red-400/20 rounded-lg text-sm text-red-400">
          <span><AlertTriangle className="inline h-4 w-4 mr-2" />{actionError}</span>
          <button onClick={() => setActionError('')} className="text-red-400/70 hover:text-red-400 ml-4">✕</button>
        </div>
      )}

      <div className="grid grid-cols-5 gap-6 items-start">
        {/* Left: request list */}
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">Deletion Requests</h2>
          {isLoading && <div className="flex justify-center py-4"><LoadingSpinner className="h-5 w-5 text-violet-400" /></div>}
          {!isLoading && requestList.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">No deletion requests yet.</p>
          )}
          <div className="space-y-2">
            {requestList.map((req) => (
              <button
                key={req.id}
                onClick={() => { setSelectedId(req.id); setActionError(''); setActionSuccess(''); }}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedId === req.id ? 'border-violet-500 bg-violet-600/10' : 'border-gray-800 bg-gray-800/50 hover:bg-gray-800'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm text-white truncate">{req.workspace?.name ?? req.workspaceId}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ml-2 shrink-0 ${STATUS_COLORS[req.status] ?? 'text-gray-400 bg-gray-400/10'}`}>{req.status}</span>
                </div>
                <p className="text-xs text-gray-500">
                  {new Date(req.requestedAt).toLocaleDateString()} · {req.requestedBy?.email ?? 'unknown'}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Right: detail panel */}
        <div className="col-span-3 bg-gray-900 border border-gray-800 rounded-lg p-6">
          {!selected ? (
            <p className="text-sm text-gray-500 text-center py-8">Select a request from the list to review it.</p>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-white">{selected.workspace?.name ?? selected.workspaceId}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[selected.status] ?? 'text-gray-400 bg-gray-400/10'}`}>{selected.status}</span>
              </div>
              <p className="text-xs text-gray-500 font-mono">ID: {selected.workspaceId}</p>

              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: 'Requested by', value: selected.requestedBy?.email ?? '—' },
                  { label: 'Requested at', value: new Date(selected.requestedAt).toLocaleString() },
                  { label: 'Approved by', value: selected.approvedBy?.email ?? '—' },
                  { label: 'Approved at', value: selected.approvedAt ? new Date(selected.approvedAt).toLocaleString() : '—' },
                  { label: 'Scheduled for', value: selected.scheduledFor ? new Date(selected.scheduledFor).toLocaleString() : '—' },
                  { label: 'Completed at', value: selected.completedAt ? new Date(selected.completedAt).toLocaleString() : '—' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
                    <p className="text-gray-200 mt-0.5 break-all">{value}</p>
                  </div>
                ))}
              </div>

              {selected.reason && (
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Reason</p>
                  <p className="text-sm text-gray-300">{selected.reason}</p>
                </div>
              )}

              {selected.auditLogs && selected.auditLogs.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Purge Steps</p>
                  <div className="space-y-1.5">
                    {selected.auditLogs.map((log: any) => (
                      <div key={log.id} className={`flex items-start gap-2 px-3 py-2 rounded border text-xs ${STEP_COLORS[log.status] ?? STEP_COLORS.PENDING}`}>
                        <span className="mt-0.5 shrink-0">
                          {log.status === 'SUCCESS' ? <CheckCircle className="h-3.5 w-3.5" /> : log.status === 'FAILED' ? <XCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                        </span>
                        <div>
                          <p className="font-medium">{log.stepName}</p>
                          {log.message && <p className="opacity-70 mt-0.5">{log.message}</p>}
                          {log.metadata && <p className="font-mono opacity-60 mt-0.5">{JSON.stringify(log.metadata)}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2 border-t border-gray-800">
                {selected.status === 'REQUESTED' && (
                  <button onClick={() => approveMutation.mutate(selected.id)} disabled={approveMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm rounded transition-colors">
                    <CheckCircle className="h-4 w-4" />{approveMutation.isPending ? 'Approving…' : 'Approve Request'}
                  </button>
                )}
                {selected.status === 'APPROVED' && (
                  <button onClick={() => executeMutation.mutate(selected.id)} disabled={executeMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-sm rounded transition-colors">
                    <Play className="h-4 w-4" />{executeMutation.isPending ? 'Executing…' : 'Execute Purge Now'}
                  </button>
                )}
                {['REQUESTED', 'APPROVED', 'SCHEDULED'].includes(selected.status) && (
                  <button onClick={() => cancelMutation.mutate(selected.id)} disabled={cancelMutation.isPending}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 text-sm rounded transition-colors">
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

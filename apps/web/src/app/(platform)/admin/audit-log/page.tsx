'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { LoadingSpinner } from '@/components/shared/common/loading-spinner';
import { Search } from 'lucide-react';

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [wsFilter, setWsFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['platform-audit-log', page, wsFilter],
    queryFn: () => apiClient.platform.listAuditLogs({ page, limit: 50, workspaceId: wsFilter || undefined }),
    staleTime: 15_000,
  });

  const logs = (data as any)?.logs ?? [];
  const total = (data as any)?.total ?? 0;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Platform Audit Log</h1>
        <p className="text-sm text-gray-400 mt-1">All platform admin actions are recorded here.</p>
      </div>
      <div className="flex gap-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input value={wsFilter} onChange={e => { setWsFilter(e.target.value); setPage(1); }} placeholder="Filter by workspace ID\u2026"
            className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 placeholder-gray-500 focus:outline-none focus:border-violet-500" />
        </div>
      </div>
      {isLoading ? <div className="flex justify-center py-12"><LoadingSpinner className="h-6 w-6 text-violet-400" /></div> : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-800">
                <th className="px-4 py-3 text-left">Time</th>
                <th className="px-4 py-3 text-left">Action</th>
                <th className="px-4 py-3 text-left">Actor</th>
                <th className="px-4 py-3 text-left">Workspace</th>
                <th className="px-4 py-3 text-left">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {logs.map((log: any) => (
                <tr key={log.id} className="hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3"><span className="font-mono text-xs bg-gray-800 text-violet-300 px-2 py-0.5 rounded">{log.action}</span></td>
                  <td className="px-4 py-3 text-gray-300 text-xs">{log.actor?.name ?? log.actorId ?? 'System'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{log.workspaceId ?? '\u2014'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs font-mono max-w-xs truncate">{log.details ? JSON.stringify(log.details) : '\u2014'}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No audit log entries found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {total > 50 && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>Page {page} of {Math.ceil(total / 50)}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700">Prev</button>
            <button onClick={() => setPage(p => p + 1)} disabled={page * 50 >= total} className="px-3 py-1 bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

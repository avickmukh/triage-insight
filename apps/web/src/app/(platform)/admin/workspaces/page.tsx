'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { LoadingSpinner } from '@/components/shared/common/loading-spinner';
import Link from 'next/link';
import { Search, ChevronRight, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'text-green-400 bg-green-400/10',
  SUSPENDED: 'text-red-400 bg-red-400/10',
  DISABLED: 'text-gray-400 bg-gray-400/10',
  PENDING: 'text-yellow-400 bg-yellow-400/10',
};
const STATUS_ICONS: Record<string, any> = { ACTIVE: CheckCircle, SUSPENDED: AlertTriangle, DISABLED: XCircle, PENDING: Clock };

export default function WorkspacesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['platform-workspaces', search, statusFilter, planFilter, page],
    queryFn: () => apiClient.platform.listWorkspaces({ page, limit: 20, search: search || undefined, status: statusFilter || undefined, plan: planFilter || undefined }),
    staleTime: 15_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) => apiClient.platform.updateWorkspaceStatus(id, { status, reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-workspaces'] }),
  });

  const ws = (data as any)?.workspaces ?? [];
  const total = (data as any)?.total ?? 0;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Workspaces</h1>
          <p className="text-sm text-gray-400 mt-1">{total} total workspaces</p>
        </div>
      </div>
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search by name or slug\u2026"
            className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-violet-500" />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-300 focus:outline-none focus:border-violet-500">
          <option value="">All statuses</option>
          {['ACTIVE','SUSPENDED','DISABLED','PENDING'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={planFilter} onChange={e => { setPlanFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-300 focus:outline-none focus:border-violet-500">
          <option value="">All plans</option>
          {['FREE','STARTER','PRO','BUSINESS','ENTERPRISE'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-12"><LoadingSpinner className="h-6 w-6 text-violet-400" /></div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Workspace</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Plan</th>
                <th className="px-4 py-3 text-left">Members</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-left">Actions</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {ws.map((w: any) => {
                const StatusIcon = STATUS_ICONS[w.status] ?? CheckCircle;
                return (
                  <tr key={w.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3"><p className="font-medium text-white">{w.name}</p><p className="text-xs text-gray-500">{w.slug}</p></td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[w.status] ?? ''}`}>
                        <StatusIcon className="h-3 w-3" />{w.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{w.billingPlan}</td>
                    <td className="px-4 py-3 text-gray-300">{w._count?.members ?? '\u2014'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{new Date(w.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {w.status === 'ACTIVE' && (
                          <button onClick={() => statusMutation.mutate({ id: w.id, status: 'SUSPENDED', reason: 'Platform admin action' })}
                            className="text-xs px-2 py-1 bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 transition-colors">Suspend</button>
                        )}
                        {w.status === 'SUSPENDED' && (
                          <button onClick={() => statusMutation.mutate({ id: w.id, status: 'ACTIVE' })}
                            className="text-xs px-2 py-1 bg-green-600/20 text-green-400 rounded hover:bg-green-600/30 transition-colors">Activate</button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/workspaces/${w.id}`} className="text-violet-400 hover:text-violet-300"><ChevronRight className="h-4 w-4" /></Link>
                    </td>
                  </tr>
                );
              })}
              {ws.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No workspaces found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {total > 20 && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>Page {page} of {(total / 20) | 0 + 1}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700 transition-colors">Prev</button>
            <button onClick={() => setPage(p => p + 1)} disabled={page * 20 >= total} className="px-3 py-1 bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700 transition-colors">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

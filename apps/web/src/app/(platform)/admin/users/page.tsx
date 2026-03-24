'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { LoadingSpinner } from '@/components/shared/common/loading-spinner';
import { Search, Shield, ShieldOff, UserCheck } from 'lucide-react';

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'text-violet-400 bg-violet-400/10',
  ADMIN: 'text-blue-400 bg-blue-400/10',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'text-green-400 bg-green-400/10',
  SUSPENDED: 'text-red-400 bg-red-400/10',
  DISABLED: 'text-gray-400 bg-gray-400/10',
};

export default function PlatformUsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['platform-users', search, page],
    queryFn: () => apiClient.platform.listPlatformUsers({ page, limit: 25, search: search || undefined }),
    staleTime: 15_000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; platformRole?: string | null; status?: string }) =>
      apiClient.platform.updatePlatformUser(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-users'] }),
  });

  const users = (data as any)?.users ?? [];
  const total = (data as any)?.total ?? 0;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Platform Users</h1>
        <p className="text-sm text-gray-400 mt-1">
          Manage platform admin access. Only users with a <code className="text-violet-300 text-xs bg-violet-400/10 px-1 rounded">platformRole</code> are listed here.
        </p>
      </div>
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or email…"
            className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-violet-500"
          />
        </div>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-12"><LoadingSpinner className="h-6 w-6 text-violet-400" /></div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Platform Role</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Joined</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {users.map((u: any) => (
                <tr key={u.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{u.firstName} {u.lastName}</p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    {u.platformRole ? (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[u.platformRole] ?? 'text-gray-400 bg-gray-400/10'}`}>
                        <Shield className="h-3 w-3" />{u.platformRole}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[u.status] ?? 'text-gray-400 bg-gray-400/10'}`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {/* Promote to SUPER_ADMIN */}
                      {u.platformRole !== 'SUPER_ADMIN' && (
                        <button
                          title="Promote to SUPER_ADMIN"
                          onClick={() => updateMutation.mutate({ id: u.id, platformRole: 'SUPER_ADMIN' })}
                          disabled={updateMutation.isPending && (updateMutation.variables as any)?.id === u.id}
                          className="p-1.5 rounded bg-violet-600/20 text-violet-400 hover:bg-violet-600/30 transition-colors disabled:opacity-40">
                          <Shield className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {/* Demote to ADMIN */}
                      {u.platformRole === 'SUPER_ADMIN' && (
                        <button
                          title="Demote to ADMIN"
                          onClick={() => updateMutation.mutate({ id: u.id, platformRole: 'ADMIN' })}
                          disabled={updateMutation.isPending && (updateMutation.variables as any)?.id === u.id}
                          className="p-1.5 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors disabled:opacity-40">
                          <UserCheck className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {/* Revoke platform role */}
                      {u.platformRole && (
                        <button
                          title="Revoke platform role"
                          onClick={() => updateMutation.mutate({ id: u.id, platformRole: null })}
                          disabled={updateMutation.isPending && (updateMutation.variables as any)?.id === u.id}
                          className="p-1.5 rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors disabled:opacity-40">
                          <ShieldOff className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {/* Toggle status */}
                      {u.status === 'ACTIVE' ? (
                        <button
                          onClick={() => updateMutation.mutate({ id: u.id, status: 'SUSPENDED' })}
                          disabled={updateMutation.isPending && (updateMutation.variables as any)?.id === u.id}
                          className="text-xs px-2 py-1 bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 transition-colors disabled:opacity-40">
                          Suspend
                        </button>
                      ) : (
                        <button
                          onClick={() => updateMutation.mutate({ id: u.id, status: 'ACTIVE' })}
                          disabled={updateMutation.isPending && (updateMutation.variables as any)?.id === u.id}
                          className="text-xs px-2 py-1 bg-green-600/20 text-green-400 rounded hover:bg-green-600/30 transition-colors disabled:opacity-40">
                          Activate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No platform admin users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {total > 25 && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>Page {page} of {Math.ceil(total / 25)}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700 transition-colors">Prev</button>
            <button onClick={() => setPage(p => p + 1)} disabled={page * 25 >= total} className="px-3 py-1 bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700 transition-colors">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

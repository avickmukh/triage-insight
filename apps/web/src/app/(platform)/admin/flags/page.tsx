'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { LoadingSpinner } from '@/components/shared/common/loading-spinner';
import { Search } from 'lucide-react';

export default function FeatureFlagsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [wsId, setWsId] = useState('');
  const [featureKey, setFeatureKey] = useState('');
  const [enabled, setEnabled] = useState(true);

  const { data: workspaces } = useQuery({ queryKey: ['platform-workspaces-all'], queryFn: () => apiClient.platform.listWorkspaces({ limit: 200 }), staleTime: 60_000 });
  const { data: overrides, isLoading } = useQuery({
    queryKey: ['platform-feature-overrides', wsId],
    queryFn: () => wsId ? apiClient.platform.listFeatureOverrides(wsId) : Promise.resolve([]),
    enabled: !!wsId,
    staleTime: 15_000,
  });

  const setMutation = useMutation({ mutationFn: () => apiClient.platform.setFeatureOverride(wsId, { feature: featureKey, enabled }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform-feature-overrides', wsId] }); setFeatureKey(''); } });
  const deleteMutation = useMutation({ mutationFn: (feature: string) => apiClient.platform.deleteFeatureOverride(wsId, feature), onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-feature-overrides', wsId] }) });

  const wsList = (workspaces as any)?.workspaces ?? [];
  const filtered = wsList.filter((w: any) => !search || w.name.toLowerCase().includes(search.toLowerCase()) || w.slug.includes(search));

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Feature Flag Overrides</h1>
        <p className="text-sm text-gray-400 mt-1">Override plan-level feature flags for individual workspaces.</p>
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">Select Workspace</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search\u2026"
              className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 placeholder-gray-500 focus:outline-none focus:border-violet-500" />
          </div>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {filtered.map((w: any) => (
              <button key={w.id} onClick={() => setWsId(w.id)}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${wsId === w.id ? 'bg-violet-600/20 text-violet-300' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}>
                <p className="font-medium">{w.name}</p><p className="text-xs opacity-60">{w.slug}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-5">
          {!wsId ? (
            <p className="text-sm text-gray-500 text-center py-8">Select a workspace to manage its feature overrides.</p>
          ) : (
            <>
              <h2 className="text-sm font-semibold text-gray-300">Overrides for {wsList.find((w: any) => w.id === wsId)?.name}</h2>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">Feature key</label>
                  <input value={featureKey} onChange={e => setFeatureKey(e.target.value)} placeholder="e.g. aiPrioritization"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-violet-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">State</label>
                  <select value={enabled ? 'true' : 'false'} onChange={e => setEnabled(e.target.value === 'true')}
                    className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-violet-500">
                    <option value="true">Enabled</option><option value="false">Disabled</option>
                  </select>
                </div>
                <button onClick={() => featureKey && setMutation.mutate()} disabled={!featureKey || setMutation.isPending}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm rounded transition-colors">Set</button>
              </div>
              {isLoading ? <LoadingSpinner className="h-5 w-5 text-violet-400" /> : (
                <div className="space-y-2">
                  {((overrides as any[]) ?? []).length === 0 ? <p className="text-sm text-gray-500">No overrides set.</p> : (
                    (overrides as any[]).map((o: any) => (
                      <div key={o.id} className="flex items-center justify-between px-3 py-2 bg-gray-800 rounded">
                        <span className="text-sm text-gray-300 font-mono">{o.feature}</span>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${o.enabled ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'}`}>{o.enabled ? 'ON' : 'OFF'}</span>
                          <button onClick={() => deleteMutation.mutate(o.feature)} className="text-xs text-gray-500 hover:text-red-400 transition-colors">Remove</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

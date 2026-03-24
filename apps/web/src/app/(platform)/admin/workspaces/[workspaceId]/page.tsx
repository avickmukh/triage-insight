'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { LoadingSpinner } from '@/components/shared/common/loading-spinner';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

const VALID_FEATURES = [
  'aiInsights','aiThemeClustering','ciqPrioritization','explainableAi',
  'weeklyDigest','voiceFeedback','survey','integrations','publicPortal',
  'csvImport','apiAccess','executiveReporting','customDomain',
];

export default function WorkspaceDetailPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const qc = useQueryClient();
  const [overridePlan, setOverridePlan] = useState('');
  const [extendDays, setExtendDays] = useState(14);
  const [featureKey, setFeatureKey] = useState('');
  const [featureEnabled, setFeatureEnabled] = useState(true);

  const { data: ws, isLoading } = useQuery({ queryKey: ['platform-workspace', workspaceId], queryFn: () => apiClient.platform.getWorkspace(workspaceId), staleTime: 15_000 });
  const { data: overrides } = useQuery({ queryKey: ['platform-feature-overrides', workspaceId], queryFn: () => apiClient.platform.listFeatureOverrides(workspaceId), staleTime: 15_000 });

  const overridePlanMutation = useMutation({ mutationFn: (plan: string) => apiClient.platform.overrideBillingPlan(workspaceId, { plan }), onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-workspace', workspaceId] }) });
  const extendTrialMutation = useMutation({ mutationFn: (days: number) => apiClient.platform.extendTrial(workspaceId, { days }), onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-workspace', workspaceId] }) });
  const cancelMutation = useMutation({ mutationFn: () => apiClient.platform.cancelSubscription(workspaceId), onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-workspace', workspaceId] }) });
  const reactivateMutation = useMutation({ mutationFn: () => apiClient.platform.reactivateSubscription(workspaceId), onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-workspace', workspaceId] }) });
  const setOverrideMutation = useMutation({ mutationFn: ({ feature, enabled }: { feature: string; enabled: boolean }) => apiClient.platform.setFeatureOverride(workspaceId, { feature, enabled }), onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-feature-overrides', workspaceId] }) });
  const deleteOverrideMutation = useMutation({ mutationFn: (feature: string) => apiClient.platform.deleteFeatureOverride(workspaceId, feature), onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-feature-overrides', workspaceId] }) });

  if (isLoading) return <div className="flex h-full items-center justify-center"><LoadingSpinner className="h-8 w-8 text-violet-400" /></div>;
  const w = ws as any;

  return (
    <div className="p-8 space-y-8 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/workspaces" className="text-gray-400 hover:text-white"><ArrowLeft className="h-5 w-5" /></Link>
        <div>
          <h1 className="text-2xl font-bold text-white">{w?.name}</h1>
          <p className="text-sm text-gray-400">{w?.slug} &middot; {w?.status} &middot; {w?.billingPlan}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Members', value: w?.memberCount ?? 0 },
          { label: 'Feedback entries', value: w?.feedbackCount ?? 0 },
          { label: 'Support tickets', value: w?.supportTicketCount ?? 0 },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-xl font-bold text-white mt-1">{value}</p>
          </div>
        ))}
      </div>
      {/* Workspace info */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Workspace Details</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            { label: 'ID', value: w?.id },
            { label: 'Slug', value: w?.slug },
            { label: 'Status', value: w?.status },
            { label: 'Billing Plan', value: w?.billingPlan },
            { label: 'Billing Status', value: w?.billingStatus },
            { label: 'Plan Status', value: w?.planStatus },
            { label: 'Trial Status', value: w?.trialStatus },
            { label: 'Trial Ends', value: w?.trialEndsAt ? new Date(w.trialEndsAt).toLocaleDateString() : '—' },
            { label: 'Seat Limit', value: w?.seatLimit ?? 'Unlimited' },
            { label: 'Billing Email', value: w?.billingEmail ?? '—' },
            { label: 'Stripe Customer', value: w?.stripeCustomerId ?? '—' },
            { label: 'Created', value: w?.createdAt ? new Date(w.createdAt).toLocaleDateString() : '—' },
          ].map(({ label, value }) => (
            <div key={label}><p className="text-xs text-gray-500">{label}</p><p className="text-gray-200 font-medium truncate">{String(value ?? '—')}</p></div>
          ))}
        </div>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-5">
        <h2 className="text-sm font-semibold text-gray-300">Billing Control</h2>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">Override Plan</label>
            <select value={overridePlan} onChange={e => setOverridePlan(e.target.value)} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-violet-500">
              <option value="">Select plan…</option>
              {['FREE','PRO','BUSINESS'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <button onClick={() => overridePlan && overridePlanMutation.mutate(overridePlan)} disabled={!overridePlan || overridePlanMutation.isPending}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm rounded transition-colors">
            {overridePlanMutation.isPending ? 'Applying…' : 'Apply'}
          </button>
        </div>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">Extend Trial (days)</label>
            <input type="number" value={extendDays} onChange={e => setExtendDays(Number(e.target.value))} min={1} max={365}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-violet-500" />
          </div>
          <button onClick={() => extendTrialMutation.mutate(extendDays)} disabled={extendTrialMutation.isPending}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm rounded transition-colors">
            {extendTrialMutation.isPending ? 'Extending…' : 'Extend Trial'}
          </button>
        </div>
        <div className="flex gap-3">
          <button onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending} className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm rounded transition-colors disabled:opacity-40">Cancel Subscription</button>
          <button onClick={() => reactivateMutation.mutate()} disabled={reactivateMutation.isPending} className="px-4 py-2 bg-green-600/20 hover:bg-green-600/30 text-green-400 text-sm rounded transition-colors disabled:opacity-40">Reactivate</button>
        </div>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-5">
        <h2 className="text-sm font-semibold text-gray-300">Feature Flag Overrides</h2>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">Feature key</label>
            <select value={featureKey} onChange={e => setFeatureKey(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-violet-500">
              <option value="">Select feature…</option>
              {VALID_FEATURES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">State</label>
            <select value={featureEnabled ? 'true' : 'false'} onChange={e => setFeatureEnabled(e.target.value === 'true')}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-violet-500">
              <option value="true">Enabled</option><option value="false">Disabled</option>
            </select>
          </div>
          <button onClick={() => featureKey && setOverrideMutation.mutate({ feature: featureKey, enabled: featureEnabled })} disabled={!featureKey || setOverrideMutation.isPending}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm rounded transition-colors">Set Override</button>
        </div>
        {((overrides as any[]) ?? []).length > 0 ? (
          <div className="space-y-2">
            {(overrides as any[]).map((o: any) => (
              <div key={o.id} className="flex items-center justify-between px-3 py-2 bg-gray-800 rounded">
                <span className="text-sm text-gray-300 font-mono">{o.feature}</span>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${o.enabled ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'}`}>{o.enabled ? 'ON' : 'OFF'}</span>
                  <button
                    onClick={() => deleteOverrideMutation.mutate(o.feature)}
                    disabled={deleteOverrideMutation.isPending && deleteOverrideMutation.variables === o.feature}
                    className="text-xs text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {deleteOverrideMutation.isPending && deleteOverrideMutation.variables === o.feature ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-gray-500">No overrides set for this workspace.</p>}
      </div>
      {/* Recent members */}
      {w?.members && w.members.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Recent Members</h2>
          <div className="space-y-2">
            {w.members.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="text-gray-200">{m.user?.firstName} {m.user?.lastName}</p>
                  <p className="text-xs text-gray-500">{m.user?.email}</p>
                </div>
                <span className="text-xs text-gray-500">{m.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

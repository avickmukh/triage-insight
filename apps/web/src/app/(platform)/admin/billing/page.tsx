'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { LoadingSpinner } from '@/components/shared/common/loading-spinner';

export default function BillingHealthPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const { data: health, isLoading } = useQuery({ queryKey: ['platform-billing-health'], queryFn: () => apiClient.platform.getBillingHealth(), staleTime: 30_000 });
  const { data: subs, isLoading: subsLoading } = useQuery({ queryKey: ['platform-subscriptions', page], queryFn: () => apiClient.platform.listAllSubscriptions({ page, limit: 25 }), staleTime: 15_000 });

  const overrideMutation = useMutation({
    mutationFn: ({ id, plan }: { id: string; plan: string }) => apiClient.platform.overrideBillingPlan(id, { targetPlan: plan }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-subscriptions'] }),
  });

  const h = health as any;
  const list = (subs as any)?.workspaces ?? [];
  const total = (subs as any)?.total ?? 0;

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Billing Health</h1>
        <p className="text-sm text-gray-400 mt-1">Revenue metrics and subscription management.</p>
      </div>
      {isLoading ? <LoadingSpinner className="h-6 w-6 text-violet-400" /> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'MRR', value: h?.mrr ? `$${h.mrr.toLocaleString()}` : '\u2014' },
            { label: 'ARR', value: h?.arr ? `$${h.arr.toLocaleString()}` : '\u2014' },
            { label: 'Paid', value: h?.paidWorkspaces ?? '\u2014' },
            { label: 'Trial', value: h?.trialWorkspaces ?? '\u2014' },
            { label: 'Failed Payments', value: h?.failedPayments ?? '\u2014' },
            { label: 'Cancelled', value: h?.cancelledWorkspaces ?? '\u2014' },
            { label: 'Churn Rate', value: h?.churnRate ? `${h.churnRate.toFixed(1)}%` : '\u2014' },
            { label: 'Free', value: h?.freeWorkspaces ?? '\u2014' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-xl font-bold text-white mt-1">{value}</p>
            </div>
          ))}
        </div>
      )}
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-300">All Subscriptions ({total})</h2>
        </div>
        {subsLoading ? <div className="flex justify-center py-8"><LoadingSpinner className="h-5 w-5 text-violet-400" /></div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-800">
                <th className="px-4 py-3 text-left">Workspace</th>
                <th className="px-4 py-3 text-left">Plan</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Trial ends</th>
                <th className="px-4 py-3 text-left">Override</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {list.map((w: any) => (
                <tr key={w.id} className="hover:bg-gray-800/50">
                  <td className="px-4 py-3"><p className="font-medium text-white">{w.name}</p><p className="text-xs text-gray-500">{w.slug}</p></td>
                  <td className="px-4 py-3 text-gray-300">{w.billingPlan}</td>
                  <td className="px-4 py-3 text-gray-300">{w.billingStatus}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{w.trialEndsAt ? new Date(w.trialEndsAt).toLocaleDateString() : '\u2014'}</td>
                  <td className="px-4 py-3">
                    <select defaultValue="" onChange={e => e.target.value && overrideMutation.mutate({ id: w.id, plan: e.target.value })}
                      className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 focus:outline-none focus:border-violet-500">
                      <option value="">Override\u2026</option>
                      {['FREE','STARTER','PRO','BUSINESS','ENTERPRISE'].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No subscriptions found</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {total > 25 && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>Page {page} of {Math.ceil(total / 25)}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700">Prev</button>
            <button onClick={() => setPage(p => p + 1)} disabled={page * 25 >= total} className="px-3 py-1 bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

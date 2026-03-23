'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { LoadingSpinner } from '@/components/shared/common/loading-spinner';

export default function PricingConfigPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});

  const { data: plans, isLoading } = useQuery({ queryKey: ['platform-plans'], queryFn: () => apiClient.platform.listPlans(), staleTime: 60_000 });

  const updateMutation = useMutation({
    mutationFn: ({ planType, data }: { planType: string; data: any }) => apiClient.platform.updatePlan(planType, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform-plans'] }); setEditing(null); },
  });

  if (isLoading) return <div className="flex h-full items-center justify-center"><LoadingSpinner className="h-8 w-8 text-violet-400" /></div>;
  const planList = (plans as any[]) ?? [];

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Pricing Configuration</h1>
        <p className="text-sm text-gray-400 mt-1">Manage plan limits, pricing, and Stripe Price IDs.</p>
      </div>
      <div className="space-y-4">
        {planList.map((plan: any) => (
          <div key={plan.planType} className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div><h2 className="text-base font-semibold text-white">{plan.planType}</h2><p className="text-xs text-gray-400">{plan.status}</p></div>
              <button onClick={() => { setEditing(plan.planType); setForm({ ...plan }); }}
                className="text-xs px-3 py-1.5 bg-violet-600/20 text-violet-400 rounded hover:bg-violet-600/30 transition-colors">Edit</button>
            </div>
            {editing === plan.planType ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { key: 'monthlyPrice', label: 'Monthly Price ($)', type: 'number' },
                    { key: 'annualPrice', label: 'Annual Price ($)', type: 'number' },
                    { key: 'trialDays', label: 'Trial Days', type: 'number' },
                    { key: 'stripePriceId', label: 'Stripe Price ID', type: 'text' },
                    { key: 'maxMembers', label: 'Max Members', type: 'number' },
                    { key: 'maxFeedbackEntries', label: 'Max Feedback', type: 'number' },
                    { key: 'maxSupportTickets', label: 'Max Tickets', type: 'number' },
                    { key: 'maxSurveys', label: 'Max Surveys', type: 'number' },
                  ].map(({ key, label, type }) => (
                    <div key={key}>
                      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                      <input type={type} value={form[key] ?? ''} onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-violet-500" />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {['aiPrioritization','voiceIntelligence','surveyIntelligence','supportIntelligence','churnIntelligence','advancedReporting','apiAccess','ssoEnabled','customDomain'].map(feat => (
                    <label key={feat} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                      <input type="checkbox" checked={!!form[feat]} onChange={e => setForm(f => ({ ...f, [feat]: e.target.checked }))}
                        className="rounded border-gray-600 bg-gray-800 text-violet-600 focus:ring-violet-500" />
                      {feat}
                    </label>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => updateMutation.mutate({ planType: plan.planType, data: form })} disabled={updateMutation.isPending}
                    className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm rounded transition-colors">
                    {updateMutation.isPending ? 'Saving\u2026' : 'Save Changes'}
                  </button>
                  <button onClick={() => setEditing(null)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded transition-colors">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3 text-sm">
                {[
                  { label: 'Monthly', value: plan.monthlyPrice != null ? `$${plan.monthlyPrice}` : '\u2014' },
                  { label: 'Annual', value: plan.annualPrice != null ? `$${plan.annualPrice}` : '\u2014' },
                  { label: 'Trial', value: plan.trialDays != null ? `${plan.trialDays} days` : '\u2014' },
                  { label: 'Stripe ID', value: plan.stripePriceId ?? '\u2014' },
                  { label: 'Max Members', value: plan.maxMembers ?? '\u221e' },
                  { label: 'Max Feedback', value: plan.maxFeedbackEntries ?? '\u221e' },
                  { label: 'Max Tickets', value: plan.maxSupportTickets ?? '\u221e' },
                  { label: 'Max Surveys', value: plan.maxSurveys ?? '\u221e' },
                ].map(({ label, value }) => (
                  <div key={label}><p className="text-xs text-gray-500">{label}</p><p className="text-gray-200 font-medium truncate">{value}</p></div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

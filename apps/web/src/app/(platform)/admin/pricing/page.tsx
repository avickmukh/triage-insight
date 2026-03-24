'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { LoadingSpinner } from '@/components/shared/common/loading-spinner';

const PLAN_FEATURE_FLAGS = [
  'aiInsights','aiThemeClustering','ciqPrioritization','explainableAi',
  'weeklyDigest','voiceFeedback','survey','integrations','publicPortal',
  'csvImport','apiAccess','executiveReporting','customDomain',
];

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
        <p className="text-sm text-gray-400 mt-1">Manage plan limits, pricing, and feature flags.</p>
      </div>
      <div className="space-y-4">
        {planList.map((plan: any) => (
          <div key={plan.planType} className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-white">{plan.planType}</h2>
                <p className="text-xs text-gray-400">{plan.displayName}{plan.isActive ? '' : ' · Inactive'}</p>
              </div>
              <button onClick={() => { setEditing(plan.planType); setForm({ ...plan }); }}
                className="text-xs px-3 py-1.5 bg-violet-600/20 text-violet-400 rounded hover:bg-violet-600/30 transition-colors">Edit</button>
            </div>
            {editing === plan.planType ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { key: 'priceMonthly', label: 'Monthly Price (cents)', type: 'number' },
                    { key: 'trialDays', label: 'Trial Days', type: 'number' },
                    { key: 'seatLimit', label: 'Seat Limit (null = unlimited)', type: 'number' },
                    { key: 'adminLimit', label: 'Admin Limit', type: 'number' },
                    { key: 'feedbackLimit', label: 'Feedback Limit', type: 'number' },
                    { key: 'aiUsageLimit', label: 'AI Usage Limit', type: 'number' },
                    { key: 'voiceUploadLimit', label: 'Voice Upload Limit', type: 'number' },
                    { key: 'surveyResponseLimit', label: 'Survey Response Limit', type: 'number' },
                  ].map(({ key, label, type }) => (
                    <div key={key}>
                      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                      <input type={type} value={form[key] ?? ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value === '' ? null : type === 'number' ? Number(e.target.value) : e.target.value }))}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 focus:outline-none focus:border-violet-500" />
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-2">Feature Flags</p>
                  <div className="grid grid-cols-3 gap-3">
                    {PLAN_FEATURE_FLAGS.map(feat => (
                      <label key={feat} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                        <input type="checkbox" checked={!!form[feat]} onChange={e => setForm(f => ({ ...f, [feat]: e.target.checked }))}
                          className="rounded border-gray-600 bg-gray-800 text-violet-600 focus:ring-violet-500" />
                        {feat}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => updateMutation.mutate({ planType: plan.planType, data: form })} disabled={updateMutation.isPending}
                    className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm rounded transition-colors">
                    {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
                  </button>
                  <button onClick={() => setEditing(null)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded transition-colors">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3 text-sm">
                {[
                  { label: 'Monthly', value: plan.priceMonthly != null ? `$${(plan.priceMonthly / 100).toFixed(2)}` : '—' },
                  { label: 'Trial', value: plan.trialDays != null ? `${plan.trialDays} days` : '—' },
                  { label: 'Seat Limit', value: plan.seatLimit ?? '∞' },
                  { label: 'Admin Limit', value: plan.adminLimit ?? '∞' },
                  { label: 'Feedback Limit', value: plan.feedbackLimit ?? '∞' },
                  { label: 'AI Usage Limit', value: plan.aiUsageLimit ?? '∞' },
                  { label: 'Voice Uploads', value: plan.voiceUploadLimit ?? '∞' },
                  { label: 'Survey Responses', value: plan.surveyResponseLimit ?? '∞' },
                ].map(({ label, value }) => (
                  <div key={label}><p className="text-xs text-gray-500">{label}</p><p className="text-gray-200 font-medium truncate">{String(value)}</p></div>
                ))}
              </div>
            )}
          </div>
        ))}
        {planList.length === 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center text-gray-500">
            No plans configured. Run the pricing seed to populate default plans.
          </div>
        )}
      </div>
    </div>
  );
}

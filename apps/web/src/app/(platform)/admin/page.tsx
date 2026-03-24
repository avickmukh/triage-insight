'use client';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { LoadingSpinner } from '@/components/shared/common/loading-spinner';
import { Building2, Users, DollarSign, AlertTriangle, TrendingUp, Activity, Cpu, MessageSquare } from 'lucide-react';
import Link from 'next/link';

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: any; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg ${color}`}><Icon className="h-5 w-5" /></div>
      </div>
    </div>
  );
}

export default function PlatformDashboard() {
  const { data: health, isLoading } = useQuery({ queryKey: ['platform-health'], queryFn: () => apiClient.platform.getSystemHealth(), staleTime: 30_000 });
  const { data: billing } = useQuery({ queryKey: ['platform-billing-health'], queryFn: () => apiClient.platform.getBillingHealth(), staleTime: 30_000 });

  if (isLoading) return <div className="flex h-full items-center justify-center"><LoadingSpinner className="h-8 w-8 text-violet-400" /></div>;

  const h = health as any;
  const b = billing as any;

  // planDistribution is an array of { plan, count }
  const planDist: Array<{ plan: string; count: number }> = b?.planDistribution ?? b?.planBreakdown ?? [];

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
        <p className="text-sm text-gray-400 mt-1">Real-time health and billing metrics across all workspaces.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Workspaces" value={h?.workspaces?.total ?? '—'} sub={`${h?.workspaces?.active ?? 0} active`} icon={Building2} color="bg-violet-600/20 text-violet-400" />
        <StatCard label="Total Users" value={h?.users?.total ?? '—'} sub={`${h?.users?.activeThisMonth ?? 0} active this month`} icon={Users} color="bg-blue-600/20 text-blue-400" />
        <StatCard label="MRR" value={b?.mrr != null ? `$${Number(b.mrr).toLocaleString()}` : '—'} sub="Monthly recurring revenue" icon={DollarSign} color="bg-green-600/20 text-green-400" />
        <StatCard label="Paid Workspaces" value={b?.paidWorkspaces ?? b?.activeCount ?? '—'} sub={`${b?.trialWorkspaces ?? b?.trialingCount ?? 0} on trial`} icon={TrendingUp} color="bg-emerald-600/20 text-emerald-400" />
        <StatCard label="Suspended" value={h?.workspaces?.suspended ?? '—'} sub="Require attention" icon={AlertTriangle} color="bg-red-600/20 text-red-400" />
        <StatCard label="Failed Payments" value={b?.failedPayments ?? b?.pastDueCount ?? '—'} sub="Past due subscriptions" icon={Activity} color="bg-orange-600/20 text-orange-400" />
        <StatCard label="AI Jobs" value={h?.aiJobs?.total ?? '—'} sub={`${h?.aiJobs?.running ?? 0} running · ${h?.aiJobs?.failed ?? 0} failed`} icon={Cpu} color="bg-purple-600/20 text-purple-400" />
        <StatCard label="Feedback (24h)" value={h?.feedback?.last24h ?? '—'} sub={`${h?.feedback?.ingestionRatePerHour ?? 0}/hr ingestion rate`} icon={MessageSquare} color="bg-cyan-600/20 text-cyan-400" />
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Plan Distribution</h2>
          {planDist.length > 0 ? (
            <div className="space-y-2">
              {planDist.map(({ plan, count }) => (
                <div key={plan} className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">{plan}</span>
                  <span className="font-medium text-white">{count}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-500">No data</p>}
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Quick Actions</h2>
          <div className="space-y-2">
            {[
              { label: 'Manage Workspaces', href: '/admin/workspaces' },
              { label: 'Billing Health', href: '/admin/billing' },
              { label: 'Pricing Config', href: '/admin/pricing' },
              { label: 'Feature Flags', href: '/admin/flags' },
              { label: 'System Health', href: '/admin/health' },
              { label: 'Platform Users', href: '/admin/users' },
              { label: 'Audit Log', href: '/admin/audit-log' },
              { label: 'Purge Requests', href: '/admin/purge' },
            ].map(({ label, href }) => (
              <Link key={href} href={href} className="flex items-center justify-between px-3 py-2 rounded-md bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 hover:text-white transition-colors">
                {label}<span className="text-gray-500">&rarr;</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

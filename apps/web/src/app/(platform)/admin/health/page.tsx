'use client';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { LoadingSpinner } from '@/components/shared/common/loading-spinner';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

function ServiceRow({ name, status, latency, detail }: { name: string; status: string; latency?: number; detail?: string }) {
  const icon = status === 'healthy' ? <CheckCircle className="h-4 w-4 text-green-400" /> : status === 'degraded' ? <AlertTriangle className="h-4 w-4 text-yellow-400" /> : <XCircle className="h-4 w-4 text-red-400" />;
  const color = status === 'healthy' ? 'text-green-400' : status === 'degraded' ? 'text-yellow-400' : 'text-red-400';
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 last:border-0">
      <div className="flex items-center gap-3">
        {icon}
        <div><p className="text-sm font-medium text-white">{name}</p>{detail && <p className="text-xs text-gray-500">{detail}</p>}</div>
      </div>
      <div className="flex items-center gap-4 text-xs">
        {latency != null && <span className="text-gray-400">{latency}ms</span>}
        <span className={`font-medium ${color}`}>{status.toUpperCase()}</span>
      </div>
    </div>
  );
}

export default function SystemHealthPage() {
  const { data, isLoading, dataUpdatedAt, refetch } = useQuery({ queryKey: ['platform-system-health'], queryFn: () => apiClient.platform.getSystemHealth(), refetchInterval: 30_000, staleTime: 15_000 });

  if (isLoading) return <div className="flex h-full items-center justify-center"><LoadingSpinner className="h-8 w-8 text-violet-400" /></div>;
  const h = data as any;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">System Health</h1>
          <p className="text-sm text-gray-400 mt-1">Last updated: {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '\u2014'}</p>
        </div>
        <button onClick={() => refetch()} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded transition-colors">Refresh</button>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800"><h2 className="text-sm font-semibold text-gray-300">Services</h2></div>
        <ServiceRow name="Database (PostgreSQL)" status={h?.services?.database ?? 'down'} latency={h?.latencies?.database} />
        <ServiceRow name="Cache (Redis)" status={h?.services?.redis ?? 'down'} latency={h?.latencies?.redis} />
        <ServiceRow name="Queue (Bull)" status={h?.services?.queue ?? 'down'} />
        <ServiceRow name="AI (OpenAI)" status={h?.services?.ai ?? 'down'} detail={h?.aiModel} />
        <ServiceRow name="Storage (S3)" status={h?.services?.storage ?? 'down'} />
        <ServiceRow name="Email" status={h?.services?.email ?? 'down'} />
        <ServiceRow name="Stripe" status={h?.services?.stripe ?? 'down'} />
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Platform Metrics</h2>
          <div className="space-y-2 text-sm">
            {[
              { label: 'Total Workspaces', value: h?.workspaces?.total },
              { label: 'Active Workspaces', value: h?.workspaces?.active },
              { label: 'Total Users', value: h?.users?.total },
              { label: 'Active Users (30d)', value: h?.users?.activeThisMonth },
              { label: 'Total Feedback', value: h?.feedback?.total },
              { label: 'Feedback (30d)', value: h?.feedback?.last30Days },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between">
                <span className="text-gray-400">{label}</span>
                <span className="text-white font-medium">{value ?? '\u2014'}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Queue Metrics</h2>
          <div className="space-y-2 text-sm">
            {[
              { label: 'Waiting', value: h?.queue?.waiting },
              { label: 'Active', value: h?.queue?.active },
              { label: 'Completed', value: h?.queue?.completed },
              { label: 'Failed', value: h?.queue?.failed },
              { label: 'Delayed', value: h?.queue?.delayed },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between">
                <span className="text-gray-400">{label}</span>
                <span className="text-white font-medium">{value ?? '\u2014'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

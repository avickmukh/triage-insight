'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/ui/card';
import { Badge } from '@/components/shared/ui/badge';
import { Button } from '@/components/shared/ui/button';
import { Skeleton } from '@/components/shared/ui/skeleton';
import { useSupportSpikes } from '@/hooks/use-support';
import { appRoutes } from '@/lib/routes';
import type { SpikeSeverity } from '@/lib/api-types';

function fmtArr(val: number) {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

function severityConfig(severity: SpikeSeverity) {
  const map: Record<SpikeSeverity, { cls: string; label: string }> = {
    CRITICAL: { cls: 'bg-red-100 text-red-700 border-red-200', label: 'Critical' },
    HIGH: { cls: 'bg-orange-100 text-orange-700 border-orange-200', label: 'High' },
    MEDIUM: { cls: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Medium' },
    LOW: { cls: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Low' },
  };
  return map[severity];
}

export default function SupportSpikesPage() {
  const params = useParams();
  const slug = Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug ?? '';
  const r = appRoutes(slug);

  const { data: spikes, isLoading } = useSupportSpikes();

  const criticalCount = spikes?.filter((s) => s.severity === 'CRITICAL' || s.severity === 'HIGH').length ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={r.support.overview}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Spike Alerts</h1>
            <p className="text-sm text-muted-foreground">
              Statistically significant ticket volume spikes detected in the last 7 days.
            </p>
          </div>
        </div>
        {criticalCount > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg bg-red-50 border border-red-200 px-3 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
            <span className="text-xs font-semibold text-red-700">{criticalCount} critical/high</span>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Active Spikes
            {spikes && (
              <Badge variant="secondary" className="ml-1">{spikes.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : !spikes || spikes.length === 0 ? (
            <div className="py-12 text-center">
              <Zap className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No active spikes detected in the last 7 days.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {spikes.map((spike) => {
                const cfg = severityConfig(spike.severity);
                return (
                  <div
                    key={spike.id}
                    className="rounded-xl border px-4 py-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
                          {cfg.label}
                        </span>
                        <span className="text-sm font-semibold">{spike.clusterTitle}</span>
                        {spike.themeTitle && (
                          <span className="text-xs text-muted-foreground">→ {spike.themeTitle}</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(spike.windowStart).toLocaleDateString()} – {new Date(spike.windowEnd).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-6 text-xs text-muted-foreground">
                      <span>
                        <span className="font-semibold text-foreground">{spike.ticketCount}</span> tickets in window
                      </span>
                      <span>
                        Baseline: <span className="font-medium text-foreground">{spike.baseline}</span>
                      </span>
                      <span>
                        Z-score: <span className="font-semibold text-foreground">{spike.zScore.toFixed(2)}</span>
                      </span>
                      {spike.arrExposure > 0 && (
                        <span>
                          ARR exposure: <span className="font-semibold text-orange-600">{fmtArr(spike.arrExposure)}</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

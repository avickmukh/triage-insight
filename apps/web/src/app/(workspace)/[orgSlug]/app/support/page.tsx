'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, BarChart2, Layers, RefreshCw, Ticket, TrendingUp, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/ui/card';
import { Badge } from '@/components/shared/ui/badge';
import { Button } from '@/components/shared/ui/button';
import { Skeleton } from '@/components/shared/ui/skeleton';
import { useSupportOverview, useTriggerSupportSync } from '@/hooks/use-support';
import { appRoutes } from '@/lib/routes';
import type { SpikeSeverity } from '@/lib/api-types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtArr(val: number) {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

function severityBadge(severity: SpikeSeverity) {
  const map: Record<SpikeSeverity, string> = {
    CRITICAL: 'bg-red-100 text-red-700 border-red-200',
    HIGH: 'bg-orange-100 text-orange-700 border-orange-200',
    MEDIUM: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    LOW: 'bg-blue-100 text-blue-700 border-blue-200',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${map[severity]}`}>
      {severity}
    </span>
  );
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    OPEN: 'bg-yellow-100 text-yellow-700',
    IN_PROGRESS: 'bg-blue-100 text-blue-700',
    RESOLVED: 'bg-green-100 text-green-700',
    CLOSED: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${accent ?? ''}`}>{value}</p>
            {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className="rounded-lg bg-muted p-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SupportOverviewPage() {
  const params = useParams();
  const slug = Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug ?? '';
  const r = appRoutes(slug);

  const { data, isLoading, error } = useSupportOverview();
  const syncMutation = useTriggerSupportSync();

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Failed to load support intelligence.</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  const { summary, topClusters, activeSpikes, recentTickets } = data;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Support Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ticket clusters, spike alerts, and ARR exposure from your support queue.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            {syncMutation.isPending ? 'Syncing…' : 'Sync Intelligence'}
          </Button>
          <Link href={r.support.tickets}>
            <Button variant="outline" size="sm">
              <Ticket className="mr-1.5 h-3.5 w-3.5" />
              All Tickets
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="Total Tickets"
          value={summary.totalTickets.toLocaleString()}
          sub={`${summary.openTickets} open · ${summary.resolvedTickets} resolved`}
          icon={Ticket}
        />
        <KpiCard
          label="Issue Clusters"
          value={summary.totalClusters}
          sub={`${summary.linkedClusters} linked to themes`}
          icon={Layers}
        />
        <KpiCard
          label="ARR Exposure"
          value={fmtArr(summary.totalArrExposure)}
          sub="Across all clusters"
          icon={BarChart2}
          accent={summary.totalArrExposure > 500_000 ? 'text-orange-600' : undefined}
        />
        <KpiCard
          label="Active Spikes"
          value={summary.activeSpikes}
          sub={`${summary.criticalSpikes} critical / high`}
          icon={Zap}
          accent={summary.criticalSpikes > 0 ? 'text-red-600' : undefined}
        />
      </div>

      {/* Spike Alerts Banner */}
      {activeSpikes.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span className="text-sm font-semibold text-red-700">
              {activeSpikes.length} Active Spike{activeSpikes.length > 1 ? 's' : ''} Detected
            </span>
          </div>
          <div className="space-y-2">
            {activeSpikes.map((spike) => (
              <div
                key={spike.id}
                className="flex items-center justify-between rounded-lg bg-white border border-red-100 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  {severityBadge(spike.severity)}
                  <span className="text-sm font-medium">{spike.clusterTitle}</span>
                  {spike.themeTitle && (
                    <span className="text-xs text-muted-foreground">→ {spike.themeTitle}</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{spike.ticketCount} tickets</span>
                  <span>z={spike.zScore.toFixed(1)}</span>
                  <span>{fmtArr(spike.arrExposure)} ARR</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2">
            <Link href={r.support.spikes} className="text-xs text-red-600 hover:underline font-medium">
              View all spikes →
            </Link>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top Clusters */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Top Issue Clusters</CardTitle>
              <Link href={r.support.clusters} className="text-xs text-primary hover:underline">
                View all →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {topClusters.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No clusters yet. Sync support tickets to generate clusters.
              </p>
            ) : (
              topClusters.map((cluster, idx) => (
                <div
                  key={cluster.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2.5 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-muted text-xs font-bold flex items-center justify-center text-muted-foreground">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{cluster.title}</p>
                      {cluster.themeTitle && (
                        <p className="text-xs text-muted-foreground truncate">→ {cluster.themeTitle}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                    <span className="text-xs text-muted-foreground">{cluster.ticketCount} tickets</span>
                    {cluster.arrExposure > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {fmtArr(cluster.arrExposure)}
                      </Badge>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Recent Tickets */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Recent Tickets</CardTitle>
              <Link href={r.support.tickets} className="text-xs text-primary hover:underline">
                View all →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentTickets.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No tickets yet. Connect a support integration to start ingesting tickets.
              </p>
            ) : (
              recentTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{ticket.subject}</p>
                    {ticket.customerEmail && (
                      <p className="text-xs text-muted-foreground truncate">{ticket.customerEmail}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {statusBadge(ticket.status)}
                    <span className="text-xs text-muted-foreground">
                      {new Date(ticket.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { href: r.support.tickets, label: 'All Tickets', icon: Ticket },
          { href: r.support.clusters, label: 'Issue Clusters', icon: Layers },
          { href: r.support.spikes, label: 'Spike Alerts', icon: Zap },
          { href: r.intelligence, label: 'Intelligence Hub', icon: TrendingUp },
        ].map((link) => (
          <Link key={link.href} href={link.href}>
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2.5 hover:bg-muted/40 transition-colors cursor-pointer">
              <link.icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{link.label}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

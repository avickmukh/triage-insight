'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertTriangle, BarChart2, Layers, RefreshCw, Ticket,
  TrendingDown, TrendingUp, Zap, Link2, Activity,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/ui/card';
import { Badge } from '@/components/shared/ui/badge';
import { Button } from '@/components/shared/ui/button';
import { Skeleton } from '@/components/shared/ui/skeleton';
import {
  useSupportOverview,
  useSupportNegativeTrends,
  useSupportLinkedThemes,
  useTriggerSupportSync,
  useTriggerSentimentScoring,
} from '@/hooks/use-support';
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

/**
 * Render a sentiment score (-1 to +1) as a coloured pill with a label.
 * Null means scoring has not run yet.
 */
function SentimentPill({ score }: { score: number | null }) {
  if (score == null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const pct = Math.round(((score + 1) / 2) * 100);
  const label = score <= -0.4 ? 'Negative' : score >= 0.4 ? 'Positive' : 'Neutral';
  const cls =
    score <= -0.4
      ? 'bg-red-100 text-red-700 border-red-200'
      : score >= 0.4
      ? 'bg-green-100 text-green-700 border-green-200'
      : 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
      title={`Sentiment score: ${score.toFixed(2)} (${pct}%)`}
    >
      {label}
    </span>
  );
}

/**
 * Spike badge shown on cluster rows that have an active spike.
 */
function SpikeBadge({ severity }: { severity: SpikeSeverity | null }) {
  if (!severity) return null;
  const cls =
    severity === 'CRITICAL' || severity === 'HIGH'
      ? 'bg-red-100 text-red-700 border-red-200'
      : 'bg-orange-100 text-orange-700 border-orange-200';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      <Zap className="h-2.5 w-2.5" />
      Spike
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
  const { data: negativeTrends, isLoading: negLoading } = useSupportNegativeTrends(8);
  const { data: linkedThemes, isLoading: linkedLoading } = useSupportLinkedThemes();

  const syncMutation = useTriggerSupportSync();
  const sentimentMutation = useTriggerSentimentScoring();

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
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
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Support Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ticket clusters, spike alerts, sentiment trends, and feedback theme links.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => sentimentMutation.mutate()}
            disabled={sentimentMutation.isPending}
            title="Re-score all tickets and update cluster sentiment aggregates"
          >
            <Activity className={`mr-1.5 h-3.5 w-3.5 ${sentimentMutation.isPending ? 'animate-pulse' : ''}`} />
            {sentimentMutation.isPending ? 'Scoring…' : 'Score Sentiment'}
          </Button>
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

      {/* ── KPI Row ───────────────────────────────────────────────────────── */}
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

      {/* ── Section 2: Spike Alerts Banner ────────────────────────────────── */}
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

      {/* ── Main Grid: Section 1 (Top Issues) + Recent Tickets ───────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Section 1: Top Issue Clusters */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                Top Issue Clusters
              </CardTitle>
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
                  className={`flex items-center justify-between rounded-lg border px-3 py-2.5 hover:bg-muted/30 transition-colors ${
                    cluster.hasActiveSpike ? 'border-orange-200 bg-orange-50/40' : ''
                  } ${
                    cluster.avgSentiment != null && cluster.avgSentiment <= -0.4
                      ? 'border-red-200 bg-red-50/30'
                      : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-muted text-xs font-bold flex items-center justify-center text-muted-foreground">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate">{cluster.title}</p>
                        {cluster.hasActiveSpike && (
                          <SpikeBadge severity={cluster.latestSpikeSeverity} />
                        )}
                      </div>
                      {cluster.themeTitle && (
                        <p className="text-xs text-muted-foreground truncate">→ {cluster.themeTitle}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <SentimentPill score={cluster.avgSentiment} />
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
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Ticket className="h-4 w-4 text-muted-foreground" />
                Recent Tickets
              </CardTitle>
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

      {/* ── Section 3: Recent Negative Trends ────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              Recent Negative Trends
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              Clusters with the most negative average sentiment
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {negLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          ) : !negativeTrends || negativeTrends.length === 0 ? (
            <div className="py-8 text-center">
              <TrendingDown className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No negative trends detected. Run &ldquo;Score Sentiment&rdquo; to analyse ticket sentiment.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {negativeTrends.map((trend) => {
                const negPct = trend.negativeTicketPct != null
                  ? Math.round(trend.negativeTicketPct * 100)
                  : null;
                return (
                  <div
                    key={trend.id}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${
                      trend.hasActiveSpike ? 'border-red-200 bg-red-50/40' : 'hover:bg-muted/30'
                    } transition-colors`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate">{trend.title}</p>
                          {trend.hasActiveSpike && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                              <Zap className="h-2.5 w-2.5" />
                              Spike
                            </span>
                          )}
                        </div>
                        {trend.themeTitle && (
                          <p className="text-xs text-muted-foreground">→ {trend.themeTitle}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                      {negPct != null && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-red-500"
                              style={{ width: `${negPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-red-600 font-medium">{negPct}% neg.</span>
                        </div>
                      )}
                      <SentimentPill score={trend.avgSentiment} />
                      <span className="text-xs text-muted-foreground">{trend.ticketCount} tickets</span>
                      {trend.arrExposure > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {fmtArr(trend.arrExposure)}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Section 4: Linked Feedback Themes ────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              Linked Feedback Themes
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              Support clusters connected to product feedback themes
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {linkedLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          ) : !linkedThemes || linkedThemes.length === 0 ? (
            <div className="py-8 text-center">
              <Link2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No support clusters are linked to feedback themes yet.
                Run &ldquo;Sync Intelligence&rdquo; to auto-link clusters to themes.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {linkedThemes.map((lt) => (
                <div key={lt.themeId} className="rounded-lg border p-3 space-y-2">
                  {/* Theme header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Link2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      <span className="text-sm font-semibold truncate">{lt.themeTitle}</span>
                      {statusBadge(lt.themeStatus)}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-2 text-xs text-muted-foreground">
                      {lt.themeCiqScore != null && (
                        <span className="font-medium text-foreground">
                          CIQ {Math.round(lt.themeCiqScore)}
                        </span>
                      )}
                      <span>{lt.feedbackCount} feedback</span>
                      <span>{lt.totalTickets} tickets</span>
                    </div>
                  </div>
                  {/* Linked clusters */}
                  <div className="flex flex-wrap gap-2">
                    {lt.linkedClusters.map((c) => (
                      <div
                        key={c.id}
                        className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                          c.hasActiveSpike
                            ? 'border-orange-200 bg-orange-50 text-orange-800'
                            : c.avgSentiment != null && c.avgSentiment <= -0.4
                            ? 'border-red-200 bg-red-50 text-red-800'
                            : 'border-muted bg-muted/40 text-muted-foreground'
                        }`}
                      >
                        {c.hasActiveSpike && <Zap className="h-2.5 w-2.5" />}
                        <span className="font-medium truncate max-w-[140px]">{c.title}</span>
                        <span>({c.ticketCount})</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Quick Links ───────────────────────────────────────────────────── */}
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

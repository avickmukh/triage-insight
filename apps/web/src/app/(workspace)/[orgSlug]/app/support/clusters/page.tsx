'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Layers, RefreshCw, Zap, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/ui/card';
import { Badge } from '@/components/shared/ui/badge';
import { Button } from '@/components/shared/ui/button';
import { Skeleton } from '@/components/shared/ui/skeleton';
import { useSupportClusters, useTriggerRecluster, useTriggerSentimentScoring } from '@/hooks/use-support';
import { appRoutes } from '@/lib/routes';
import type { SpikeSeverity } from '@/lib/api-types';

function fmtArr(val: number) {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

function SentimentPill({ score }: { score: number | null }) {
  if (score == null) return null;
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
      title={`Avg sentiment: ${score.toFixed(2)}`}
    >
      {label}
    </span>
  );
}

function SpikeBadge({ severity }: { severity: SpikeSeverity | null }) {
  if (!severity) return null;
  const cls =
    severity === 'CRITICAL' || severity === 'HIGH'
      ? 'bg-red-100 text-red-700 border-red-200'
      : 'bg-orange-100 text-orange-700 border-orange-200';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      <Zap className="h-2.5 w-2.5" />
      {severity}
    </span>
  );
}

export default function SupportClustersPage() {
  const params = useParams();
  const slug = Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug ?? '';
  const r = appRoutes(slug);

  const { data: clusters, isLoading } = useSupportClusters(100);
  const reclusterMutation = useTriggerRecluster();
  const sentimentMutation = useTriggerSentimentScoring();

  // Counts for summary chips
  const spikeCount = clusters?.filter((c) => c.hasActiveSpike).length ?? 0;
  const negativeCount = clusters?.filter((c) => c.avgSentiment != null && c.avgSentiment <= -0.4).length ?? 0;
  const linkedCount = clusters?.filter((c) => c.themeId != null).length ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={r.support.overview}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Issue Clusters</h1>
            <p className="text-sm text-muted-foreground">
              TF-IDF keyword clusters grouped from support tickets, enriched with sentiment and spike detection.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => sentimentMutation.mutate()}
            disabled={sentimentMutation.isPending}
            title="Re-score all ticket sentiment and update cluster aggregates"
          >
            <Activity className={`mr-1.5 h-3.5 w-3.5 ${sentimentMutation.isPending ? 'animate-pulse' : ''}`} />
            {sentimentMutation.isPending ? 'Scoring…' : 'Score Sentiment'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => reclusterMutation.mutate()}
            disabled={reclusterMutation.isPending}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${reclusterMutation.isPending ? 'animate-spin' : ''}`} />
            {reclusterMutation.isPending ? 'Reclustering…' : 'Recluster'}
          </Button>
        </div>
      </div>

      {/* Summary chips */}
      {clusters && clusters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium">
            <Layers className="h-3 w-3" />
            {clusters.length} clusters
          </span>
          {linkedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
              {linkedCount} linked to themes
            </span>
          )}
          {spikeCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 text-orange-700 px-3 py-1 text-xs font-medium">
              <Zap className="h-3 w-3" />
              {spikeCount} active spike{spikeCount > 1 ? 's' : ''}
            </span>
          )}
          {negativeCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 text-red-700 px-3 py-1 text-xs font-medium">
              {negativeCount} high-negative cluster{negativeCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Layers className="h-4 w-4" />
            All Clusters
            {clusters && (
              <Badge variant="secondary" className="ml-1">{clusters.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : !clusters || clusters.length === 0 ? (
            <div className="py-12 text-center">
              <Layers className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No clusters yet. Sync support tickets to generate clusters.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {clusters.map((cluster, idx) => {
                const isHighNegative = cluster.avgSentiment != null && cluster.avgSentiment <= -0.4;
                const hasSpike = cluster.hasActiveSpike;
                const rowClass = hasSpike && isHighNegative
                  ? 'border-red-300 bg-red-50/50'
                  : hasSpike
                  ? 'border-orange-200 bg-orange-50/40'
                  : isHighNegative
                  ? 'border-red-200 bg-red-50/30'
                  : 'hover:bg-muted/30';

                return (
                  <div
                    key={cluster.id}
                    className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-colors ${rowClass}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex-shrink-0 text-xs font-bold text-muted-foreground w-5 text-right">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium">{cluster.title}</p>
                          {hasSpike && <SpikeBadge severity={cluster.latestSpikeSeverity} />}
                          {isHighNegative && !hasSpike && (
                            <span className="inline-flex items-center rounded-full border border-red-200 bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                              High Negative
                            </span>
                          )}
                        </div>
                        {cluster.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-md">{cluster.description}</p>
                        )}
                        {cluster.themeTitle && (
                          <p className="text-xs text-primary mt-0.5">→ Linked: {cluster.themeTitle}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      <SentimentPill score={cluster.avgSentiment} />
                      {cluster.negativeTicketPct != null && cluster.negativeTicketPct > 0.3 && (
                        <span className="text-xs text-red-600 font-medium">
                          {Math.round(cluster.negativeTicketPct * 100)}% neg.
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">{cluster.ticketCount} tickets</span>
                      {cluster.arrExposure > 0 && (
                        <Badge variant="outline" className="text-xs font-medium">
                          {fmtArr(cluster.arrExposure)} ARR
                        </Badge>
                      )}
                      {!cluster.themeId && (
                        <Badge variant="secondary" className="text-xs">Unlinked</Badge>
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

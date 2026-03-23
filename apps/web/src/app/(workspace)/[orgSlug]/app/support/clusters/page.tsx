'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Layers, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/ui/card';
import { Badge } from '@/components/shared/ui/badge';
import { Button } from '@/components/shared/ui/button';
import { Skeleton } from '@/components/shared/ui/skeleton';
import { useSupportClusters, useTriggerRecluster } from '@/hooks/use-support';
import { appRoutes } from '@/lib/routes';

function fmtArr(val: number) {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

export default function SupportClustersPage() {
  const params = useParams();
  const slug = Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug ?? '';
  const r = appRoutes(slug);

  const { data: clusters, isLoading } = useSupportClusters(100);
  const reclusterMutation = useTriggerRecluster();

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
            <h1 className="text-xl font-bold tracking-tight">Issue Clusters</h1>
            <p className="text-sm text-muted-foreground">TF-IDF keyword clusters grouped from support tickets.</p>
          </div>
        </div>
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
              {clusters.map((cluster, idx) => (
                <div
                  key={cluster.id}
                  className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex-shrink-0 text-xs font-bold text-muted-foreground w-5 text-right">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{cluster.title}</p>
                      {cluster.description && (
                        <p className="text-xs text-muted-foreground truncate max-w-md">{cluster.description}</p>
                      )}
                      {cluster.themeTitle && (
                        <p className="text-xs text-primary mt-0.5">→ Linked: {cluster.themeTitle}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

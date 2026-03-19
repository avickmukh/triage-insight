import { TicketClusterData } from "./types";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/shared/ui/card";
import { Button } from "@/components/shared/ui/button";
import { Badge } from "@/components/shared/ui/badge";
import Link from "next/link";
import { appRoutes } from "@/lib/routes";

interface TicketClusterProps {
  cluster: TicketClusterData;
  orgSlug: string;
}

export function TicketCluster({ cluster, orgSlug }: TicketClusterProps) {
  const r = appRoutes(orgSlug);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{cluster.title}</CardTitle>
        <CardDescription>
          {cluster.ticketCount} tickets, last seen {new Date(cluster.lastSeen).toLocaleDateString()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {cluster.correlatedThemeId ? (
          <div className="flex items-center gap-2">
            <span className="text-sm">Correlated Theme:</span>
            <Link href={r.themeItem(cluster.correlatedThemeId!)}>
              <Badge variant="secondary">{cluster.correlatedThemeTitle}</Badge>
            </Link>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Not correlated to any feedback theme.</p>
        )}
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        <Button variant="outline">Ignore</Button>
        <Button>Create Feedback Theme</Button>
      </CardFooter>
    </Card>
  );
}

import { ThemeClusterData } from "./types";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/shared/ui/card";
import { Button } from "@/components/shared/ui/button";

interface ThemeClusterProps {
  theme: ThemeClusterData;
}

export function ThemeCluster({ theme }: ThemeClusterProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{theme.title}</CardTitle>
        <CardDescription>{theme.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold">{theme.feedbackCount}</p>
          <p className="text-xs text-muted-foreground">Feedback</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{theme.customerCount}</p>
          <p className="text-xs text-muted-foreground">Customers</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{theme.priorityScore.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">Priority</p>
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="outline" className="w-full">View Details</Button>
      </CardFooter>
    </Card>
  );
}

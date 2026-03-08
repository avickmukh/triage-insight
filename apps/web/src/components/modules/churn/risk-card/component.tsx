import { RiskCardData } from "./types";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/shared/ui/card";
import { Button } from "@/components/shared/ui/button";
import { Badge } from "@/components/shared/ui/badge";
import { cn } from "@/lib/utils";

interface RiskCardProps {
  customer: RiskCardData;
}

const RISK_COLORS = {
  High: "bg-red-500",
  Medium: "bg-yellow-500",
  Low: "bg-green-500",
};

export function RiskCard({ customer }: RiskCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{customer.customerName}</CardTitle>
          <Badge variant="destructive" className={cn(RISK_COLORS[customer.riskLevel])}>
            {customer.riskLevel} Risk
          </Badge>
        </div>
        <CardDescription>${customer.arr.toLocaleString()} ARR</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm font-medium">Primary Risk Factor</p>
        <p className="text-sm text-muted-foreground">{customer.reason}</p>
      </CardContent>
      <CardFooter>
        <Button variant="secondary" className="w-full">View Details</Button>
      </CardFooter>
    </Card>
  );
}

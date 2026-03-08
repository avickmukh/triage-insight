import { SpikeAlertData } from "./types";
import { Alert, AlertDescription, AlertTitle } from "@/components/shared/ui/alert";
import { TrendingUp } from "lucide-react";

interface SpikeAlertProps {
  alert: SpikeAlertData;
}

export function SpikeAlert({ alert }: SpikeAlertProps) {
  return (
    <Alert>
      <TrendingUp className="h-4 w-4" />
      <AlertTitle>Spike Detected: {alert.clusterTitle}</AlertTitle>
      <AlertDescription>
        {alert.ticketCountInPeriod} tickets since {new Date(alert.periodStartDate).toLocaleDateString()}, 
        a {alert.spikeScore.toFixed(1)}x deviation from the baseline. 
        This may indicate a new or growing product issue.
      </AlertDescription>
    </Alert>
  );
}

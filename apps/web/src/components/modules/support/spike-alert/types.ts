export interface SpikeAlertData {
  id: string;
  clusterId: string;
  clusterTitle: string;
  spikeScore: number; // z-score
  ticketCountInPeriod: number;
  periodStartDate: Date;
}

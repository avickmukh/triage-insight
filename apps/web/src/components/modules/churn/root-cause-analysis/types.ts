export interface RootCause {
  category: string;
  description: string;
  contributingFactor: number; // 0-1
}

export interface RootCauseAnalysisData {
  customerId: string;
  causes: RootCause[];
}

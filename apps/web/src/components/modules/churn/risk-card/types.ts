export interface RiskCardData {
  customerId: string;
  customerName: string;
  riskLevel: 'High' | 'Medium' | 'Low';
  riskScore: number; // 0-1
  reason: string;
  arr: number;
}

export interface ScoreBreakdownComponent {
  value: number;
  weight: number;
  contribution: number;
  label: string;
}

export interface ThemeCiqScore {
  entityType: 'theme';
  entityId: string;
  ciqScore: number;
  ciqBand: 'Critical' | 'High' | 'Medium' | 'Low';
  priorityLabel: string;
  dominantDriver: string | null;
  breakdown: Record<string, ScoreBreakdownComponent>;
  scoreVersion: string;
  computedAt: Date;
  lastScoredAt: Date | null;
}

export interface FeedbackUrgencyScore {
  entityType: 'feedback';
  entityId: string;
  urgencyScore: number;
  urgencyBand: 'Critical' | 'High' | 'Medium' | 'Low';
  dominantDriver: string | null;
  breakdown: Record<string, ScoreBreakdownComponent>;
  computedAt: Date;
}

export interface DecisionPriorityScore {
  entityType: 'theme' | 'roadmap_candidate';
  entityId: string;
  decisionPriorityScore: number;
  decisionPriorityBand: 'Critical' | 'High' | 'Medium' | 'Low';
  dominantDriver: string | null;
  breakdown: Record<string, ScoreBreakdownComponent>;
  computedAt: Date;
}

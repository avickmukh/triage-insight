export interface InterventionSuggestion {
  id: string;
  title: string;
  description: string;
  impact: 'High' | 'Medium' | 'Low';
  effort: 'High' | 'Medium' | 'Low';
}

export interface InterventionPanelData {
  customerId: string;
  suggestions: InterventionSuggestion[];
}

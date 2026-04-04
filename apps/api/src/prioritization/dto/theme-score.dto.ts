import { Theme } from '@prisma/client';

export class ThemeScoreDto {
  theme: Theme;
  priorityScore: number;
  revenueImpactValue: number;
  dealInfluenceValue: number;
  scoreExplanation: Record<
    string,
    { value: number; weight: number; score: number }
  >;
}

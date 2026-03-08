import { Injectable } from "@nestjs/common";
import { PrioritizationSettings } from "@prisma/client";
import { ThemeData } from "./aggregation.service";

export interface ScoreComponent {
  value: number;
  weight: number;
  score: number;
}

export interface ScoreOutput {
  priorityScore: number;
  revenueImpactValue: number;
  dealInfluenceValue: number;
  scoreExplanation: Record<string, ScoreComponent>;
}

@Injectable()
export class ScoringService {
  calculateScore(settings: PrioritizationSettings, data: ThemeData, strategicWeight: number = 0): ScoreOutput {
    const explanation: Record<string, ScoreComponent> = {};

    const addScore = (key: keyof PrioritizationSettings, value: number) => {
      const weight = settings[key] as number;
      explanation[key] = {
        value,
        weight,
        score: value * weight,
      };
    };

    addScore("requestFrequencyWeight", data.requestFrequency);
    addScore("customerCountWeight", data.uniqueCustomerCount);
    addScore("arrValueWeight", data.arrValue);
    addScore("accountPriorityWeight", data.accountPriorityValue);
    addScore("dealValueWeight", data.dealInfluenceValue);
    addScore("strategicWeight", strategicWeight);

    const totalScore = Object.values(explanation).reduce((sum, item) => sum + item.score, 0);

    return {
      priorityScore: totalScore,
      revenueImpactValue: data.arrValue,
      dealInfluenceValue: data.dealInfluenceValue,
      scoreExplanation: explanation,
    };
  }
}

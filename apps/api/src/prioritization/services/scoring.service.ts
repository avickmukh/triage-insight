import { Injectable, Logger } from "@nestjs/common";
import { PrioritizationSettings } from "@prisma/client";
import { ThemeData } from "./aggregation.service";

export interface ScoreComponent {
  /** Raw input value before weighting (e.g., number of requests, ARR in dollars) */
  value: number;
  /** Normalised input value in the 0–100 range used for scoring */
  normalisedValue: number;
  /** Weight assigned to this component by workspace settings (0–1) */
  weight: number;
  /** Weighted contribution to the final score (normalisedValue * weight) */
  contribution: number;
  /** Human-readable label for this component */
  label: string;
}

export interface ScoreOutput {
  /** Final priority score in the 0–100 range */
  priorityScore: number;
  /** Raw ARR value from the aggregated theme data */
  revenueImpactValue: number;
  /** Raw deal influence value from the aggregated theme data */
  dealInfluenceValue: number;
  /**
   * Explainable breakdown of each scoring dimension.
   * Keys correspond to the weight field names in PrioritizationSettings.
   */
  scoreExplanation: Record<string, ScoreComponent>;
  /**
   * Dominant driver of the score — the component with the highest contribution.
   * Useful for surfacing a one-line explanation in the UI.
   */
  dominantDriver: string;
}

/**
 * Clamp a value to the [min, max] range.
 */
function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Normalise a raw value to a 0–100 scale using a log-based transform.
 * This prevents a single outlier from dominating the score.
 *
 * @param value  Raw input value (non-negative)
 * @param scale  Expected order-of-magnitude for the input (e.g., 1000 for ARR)
 */
function logNorm(value: number, scale: number): number {
  if (value <= 0 || scale <= 0) return 0;
  return clamp((Math.log1p(value) / Math.log1p(scale)) * 100);
}

/**
 * Normalise a raw count to a 0–100 scale using a simple linear transform
 * capped at `cap`.
 */
function linearNorm(value: number, cap: number): number {
  if (cap <= 0) return 0;
  return clamp((value / cap) * 100);
}

/**
 * ScoringService
 *
 * Computes a 0–100 priority score for a theme using a configurable weighted
 * formula. Each scoring dimension is normalised before weighting so that
 * dimensions with different scales (e.g., request counts vs. ARR in dollars)
 * contribute proportionally.
 *
 * Weights are normalised to sum to 1.0 to ensure the final score always
 * falls in the 0–100 range regardless of the configured weight values.
 *
 * The `scoreExplanation` field provides a full breakdown of each dimension's
 * contribution, enabling transparent, auditable prioritisation decisions.
 */
@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  calculateScore(
    settings: PrioritizationSettings,
    data: ThemeData,
    strategicWeight: number = 0,
  ): ScoreOutput {
    // ── 1. Define dimensions ──────────────────────────────────────────────────

    const dimensions: Array<{
      key: string;
      label: string;
      rawValue: number;
      normalisedValue: number;
      configuredWeight: number;
    }> = [
      {
        key: "requestFrequencyWeight",
        label: "Request frequency",
        rawValue: data.requestFrequency,
        normalisedValue: linearNorm(data.requestFrequency, 200),
        configuredWeight: settings.requestFrequencyWeight,
      },
      {
        key: "customerCountWeight",
        label: "Unique customers",
        rawValue: data.uniqueCustomerCount,
        normalisedValue: linearNorm(data.uniqueCustomerCount, 100),
        configuredWeight: settings.customerCountWeight,
      },
      {
        key: "arrValueWeight",
        label: "ARR at stake",
        rawValue: data.arrValue,
        normalisedValue: logNorm(data.arrValue, 1_000_000),
        configuredWeight: settings.arrValueWeight,
      },
      {
        key: "accountPriorityWeight",
        label: "Account priority",
        rawValue: data.accountPriorityValue,
        normalisedValue: linearNorm(data.accountPriorityValue, 500),
        configuredWeight: settings.accountPriorityWeight,
      },
      {
        key: "dealValueWeight",
        label: "Deal influence",
        rawValue: data.dealInfluenceValue,
        normalisedValue: logNorm(data.dealInfluenceValue, 500_000),
        configuredWeight: settings.dealValueWeight,
      },
      {
        key: "strategicWeight",
        label: "Strategic alignment",
        rawValue: strategicWeight,
        normalisedValue: clamp(strategicWeight * 100),
        configuredWeight: settings.strategicWeight,
      },
    ];

    // ── 2. Normalise weights to sum to 1.0 ────────────────────────────────────

    const totalWeight = dimensions.reduce((sum, d) => sum + d.configuredWeight, 0);
    const normalisedWeights = totalWeight > 0
      ? dimensions.map((d) => d.configuredWeight / totalWeight)
      : dimensions.map(() => 1 / dimensions.length);

    // ── 3. Build explanation and compute total score ──────────────────────────

    const explanation: Record<string, ScoreComponent> = {};
    let totalScore = 0;
    let dominantDriver = dimensions[0].key;
    let maxContribution = -Infinity;

    dimensions.forEach((dim, i) => {
      const weight = normalisedWeights[i];
      const contribution = dim.normalisedValue * weight;
      totalScore += contribution;

      explanation[dim.key] = {
        value: dim.rawValue,
        normalisedValue: parseFloat(dim.normalisedValue.toFixed(2)),
        weight: parseFloat(weight.toFixed(4)),
        contribution: parseFloat(contribution.toFixed(2)),
        label: dim.label,
      };

      if (contribution > maxContribution) {
        maxContribution = contribution;
        dominantDriver = dim.key;
      }
    });

    const finalScore = clamp(parseFloat(totalScore.toFixed(2)));

    this.logger.debug(
      `Score for theme ${data.themeId}: ${finalScore} (dominant: ${dominantDriver})`,
    );

    return {
      priorityScore: finalScore,
      revenueImpactValue: data.arrValue,
      dealInfluenceValue: data.dealInfluenceValue,
      scoreExplanation: explanation,
      dominantDriver,
    };
  }
}

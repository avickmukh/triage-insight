/**
 * ExecutiveInsightService
 *
 * Generates the Executive Weekly Summary using rule-based CIQ synthesis.
 * MVP implementation — no LLM dependency. Produces narrative-tone summaries
 * from the aggregated dashboard data.
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  ProductDirectionSummary,
  EmergingThemeRadar,
  RevenueRiskIndicator,
  VoiceSentimentSignal,
  SupportPressureIndicator,
  RoadmapHealthPanel,
  ExecutiveSummary,
} from './dashboard-aggregation.service';

@Injectable()
export class ExecutiveInsightService {
  private readonly logger = new Logger(ExecutiveInsightService.name);

  /**
   * Synthesise an executive summary from all 5 intelligence surfaces.
   * Rule-based MVP — deterministic, no LLM calls.
   */
  synthesise(
    productDirection: ProductDirectionSummary,
    emergingThemes:   EmergingThemeRadar,
    revenueRisk:      RevenueRiskIndicator,
    voiceSentiment:   VoiceSentimentSignal,
    supportPressure:  SupportPressureIndicator,
    roadmapHealth:    RoadmapHealthPanel,
  ): ExecutiveSummary {
    const keyInsights: string[] = [];
    let riskAlert: string | null = null;
    let topAction = 'Review the Intelligence Hub for detailed recommendations.';

    // ── Product direction insight ──────────────────────────────────────────
    if (productDirection.topFeatures.length > 0) {
      const top = productDirection.topFeatures[0];
      keyInsights.push(
        `"${top.title}" is the highest-priority feature request with a CIQ score of ${top.ciqScore} and ${top.voteCount} votes.`,
      );
      topAction = `Prioritise "${top.title}" — ${top.rationale}`;
    }

    // ── Emerging theme insight ─────────────────────────────────────────────
    if (emergingThemes.emergingThemes.length > 0) {
      const fastest = emergingThemes.emergingThemes[0];
      keyInsights.push(
        `Theme "${fastest.title}" is accelerating with ${fastest.feedbackDelta7d} new signals this week (velocity score: ${fastest.velocityScore}).`,
      );
    }
    if (emergingThemes.spikeEvents.length > 0) {
      const spike = emergingThemes.spikeEvents[0];
      keyInsights.push(
        `Support spike detected in "${spike.clusterTitle}" — ${spike.ticketCount} tickets (z-score: ${spike.zScore}).`,
      );
      riskAlert = `Active support spike in "${spike.clusterTitle}". Immediate review recommended.`;
    }

    // ── Revenue risk insight ───────────────────────────────────────────────
    if (revenueRisk.totalArrAtRisk > 0) {
      const arrFormatted = revenueRisk.totalArrAtRisk >= 1_000_000
        ? `$${(revenueRisk.totalArrAtRisk / 1_000_000).toFixed(1)}M`
        : `$${Math.round(revenueRisk.totalArrAtRisk / 1000)}k`;
      keyInsights.push(
        `${revenueRisk.totalCustomersAtRisk} customers at churn risk representing ${arrFormatted} ARR.`,
      );
      if (!riskAlert && revenueRisk.totalArrAtRisk > 50_000) {
        riskAlert = `${arrFormatted} ARR at risk from ${revenueRisk.totalCustomersAtRisk} at-risk customers.`;
      }
    }

    // ── Voice sentiment insight ────────────────────────────────────────────
    if (voiceSentiment.negativeTrendIndicator) {
      keyInsights.push(
        `Negative sentiment is ${voiceSentiment.sentimentTrend} — ${Math.round(voiceSentiment.negativeFraction * 100)}% of recent feedback is negative.`,
      );
    } else if (voiceSentiment.sentimentTrend === 'improving') {
      keyInsights.push(`Customer sentiment is improving — overall score ${voiceSentiment.overallSentimentScore.toFixed(0)}/100.`);
    }

    // ── Support pressure insight ───────────────────────────────────────────
    if (supportPressure.ticketTrend === 'increasing') {
      keyInsights.push(
        `Support ticket volume is increasing (+${supportPressure.ticketDelta7d} this week). ${supportPressure.activeSpikeCount} active spike events.`,
      );
    }

    // ── Roadmap health insight ─────────────────────────────────────────────
    if (roadmapHealth.healthLabel === 'critical') {
      keyInsights.push(`Roadmap health is critical (score: ${roadmapHealth.healthScore}/100). ${roadmapHealth.delayedCriticalItems.length} delayed items require attention.`);
    } else if (roadmapHealth.opportunityGaps.length > 0) {
      keyInsights.push(`${roadmapHealth.opportunityGaps.length} high-priority themes have no roadmap commitment.`);
    }

    // ── Week summary (narrative) ───────────────────────────────────────────
    const weekSummary = this.buildWeekSummary(
      productDirection, emergingThemes, revenueRisk, voiceSentiment, supportPressure, roadmapHealth,
    );

    // ── Momentum signal ────────────────────────────────────────────────────
    const momentumSignal = this.buildMomentumSignal(
      emergingThemes, voiceSentiment, roadmapHealth,
    );

    // ── Product direction note ─────────────────────────────────────────────
    const productDirectionNote = productDirection.topFeatures.length >= 3
      ? `Three features are ready for roadmap commitment: ${productDirection.topFeatures.map((f) => `"${f.title}"`).join(', ')}.`
      : productDirection.topFeatures.length === 1
      ? `One feature stands out for immediate roadmap consideration: "${productDirection.topFeatures[0].title}".`
      : 'Insufficient CIQ data for product direction. Run a full recompute.';

    return {
      generatedAt:          new Date().toISOString(),
      weekSummary,
      keyInsights:          keyInsights.slice(0, 5),
      topAction,
      riskAlert,
      momentumSignal,
      productDirectionNote,
    };
  }

  private buildWeekSummary(
    pd: ProductDirectionSummary,
    et: EmergingThemeRadar,
    rr: RevenueRiskIndicator,
    vs: VoiceSentimentSignal,
    sp: SupportPressureIndicator,
    rh: RoadmapHealthPanel,
  ): string {
    const parts: string[] = [];

    // Product
    if (pd.topFeatures.length > 0) {
      parts.push(`Product intelligence identified ${pd.scoredFeedbackCount} scored requests, with "${pd.topFeatures[0].title}" leading the CIQ ranking.`);
    }

    // Emerging
    if (et.emergingThemes.length > 0) {
      const newThemes = et.emergingThemes.filter((t) => t.isNew).length;
      parts.push(
        newThemes > 0
          ? `${newThemes} new theme${newThemes > 1 ? 's' : ''} emerged this week.`
          : `${et.emergingThemes.length} theme${et.emergingThemes.length > 1 ? 's are' : ' is'} gaining velocity.`,
      );
    }

    // Revenue
    if (rr.totalArrAtRisk > 0) {
      const arr = rr.totalArrAtRisk >= 1_000_000
        ? `$${(rr.totalArrAtRisk / 1_000_000).toFixed(1)}M`
        : `$${Math.round(rr.totalArrAtRisk / 1000)}k`;
      parts.push(`Revenue risk stands at ${arr} across ${rr.totalCustomersAtRisk} at-risk accounts.`);
    }

    // Sentiment
    if (vs.sentimentTrend !== 'stable') {
      parts.push(`Customer sentiment is ${vs.sentimentTrend} (${vs.overallSentimentScore.toFixed(0)}/100).`);
    }

    // Support
    if (sp.ticketTrend === 'increasing' || sp.activeSpikeCount > 0) {
      parts.push(`Support pressure is elevated with ${sp.openTicketCount} open tickets.`);
    }

    // Roadmap
    parts.push(
      rh.healthLabel === 'healthy'
        ? `Roadmap is healthy — ${rh.shippedCount} items shipped (${Math.round(rh.shippedRatio * 100)}% delivery rate).`
        : `Roadmap health is ${rh.healthLabel} with ${rh.delayedCriticalItems.length} delayed critical items.`,
    );

    return parts.join(' ');
  }

  private buildMomentumSignal(
    et: EmergingThemeRadar,
    vs: VoiceSentimentSignal,
    rh: RoadmapHealthPanel,
  ): string {
    if (et.emergingThemes.some((t) => t.velocityScore >= 50)) {
      return `Strong momentum: "${et.emergingThemes[0].title}" is accelerating rapidly.`;
    }
    if (vs.sentimentTrend === 'improving' && rh.shippedRatio >= 0.3) {
      return 'Positive momentum: sentiment improving and delivery on track.';
    }
    if (rh.healthLabel === 'healthy') {
      return 'Steady execution: roadmap delivery is on track.';
    }
    return 'Momentum is mixed — review prioritization and roadmap commitments.';
  }
}

/**
 * SurveyIntelligenceProcessor
 *
 * Responsibility (post-refactor):
 *   Compute CIQ weight, revenue weight, sentiment score, and CustomerSignal
 *   records for a survey response.
 *
 * What this processor does NOT do any more:
 *   • Theme clustering — open-text Feedback records now enter AI_ANALYSIS_QUEUE
 *     directly from submitResponse(), which runs the standard embedding +
 *     theme-clustering pipeline. No bespoke clustering here.
 *   • Text extraction / LLM re-analysis of the combined blob — each open-text
 *     answer is already a properly titled Feedback record with its own AI job.
 *
 * The processor still reads SurveyEvidence rows (for numeric signals) and
 * updates SurveyResponse with aggregate CIQ/revenue metadata.
 */
import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { SurveyIntelligenceService } from '../services/survey-intelligence.service';

export const SURVEY_INTELLIGENCE_QUEUE = 'survey-intelligence';

export interface SurveyIntelligenceJobData {
  workspaceId: string;
  surveyId: string;
  responseId: string;
  /** First open-text Feedback id created for this response, if any. */
  feedbackId?: string | null;
}

@Processor(SURVEY_INTELLIGENCE_QUEUE)
export class SurveyIntelligenceProcessor {
  private readonly logger = new Logger(SurveyIntelligenceProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly intelligenceService: SurveyIntelligenceService,
  ) {}

  @Process()
  async handle(job: Job<SurveyIntelligenceJobData>): Promise<void> {
    const { workspaceId, surveyId, responseId } = job.data;
    this.logger.log(`Survey intelligence: processing response ${responseId}`);

    try {
      // ── 1. Load response with raw answers and question metadata ─────────────
      const response = await this.prisma.surveyResponse.findUnique({
        where: { id: responseId },
        include: {
          answers: {
            include: {
              question: { select: { label: true, type: true } },
            },
          },
          survey: { select: { title: true, surveyType: true } },
        },
      });

      if (!response) {
        this.logger.warn(`Survey response ${responseId} not found — skipping`);
        return;
      }

      // ── 2. Build answer input for the intelligence service ───────────────────
      //    Only numeric and choice answers are needed here; text analysis is
      //    handled by the main AI pipeline for each Feedback record.
      const answerInputs = response.answers.map((a) => ({
        questionLabel: a.question.label,
        questionType: a.question.type as string,
        textValue: a.textValue ?? null,
        numericValue: a.numericValue ?? null,
        choiceValues: a.choiceValues,
      }));

      // ── 3. Extract intelligence (sentiment + numeric signals) ────────────────
      const intelligence = await this.intelligenceService.extractFromAnswers(
        answerInputs,
        response.survey.title,
      );

      // ── 4. Compute CIQ weight and revenue weight ─────────────────────────────
      const customerData = response.customerId
        ? await this.prisma.customer.findUnique({
            where: { id: response.customerId },
            select: { arrValue: true },
          })
        : null;

      const maxArrResult = await this.prisma.customer.aggregate({
        where: { workspaceId },
        _max: { arrValue: true },
      });
      const arrValue = customerData?.arrValue ?? 0;
      const maxArr = maxArrResult._max.arrValue ?? 1;

      const ciqWeight = this.intelligenceService.computeCiqWeight({
        arrValue,
        maxArrInWorkspace: maxArr,
        sentimentScore: intelligence.aggregateSentiment,
        surveyType: response.survey.surveyType as string,
      });

      const allResponses = await this.prisma.surveyResponse.findMany({
        where: { surveyId },
        select: { customerId: true },
      });
      const customerIds = allResponses
        .map((r) => r.customerId)
        .filter(Boolean) as string[];
      const totalArrResult =
        customerIds.length > 0
          ? await this.prisma.customer.aggregate({
              where: { id: { in: customerIds } },
              _sum: { arrValue: true },
            })
          : { _sum: { arrValue: 0 } };
      const totalSurveyArr = totalArrResult._sum.arrValue ?? 0;

      const clusterLabel =
        intelligence.aggregateSentiment > 0.3
          ? 'Promoter'
          : intelligence.aggregateSentiment < -0.3
            ? 'Detractor'
            : 'Neutral';

      // ── 5. Persist CIQ/revenue metadata back to the response ────────────────
      await this.prisma.surveyResponse.update({
        where: { id: responseId },
        data: {
          ciqWeight,
          sentimentScore: intelligence.aggregateSentiment,
          revenueWeight: totalSurveyArr > 0 ? arrValue / totalSurveyArr : 0,
          clusterLabel,
          metadata: {
            ...(typeof response.metadata === 'object' &&
            response.metadata !== null
              ? (response.metadata as Record<string, unknown>)
              : {}),
            intelligence: {
              aggregateSentiment: intelligence.aggregateSentiment,
              aggregateConfidence: intelligence.aggregateConfidence,
              keyTopics: intelligence.keyTopics,
              numericSignalsCount: intelligence.numericSignals.length,
              processedAt: new Date().toISOString(),
            },
          },
        },
      });

      // ── 6. Detect churn signal for negative NPS / sentiment ─────────────────
      try {
        const customerId =
          response.customerId ??
          (response.portalUserId
            ? (
                await this.prisma.portalUser.findUnique({
                  where: { id: response.portalUserId },
                  select: { customerId: true },
                })
              )?.customerId
            : null);

        if (customerId && intelligence.aggregateSentiment < -0.3) {
          const npsAnswer = response.answers.find(
            (a) => a.question.type === 'NPS',
          );
          const npsVal = npsAnswer?.numericValue ?? null;
          const isChurnRisk = npsVal != null ? npsVal <= 6 : true;
          if (isChurnRisk) {
            await this.prisma.customerSignal
              .create({
                data: {
                  workspaceId,
                  customerId,
                  signalType: 'CHURN_RISK',
                  sourceId: responseId,
                  strength: Math.abs(intelligence.aggregateSentiment),
                  metadata: {
                    label: `Survey churn signal: sentiment ${intelligence.aggregateSentiment.toFixed(2)}`,
                    surveyId,
                    responseId,
                    npsVal,
                    surveyType: response.survey.surveyType,
                  },
                } as any,
              })
              .catch((err: Error) => {
                this.logger.warn(
                  `Failed to create churn CustomerSignal: ${err.message}`,
                );
              });
          }
        }
      } catch (err) {
        this.logger.warn(
          `Churn signal detection failed for response ${responseId}: ${(err as Error).message}`,
        );
      }

      // ── 7. Create CustomerSignal records for numeric answers ─────────────────
      if (response.portalUserId) {
        const portalUser = await this.prisma.portalUser.findUnique({
          where: { id: response.portalUserId },
          select: { customerId: true },
        });

        if (portalUser?.customerId) {
          const customerId = portalUser.customerId;

          for (const signal of intelligence.numericSignals) {
            await this.prisma.customerSignal
              .create({
                data: {
                  workspaceId,
                  customerId,
                  signalType: 'SURVEY_RATING',
                  sourceId: responseId,
                  strength: signal.normalisedValue,
                  metadata: {
                    label: signal.label,
                    rawValue: signal.rawValue,
                    sentimentEquivalent: signal.sentimentEquivalent,
                    surveyId,
                    responseId,
                  },
                } as any,
              })
              .catch((err: Error) => {
                this.logger.warn(
                  `Failed to create CustomerSignal: ${err.message}`,
                );
              });
          }
        }
      }

      this.logger.log(
        `Survey intelligence complete for response ${responseId}`,
      );
    } catch (err) {
      this.logger.error(
        `Survey intelligence processor failed for response ${responseId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      // Do not rethrow — a failed intelligence job must not block the user's submission
    }
  }
}

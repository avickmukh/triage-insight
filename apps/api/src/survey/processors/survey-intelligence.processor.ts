import { Process, Processor } from '@nestjs/bull';
import { InjectQueue } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { SurveyIntelligenceService } from '../services/survey-intelligence.service';
import { ThemeClusteringService } from '../../ai/services/theme-clustering.service';
import { CIQ_SCORING_QUEUE, type CiqJobPayload } from '../../ai/processors/ciq-scoring.processor';

export const SURVEY_INTELLIGENCE_QUEUE = 'survey-intelligence';

export interface SurveyIntelligenceJobData {
  workspaceId: string;
  surveyId: string;
  responseId: string;
  feedbackId?: string | null;
}

@Processor(SURVEY_INTELLIGENCE_QUEUE)
export class SurveyIntelligenceProcessor {
  private readonly logger = new Logger(SurveyIntelligenceProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly intelligenceService: SurveyIntelligenceService,
    private readonly themeClusteringService: ThemeClusteringService,
    @InjectQueue(CIQ_SCORING_QUEUE) private readonly ciqQueue: Queue,
  ) {}

  @Process()
  async handle(job: Job<SurveyIntelligenceJobData>): Promise<void> {
    const { workspaceId, surveyId, responseId, feedbackId } = job.data;
    this.logger.log(`Processing survey intelligence for response ${responseId}`);

    try {
      // ── 1. Load response with answers and question metadata ──────────────────
      const response = await this.prisma.surveyResponse.findUnique({
        where: { id: responseId },
        include: {
          answers: {
            include: {
              question: { select: { label: true, type: true } },
            },
          },
          survey: { select: { title: true, convertToFeedback: true } },
        },
      });

      if (!response) {
        this.logger.warn(`Survey response ${responseId} not found — skipping`);
        return;
      }

      // ── 2. Build answer input for intelligence service ───────────────────────
      const answerInputs = response.answers.map((a) => ({
        questionLabel: a.question.label,
        questionType: a.question.type as string,
        textValue: a.textValue ?? null,
        numericValue: a.numericValue ?? null,
        choiceValues: a.choiceValues,
      }));

      // ── 3. Extract intelligence ──────────────────────────────────────────────
      const intelligence = await this.intelligenceService.extractFromAnswers(
        answerInputs,
        response.survey.title,
      );

      // ── 4. Persist intelligence back to the response metadata ────────────────
      await this.prisma.surveyResponse.update({
        where: { id: responseId },
        data: {
          metadata: {
            ...(typeof response.metadata === 'object' && response.metadata !== null
              ? (response.metadata as Record<string, unknown>)
              : {}),
            intelligence: {
              aggregateSentiment: intelligence.aggregateSentiment,
              aggregateConfidence: intelligence.aggregateConfidence,
              keyTopics: intelligence.keyTopics,
              textInsightsCount: intelligence.textInsights.length,
              numericSignalsCount: intelligence.numericSignals.length,
              processedAt: new Date().toISOString(),
            },
          },
        },
      });

      // ── 5. Enrich the linked Feedback record if present ──────────────────────
      if (feedbackId) {
        const firstTextInsight = intelligence.textInsights[0];
        if (firstTextInsight) {
          await this.prisma.feedback.update({
            where: { id: feedbackId },
            data: {
              sentiment: intelligence.aggregateSentiment,
              summary: firstTextInsight.summary || null,
              metadata: {
                surveyId,
                surveyTitle: response.survey.title,
                responseId,
                intelligence: {
                  keyTopics: intelligence.keyTopics,
                  painPoints: intelligence.textInsights.flatMap((t) => t.painPoints),
                  featureRequests: intelligence.textInsights.flatMap((t) => t.featureRequests),
                  aggregateSentiment: intelligence.aggregateSentiment,
                  aggregateConfidence: intelligence.aggregateConfidence,
                },
              },
            },
          }).catch((err: Error) => {
            this.logger.warn(`Failed to enrich feedback ${feedbackId}: ${err.message}`);
          });
        }

        // ── 6. Trigger theme clustering for the feedback ───────────────────────
        let clusteredThemeId: string | null = null;
        try {
          const clusterResult = await this.themeClusteringService.assignFeedbackToTheme(workspaceId, feedbackId);
          clusteredThemeId = (clusterResult as any)?.themeId ?? null;
        } catch (err) {
          this.logger.warn(`Theme clustering failed for feedback ${feedbackId}: ${(err as Error).message}`);
        }

        // ── 6b. Enqueue CIQ re-scoring for the clustered theme ────────────────
        if (clusteredThemeId) {
          this.ciqQueue
            .add({ type: 'THEME_SCORED', workspaceId, themeId: clusteredThemeId } as CiqJobPayload, {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
              removeOnComplete: true,
            })
            .catch((err: Error) => {
              this.logger.warn(`Failed to enqueue CIQ re-scoring for theme ${clusteredThemeId}: ${err.message}`);
            });
        }
      }

      // ── 7. Create CustomerSignal records for numeric answers ─────────────────
      if (response.portalUserId) {
        // Resolve the customer linked to this portal user
        const portalUser = await this.prisma.portalUser.findUnique({
          where: { id: response.portalUserId },
          select: { customerId: true },
        });

        if (portalUser?.customerId) {
          const customerId = portalUser.customerId;

          // Create one signal per numeric answer
          for (const signal of intelligence.numericSignals) {
            await this.prisma.customerSignal.create({
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
              } as any, // metadata field may not be in Prisma type yet
            }).catch((err: Error) => {
              this.logger.warn(`Failed to create CustomerSignal: ${err.message}`);
            });
          }

          // Create one aggregate sentiment signal for text responses
          if (intelligence.textInsights.length > 0) {
            await this.prisma.customerSignal.create({
              data: {
                workspaceId,
                customerId,
                signalType: 'SURVEY_SENTIMENT',
                sourceId: responseId,
                strength: (intelligence.aggregateSentiment + 1) / 2, // normalise to [0,1]
                metadata: {
                  label: `Survey sentiment: ${intelligence.aggregateSentiment.toFixed(2)}`,
                  aggregateSentiment: intelligence.aggregateSentiment,
                  keyTopics: intelligence.keyTopics,
                  surveyId,
                  responseId,
                },
              } as any,
            }).catch((err: Error) => {
              this.logger.warn(`Failed to create sentiment CustomerSignal: ${err.message}`);
            });
          }
        }
      }

      this.logger.log(`Survey intelligence complete for response ${responseId}`);
    } catch (err) {
      this.logger.error(
        `Survey intelligence processor failed for response ${responseId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      // Do not rethrow — a failed intelligence job should not block the user's submission
    }
  }
}

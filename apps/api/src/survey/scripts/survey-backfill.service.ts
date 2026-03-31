/**
 * SurveyBackfillService
 *
 * Idempotent backfill for historical survey data submitted before the unified
 * source attribution model was introduced.
 *
 * What it fixes:
 *
 *   1. SURVEY TEXT BACKFILL
 *      SurveyResponse rows whose text answers (SHORT_TEXT / LONG_TEXT) were
 *      never converted to Feedback rows.  This happens for responses submitted
 *      before the submitSurveyResponse() refactor that introduced per-answer
 *      routing.  For each unprocessed text answer the script creates a Feedback
 *      row (primarySource=SURVEY, secondarySource=PORTAL) and enqueues it for
 *      AI analysis (embedding → sentiment → clustering → CIQ).
 *
 *   2. LEGACY primarySource BACKFILL
 *      Feedback rows created before the unified attribution model have
 *      primarySource=null.  effectiveSourceCategory() already handles these via
 *      sourceType fallback, but this backfill sets primarySource from sourceType
 *      so future queries can use the authoritative field without the fallback.
 *
 *   3. THEME CIQ RE-SCORE
 *      Themes whose source-count fields (feedbackCount / voiceCount /
 *      surveyCount / supportCount) are null or stale get a THEME_SCORED job
 *      enqueued so CIQ recomputes them with the new unified formula.
 *
 * Idempotency guarantees:
 *
 *   - Text backfill: skips SurveyAnswer rows that already have a Feedback row
 *     with a matching sourceRef (`survey:{surveyId}:question:{questionId}`).
 *     Also skips surveys with convertToFeedback=false.
 *   - primarySource backfill: only updates rows where primarySource IS NULL.
 *   - CIQ re-score: only enqueues themes where lastScoredAt IS NULL or
 *     surveyCount IS NULL.
 *   - All operations are batched and logged; running the script twice is safe.
 *
 * Usage (from monorepo root):
 *
 *   npx ts-node -r tsconfig-paths/register \
 *     apps/api/src/survey/scripts/survey-backfill.service.ts
 *
 * Or call SurveyBackfillService.run() from a NestJS bootstrap script.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SurveyQuestionType,
  FeedbackSourceType,
  FeedbackPrimarySource,
  FeedbackSecondarySource,
  FeedbackStatus,
} from '@prisma/client';
import { AI_ANALYSIS_QUEUE } from '../../ai/processors/analysis.processor';
import { CIQ_SCORING_QUEUE } from '../../ai/processors/ciq-scoring.processor';
import { RetryPolicy } from '../../common/queue/retry-policy';

/** Text question types whose answers should become Feedback signals. */
const TEXT_QUESTION_TYPES = new Set<SurveyQuestionType>([
  SurveyQuestionType.SHORT_TEXT,
  SurveyQuestionType.LONG_TEXT,
]);

/** Minimum answer length to be worth analysing. */
const MIN_TEXT_LENGTH = 10;

/** Batch size for DB queries to avoid memory pressure. */
const BATCH_SIZE = 100;

/** Map legacy FeedbackSourceType → FeedbackPrimarySource for Gap-B backfill. */
const SOURCE_TYPE_TO_PRIMARY: Partial<Record<string, FeedbackPrimarySource>> = {
  VOICE:         FeedbackPrimarySource.VOICE,
  PUBLIC_PORTAL: FeedbackPrimarySource.VOICE,
  SURVEY:        FeedbackPrimarySource.SURVEY,
  SUPPORT:       FeedbackPrimarySource.SUPPORT,
  MANUAL:        FeedbackPrimarySource.FEEDBACK,
  CSV_UPLOAD:    FeedbackPrimarySource.FEEDBACK,
  EMAIL:         FeedbackPrimarySource.FEEDBACK,
  SLACK:         FeedbackPrimarySource.FEEDBACK,
  API:           FeedbackPrimarySource.FEEDBACK,
  PORTAL:        FeedbackPrimarySource.FEEDBACK,
  INTERCOM:      FeedbackPrimarySource.FEEDBACK,
  ZENDESK:       FeedbackPrimarySource.SUPPORT,
};

export interface BackfillResult {
  textFeedbackCreated:   number;
  textFeedbackSkipped:   number;
  primarySourcePatched:  number;
  ciqReScoreEnqueued:    number;
  errors:                string[];
}

@Injectable()
export class SurveyBackfillService {
  private readonly logger = new Logger(SurveyBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(AI_ANALYSIS_QUEUE) private readonly analysisQueue: Queue,
  ) {}

  // ─── Public entry point ───────────────────────────────────────────────────

  async run(workspaceId?: string): Promise<BackfillResult> {
    const result: BackfillResult = {
      textFeedbackCreated:  0,
      textFeedbackSkipped:  0,
      primarySourcePatched: 0,
      ciqReScoreEnqueued:   0,
      errors:               [],
    };

    this.logger.log('=== SurveyBackfillService starting ===');
    if (workspaceId) {
      this.logger.log(`Scoped to workspace: ${workspaceId}`);
    } else {
      this.logger.log('Running across ALL workspaces');
    }

    await this._backfillSurveyTextFeedback(workspaceId, result);
    await this._backfillLegacyPrimarySource(workspaceId, result);
    await this._enqueueStaleCiqReScores(workspaceId, result);

    this.logger.log('=== SurveyBackfillService complete ===');
    this.logger.log(JSON.stringify(result, null, 2));
    return result;
  }

  // ─── Step 1: Survey text → Feedback backfill ─────────────────────────────

  /**
   * Find SurveyAnswer rows for text questions that have no corresponding
   * Feedback row.  Create Feedback rows and enqueue AI analysis for each.
   *
   * Idempotency key: Feedback.sourceRef = `survey:{surveyId}:question:{questionId}`
   * A response can have at most one text answer per question, so the composite
   * (surveyId, responseId, questionId) is unique.  We use a more stable key
   * (surveyId + questionId) so that re-runs after a partial failure are safe.
   */
  private async _backfillSurveyTextFeedback(
    workspaceId: string | undefined,
    result: BackfillResult,
  ): Promise<void> {
    this.logger.log('[Step 1] Backfilling survey text answers → Feedback rows');

    // Load all surveys with convertToFeedback=true (scoped to workspace if given)
    const surveys = await this.prisma.survey.findMany({
      where: {
        convertToFeedback: true,
        ...(workspaceId ? { workspaceId } : {}),
      },
      select: {
        id: true,
        title: true,
        workspaceId: true,
      },
    });

    this.logger.log(`Found ${surveys.length} surveys with convertToFeedback=true`);

    for (const survey of surveys) {
      try {
        await this._backfillSurveyResponses(survey, result);
      } catch (err) {
        const msg = `Survey ${survey.id}: ${(err as Error).message}`;
        this.logger.warn(msg);
        result.errors.push(msg);
      }
    }
  }

  private async _backfillSurveyResponses(
    survey: { id: string; title: string; workspaceId: string },
    result: BackfillResult,
  ): Promise<void> {
    // Load text questions for this survey
    const textQuestions = await this.prisma.surveyQuestion.findMany({
      where: {
        surveyId: survey.id,
        type: { in: Array.from(TEXT_QUESTION_TYPES) },
      },
      select: { id: true, label: true, type: true },
    });

    if (textQuestions.length === 0) return;

    const questionIds = textQuestions.map((q) => q.id);
    const questionMap = new Map(textQuestions.map((q) => [q.id, q]));

    // Load all text answers for this survey in batches
    let cursor: string | undefined;
    for (;;) {
      const answers = await this.prisma.surveyAnswer.findMany({
        where: {
          questionId: { in: questionIds },
          response: { surveyId: survey.id },
          textValue: { not: null },
        },
        select: {
          id: true,
          questionId: true,
          textValue: true,
          response: {
            select: {
              id: true,
              surveyId: true,
              portalUserId: true,
              respondentEmail: true,
              respondentName: true,
              customerId: true,
            },
          },
        },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      });

      if (answers.length === 0) break;
      cursor = answers[answers.length - 1].id;

      for (const answer of answers) {
        const text = answer.textValue ?? '';
        if (text.length < MIN_TEXT_LENGTH) {
          result.textFeedbackSkipped++;
          continue;
        }

        const question = questionMap.get(answer.questionId);
        if (!question) {
          result.textFeedbackSkipped++;
          continue;
        }

        // Idempotency check: look for an existing Feedback with this sourceRef
        const sourceRef = `survey:${survey.id}:question:${answer.questionId}`;
        const existing = await this.prisma.feedback.findFirst({
          where: {
            workspaceId: survey.workspaceId,
            sourceRef,
            // Narrow to this specific response to allow multiple respondents
            // answering the same question (each gets their own Feedback row)
            metadata: {
              path: ['responseId'],
              equals: answer.response.id,
            },
          },
          select: { id: true },
        });

        if (existing) {
          result.textFeedbackSkipped++;
          continue;
        }

        // Create the Feedback row
        try {
          const fb = await this.prisma.feedback.create({
            data: {
              workspaceId:     survey.workspaceId,
              sourceType:      FeedbackSourceType.SURVEY,
              primarySource:   FeedbackPrimarySource.SURVEY,
              secondarySource: FeedbackSecondarySource.PORTAL,
              sourceRef,
              title:           question.label,
              description:     text,
              rawText:         text,
              normalizedText:  text.toLowerCase(),
              status:          FeedbackStatus.NEW,
              portalUserId:    answer.response.portalUserId ?? undefined,
              metadata: {
                surveyId:        survey.id,
                surveyTitle:     survey.title,
                responseId:      answer.response.id,
                questionId:      answer.questionId,
                questionText:    question.label,
                questionType:    question.type,
                respondentEmail: answer.response.respondentEmail ?? null,
                respondentName:  answer.response.respondentName ?? null,
                backfilled:      true,
              },
            },
          });

          // Link the first feedback to the SurveyResponse if not already linked
          const resp = answer.response;
          const existingLink = await this.prisma.surveyResponse.findUnique({
            where: { id: resp.id },
            select: { feedbackId: true },
          });
          if (!existingLink?.feedbackId) {
            await this.prisma.surveyResponse.update({
              where: { id: resp.id },
              data: { feedbackId: fb.id },
            });
          }

          // Enqueue AI analysis
          await this.analysisQueue.add(
            { feedbackId: fb.id, workspaceId: survey.workspaceId },
            RetryPolicy.standard(),
          );

          result.textFeedbackCreated++;
          this.logger.log(
            `[Backfill] Created Feedback ${fb.id} for survey ${survey.id} ` +
            `response ${resp.id} question ${answer.questionId}`,
          );
        } catch (err) {
          const msg = `Failed to backfill answer ${answer.id}: ${(err as Error).message}`;
          this.logger.warn(msg);
          result.errors.push(msg);
        }
      }

      if (answers.length < BATCH_SIZE) break;
    }
  }

  // ─── Step 2: Legacy primarySource=null backfill ───────────────────────────

  /**
   * Set primarySource on Feedback rows that were created before the unified
   * attribution model.  Uses sourceType as the mapping key.
   * Only updates rows where primarySource IS NULL.
   */
  private async _backfillLegacyPrimarySource(
    workspaceId: string | undefined,
    result: BackfillResult,
  ): Promise<void> {
    this.logger.log('[Step 2] Backfilling legacy Feedback.primarySource=null rows');

    let cursor: string | undefined;
    for (;;) {
      const rows = await this.prisma.feedback.findMany({
        where: {
          primarySource: null,
          ...(workspaceId ? { workspaceId } : {}),
        },
        select: { id: true, sourceType: true, workspaceId: true },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      });

      if (rows.length === 0) break;
      cursor = rows[rows.length - 1].id;

      for (const row of rows) {
        const primary = SOURCE_TYPE_TO_PRIMARY[row.sourceType ?? ''] ?? FeedbackPrimarySource.FEEDBACK;
        try {
          await this.prisma.feedback.update({
            where: { id: row.id },
            data: { primarySource: primary },
          });
          result.primarySourcePatched++;
        } catch (err) {
          const msg = `Failed to patch primarySource for Feedback ${row.id}: ${(err as Error).message}`;
          this.logger.warn(msg);
          result.errors.push(msg);
        }
      }

      if (rows.length < BATCH_SIZE) break;
    }

    this.logger.log(`[Step 2] Patched ${result.primarySourcePatched} legacy Feedback rows`);
  }

  // ─── Step 3: Enqueue stale CIQ re-scores ─────────────────────────────────

  /**
   * Find themes where surveyCount IS NULL (never scored with the unified
   * formula) or lastScoredAt IS NULL (never scored at all) and enqueue a
   * THEME_SCORED job for each.
   *
   * This ensures all themes get re-scored with the new surveySignal component
   * after the text backfill has created Feedback rows and the AI pipeline has
   * processed them.  The CIQ processor is idempotent — running it twice is safe.
   */
  private async _enqueueStaleCiqReScores(
    workspaceId: string | undefined,
    result: BackfillResult,
  ): Promise<void> {
    this.logger.log('[Step 3] Enqueuing CIQ re-scores for stale themes');

    // We need the Bull queue for CIQ — it is not injected here, so we use
    // a direct Bull connection.  The queue name is the only thing we need.
    // NOTE: In production, prefer injecting the queue via NestJS DI.
    // This fallback uses the same Redis connection string as the rest of the app.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Bull = require('bull');
    const ciqQueue = new Bull(CIQ_SCORING_QUEUE, {
      redis: process.env.REDIS_URL ?? 'redis://localhost:6379',
    });

    try {
      let cursor: string | undefined;
      for (;;) {
        const themes = await this.prisma.theme.findMany({
          where: {
            status: { not: 'ARCHIVED' },
            OR: [
              { lastScoredAt: null },
              { surveyCount: null },
            ],
            ...(workspaceId ? { workspaceId } : {}),
          },
          select: { id: true, workspaceId: true },
          take: BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
        });

        if (themes.length === 0) break;
        cursor = themes[themes.length - 1].id;

        for (const theme of themes) {
          try {
            await ciqQueue.add(
              { type: 'THEME_SCORED', workspaceId: theme.workspaceId, themeId: theme.id },
              RetryPolicy.light(),
            );
            result.ciqReScoreEnqueued++;
          } catch (err) {
            const msg = `Failed to enqueue CIQ re-score for theme ${theme.id}: ${(err as Error).message}`;
            this.logger.warn(msg);
            result.errors.push(msg);
          }
        }

        if (themes.length < BATCH_SIZE) break;
      }
    } finally {
      await ciqQueue.close();
    }

    this.logger.log(`[Step 3] Enqueued ${result.ciqReScoreEnqueued} CIQ re-score jobs`);
  }
}

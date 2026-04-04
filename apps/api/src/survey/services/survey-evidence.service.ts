/**
 * SurveyEvidenceService
 *
 * Provides read access to SurveyEvidence rows — the structured, non-text
 * answers (SINGLE_CHOICE, MULTIPLE_CHOICE, RATING, NPS) captured during
 * survey submission.
 *
 * These rows are queryable as evidence for themes and analytics without
 * polluting the text-clustering pipeline.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SurveyQuestionType } from '@prisma/client';

export interface SurveyEvidenceQuery {
  /** Filter to a specific survey */
  surveyId?: string;
  /** Filter to a specific question */
  questionId?: string;
  /** Filter to a specific question type */
  questionType?: SurveyQuestionType;
  /** Filter to a specific response */
  responseId?: string;
  /** Pagination */
  skip?: number;
  take?: number;
}

export interface SurveyEvidenceSummary {
  questionId: string;
  questionText: string;
  questionType: SurveyQuestionType;
  /** For SINGLE_CHOICE / MULTIPLE_CHOICE: tally of each option selected */
  choiceTally?: Record<string, number>;
  /** For RATING / NPS: average normalised score [0, 1] */
  avgNormalisedScore?: number;
  /** For RATING / NPS: average raw value */
  avgRawValue?: number;
  /** Total number of answers for this question */
  count: number;
}

@Injectable()
export class SurveyEvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List raw SurveyEvidence rows for a workspace, with optional filters.
   */
  async listEvidence(workspaceId: string, query: SurveyEvidenceQuery = {}) {
    const {
      surveyId,
      questionId,
      questionType,
      responseId,
      skip = 0,
      take = 50,
    } = query;

    const [rows, total] = await Promise.all([
      this.prisma.surveyEvidence.findMany({
        where: {
          workspaceId,
          ...(surveyId ? { surveyId } : {}),
          ...(questionId ? { questionId } : {}),
          ...(questionType ? { questionType } : {}),
          ...(responseId ? { responseId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.surveyEvidence.count({
        where: {
          workspaceId,
          ...(surveyId ? { surveyId } : {}),
          ...(questionId ? { questionId } : {}),
          ...(questionType ? { questionType } : {}),
          ...(responseId ? { responseId } : {}),
        },
      }),
    ]);

    return { rows, total, skip, take };
  }

  /**
   * Aggregate SurveyEvidence for a survey into per-question summaries.
   * Useful for survey analytics dashboards and theme evidence panels.
   */
  async getSurveySummary(
    workspaceId: string,
    surveyId: string,
  ): Promise<SurveyEvidenceSummary[]> {
    // Verify the survey belongs to this workspace
    const survey = await this.prisma.survey.findFirst({
      where: { id: surveyId, workspaceId },
      select: { id: true },
    });
    if (!survey) throw new NotFoundException(`Survey ${surveyId} not found`);

    const rows = await this.prisma.surveyEvidence.findMany({
      where: { workspaceId, surveyId },
      select: {
        questionId: true,
        questionText: true,
        questionType: true,
        choiceValues: true,
        numericValue: true,
        normalisedScore: true,
      },
    });

    // Group by questionId
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      const existing = grouped.get(row.questionId) ?? [];
      existing.push(row);
      grouped.set(row.questionId, existing);
    }

    const summaries: SurveyEvidenceSummary[] = [];

    for (const [questionId, answers] of grouped.entries()) {
      const first = answers[0];
      const summary: SurveyEvidenceSummary = {
        questionId,
        questionText: first.questionText,
        questionType: first.questionType,
        count: answers.length,
      };

      if (
        first.questionType === SurveyQuestionType.SINGLE_CHOICE ||
        first.questionType === SurveyQuestionType.MULTIPLE_CHOICE
      ) {
        // Build a tally of each selected option
        const tally: Record<string, number> = {};
        for (const answer of answers) {
          const choices = Array.isArray(answer.choiceValues)
            ? (answer.choiceValues as string[])
            : [];
          for (const choice of choices) {
            tally[choice] = (tally[choice] ?? 0) + 1;
          }
        }
        summary.choiceTally = tally;
      } else if (
        first.questionType === SurveyQuestionType.RATING ||
        first.questionType === SurveyQuestionType.NPS
      ) {
        const numericAnswers = answers.filter((a) => a.numericValue !== null);
        if (numericAnswers.length > 0) {
          summary.avgRawValue =
            numericAnswers.reduce((sum, a) => sum + (a.numericValue ?? 0), 0) /
            numericAnswers.length;
        }
        const scoredAnswers = answers.filter((a) => a.normalisedScore !== null);
        if (scoredAnswers.length > 0) {
          summary.avgNormalisedScore =
            scoredAnswers.reduce(
              (sum, a) => sum + (a.normalisedScore ?? 0),
              0,
            ) / scoredAnswers.length;
        }
      }

      summaries.push(summary);
    }

    return summaries;
  }
}

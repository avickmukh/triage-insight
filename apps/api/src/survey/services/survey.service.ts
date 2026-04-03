import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SurveyStatus,
  SurveyType,
  SurveyQuestionType,
  FeedbackSourceType,
  FeedbackPrimarySource,
  FeedbackSecondarySource,
  FeedbackStatus,
} from '@prisma/client';
import { AI_ANALYSIS_QUEUE } from '../../ai/processors/analysis.processor';
import { SURVEY_INTELLIGENCE_QUEUE } from '../processors/survey-intelligence.processor';
import { JobLogger } from '../../common/queue/job-logger';
import { RetryPolicy } from '../../common/queue/retry-policy';

/** Minimum character length for an open-text answer to become a Feedback signal. */
const MIN_TEXT_LENGTH = 10;

/** Question types whose answers become Feedback signals in the AI pipeline. */
const TEXT_QUESTION_TYPES = new Set<SurveyQuestionType>([
  SurveyQuestionType.SHORT_TEXT,
  SurveyQuestionType.LONG_TEXT,
]);

/** Question types whose answers are stored as SurveyEvidence (structured, no text clustering). */
const EVIDENCE_QUESTION_TYPES = new Set<SurveyQuestionType>([
  SurveyQuestionType.SINGLE_CHOICE,
  SurveyQuestionType.MULTIPLE_CHOICE,
  SurveyQuestionType.RATING,
  SurveyQuestionType.NPS,
]);

/**
 * Normalise a numeric answer to [0, 1].
 * RATING: assumes ratingMin/ratingMax from the question definition.
 * NPS: 0-10 scale → 0 = detractor (0), 10 = promoter (1).
 */
function normaliseNumeric(
  value: number,
  type: SurveyQuestionType,
  ratingMin = 1,
  ratingMax = 5,
): number {
  if (type === SurveyQuestionType.NPS) {
    return Math.min(Math.max(value, 0), 10) / 10;
  }
  const range = ratingMax - ratingMin;
  if (range <= 0) return 0.5;
  return Math.min(Math.max((value - ratingMin) / range, 0), 1);
}
import {
  CreateSurveyDto,
  UpdateSurveyDto,
  CreateSurveyQuestionDto,
  UpdateSurveyQuestionDto,
  SubmitSurveyResponseDto,
  SurveyQueryDto,
} from '../dto/survey.dto';
import { SurveyIntelligenceService, RevenueWeightedInsight } from './survey-intelligence.service';

@Injectable()
export class SurveyService {
  private readonly logger = new JobLogger(SurveyService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(SURVEY_INTELLIGENCE_QUEUE) private readonly intelligenceQueue: Queue,
    @InjectQueue(AI_ANALYSIS_QUEUE) private readonly analysisQueue: Queue,
    private readonly surveyIntelligenceService: SurveyIntelligenceService,
  ) {}

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async resolveWorkspace(workspaceId: string) {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, status: true },
    });
    if (!ws) throw new NotFoundException('Workspace not found');
    return ws;
  }

  private async resolveSurvey(workspaceId: string, surveyId: string) {
    const survey = await this.prisma.survey.findFirst({
      where: { id: surveyId, workspaceId },
    });
    if (!survey) throw new NotFoundException('Survey not found');
    return survey;
  }

  // ─── Survey CRUD ─────────────────────────────────────────────────────────────

  async createSurvey(workspaceId: string, dto: CreateSurveyDto) {
    await this.resolveWorkspace(workspaceId);

    const survey = await this.prisma.survey.create({
      data: {
        workspaceId,
        title: dto.title,
        description: dto.description ?? null,
        surveyType: dto.surveyType ?? SurveyType.CUSTOM,
        convertToFeedback: dto.convertToFeedback ?? true,
        thankYouMessage: dto.thankYouMessage ?? null,
        redirectUrl: dto.redirectUrl ?? null,
        linkedThemeId: dto.linkedThemeId ?? null,
        linkedRoadmapItemId: dto.linkedRoadmapItemId ?? null,
        linkedThemeIds: dto.linkedThemeIds ?? [],
        linkedRoadmapIds: dto.linkedRoadmapIds ?? [],
        targetSegment: dto.targetSegment ?? null,
        customerSegment: dto.customerSegment ?? null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        status: SurveyStatus.DRAFT,
        isPublic: false,
        questions: dto.questions?.length
          ? {
              create: dto.questions.map((q, idx) => ({
                workspaceId,
                type: q.type,
                label: q.label,
                placeholder: q.placeholder ?? null,
                required: q.required ?? false,
                order: q.order ?? idx + 1,
                options: q.options ? q.options : undefined,
                ratingMin: q.ratingMin ?? 1,
                ratingMax: q.ratingMax ?? 5,
              })),
            }
          : undefined,
      },
      include: {
        questions: { orderBy: { order: 'asc' } },
        _count: { select: { responses: true } },
      },
    });

    return survey;
  }

  async listSurveys(workspaceId: string, query: SurveyQueryDto) {
    await this.resolveWorkspace(workspaceId);

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = { workspaceId };
    if (query.status) where.status = query.status;
    if (query.surveyType) where.surveyType = query.surveyType;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [surveys, total] = await Promise.all([
      this.prisma.survey.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          _count: { select: { questions: true, responses: true } },
        },
      }),
      this.prisma.survey.count({ where }),
    ]);

    return {
      data: surveys,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getSurveyDetail(workspaceId: string, surveyId: string) {
    await this.resolveWorkspace(workspaceId);
    const survey = await this.prisma.survey.findFirst({
      where: { id: surveyId, workspaceId },
      include: {
        questions: { orderBy: { order: 'asc' } },
        _count: { select: { responses: true } },
      },
    });
    if (!survey) throw new NotFoundException('Survey not found');
    return survey;
  }

  async updateSurvey(workspaceId: string, surveyId: string, dto: UpdateSurveyDto) {
    await this.resolveSurvey(workspaceId, surveyId);

    return this.prisma.survey.update({
      where: { id: surveyId },
      data: {
        title: dto.title,
        description: dto.description,
        surveyType: dto.surveyType,
        convertToFeedback: dto.convertToFeedback,
        thankYouMessage: dto.thankYouMessage,
        redirectUrl: dto.redirectUrl,
        linkedThemeId: dto.linkedThemeId,
        linkedRoadmapItemId: dto.linkedRoadmapItemId,
        linkedThemeIds: dto.linkedThemeIds,
        linkedRoadmapIds: dto.linkedRoadmapIds,
        targetSegment: dto.targetSegment,
        customerSegment: dto.customerSegment,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
      include: {
        questions: { orderBy: { order: 'asc' } },
        _count: { select: { responses: true } },
      },
    });
  }

  async publishSurvey(workspaceId: string, surveyId: string) {
    const survey = await this.resolveSurvey(workspaceId, surveyId);
    if (survey.status === SurveyStatus.CLOSED) {
      throw new BadRequestException('A closed survey cannot be re-published. Create a new survey instead.');
    }

    // Must have at least one question
    const qCount = await this.prisma.surveyQuestion.count({ where: { surveyId } });
    if (qCount === 0) {
      throw new BadRequestException('A survey must have at least one question before publishing.');
    }

    return this.prisma.survey.update({
      where: { id: surveyId },
      data: { status: SurveyStatus.PUBLISHED, isPublic: true },
      include: {
        questions: { orderBy: { order: 'asc' } },
        _count: { select: { responses: true } },
      },
    });
  }

  async unpublishSurvey(workspaceId: string, surveyId: string) {
    await this.resolveSurvey(workspaceId, surveyId);
    return this.prisma.survey.update({
      where: { id: surveyId },
      data: { status: SurveyStatus.DRAFT, isPublic: false },
      include: {
        questions: { orderBy: { order: 'asc' } },
        _count: { select: { responses: true } },
      },
    });
  }

  async closeSurvey(workspaceId: string, surveyId: string) {
    await this.resolveSurvey(workspaceId, surveyId);
    return this.prisma.survey.update({
      where: { id: surveyId },
      data: { status: SurveyStatus.CLOSED, isPublic: false },
      include: {
        questions: { orderBy: { order: 'asc' } },
        _count: { select: { responses: true } },
      },
    });
  }

  async deleteSurvey(workspaceId: string, surveyId: string) {
    await this.resolveSurvey(workspaceId, surveyId);
    await this.prisma.survey.delete({ where: { id: surveyId } });
    return { success: true };
  }

  // ─── Question CRUD ────────────────────────────────────────────────────────────

  async addQuestion(workspaceId: string, surveyId: string, dto: CreateSurveyQuestionDto) {
    await this.resolveSurvey(workspaceId, surveyId);

    // Determine next order
    const maxOrder = await this.prisma.surveyQuestion.aggregate({
      where: { surveyId },
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? 0) + 1;

    return this.prisma.surveyQuestion.create({
      data: {
        surveyId,
        workspaceId,
        type: dto.type,
        label: dto.label,
        placeholder: dto.placeholder ?? null,
        required: dto.required ?? false,
        order: dto.order ?? nextOrder,
        options: dto.options ? dto.options : undefined,
        ratingMin: dto.ratingMin ?? 1,
        ratingMax: dto.ratingMax ?? 5,
      },
    });
  }

  async updateQuestion(
    workspaceId: string,
    surveyId: string,
    questionId: string,
    dto: UpdateSurveyQuestionDto,
  ) {
    await this.resolveSurvey(workspaceId, surveyId);
    const question = await this.prisma.surveyQuestion.findFirst({
      where: { id: questionId, surveyId },
    });
    if (!question) throw new NotFoundException('Question not found');

    return this.prisma.surveyQuestion.update({
      where: { id: questionId },
      data: {
        type: dto.type,
        label: dto.label,
        placeholder: dto.placeholder,
        required: dto.required,
        order: dto.order,
        options: dto.options ? dto.options : undefined,
        ratingMin: dto.ratingMin,
        ratingMax: dto.ratingMax,
      },
    });
  }

  async deleteQuestion(workspaceId: string, surveyId: string, questionId: string) {
    await this.resolveSurvey(workspaceId, surveyId);
    const question = await this.prisma.surveyQuestion.findFirst({
      where: { id: questionId, surveyId },
    });
    if (!question) throw new NotFoundException('Question not found');
    await this.prisma.surveyQuestion.delete({ where: { id: questionId } });
    return { success: true };
  }

  // ─── Responses ────────────────────────────────────────────────────────────────

  async listResponses(workspaceId: string, surveyId: string, page = 1, limit = 20) {
    await this.resolveSurvey(workspaceId, surveyId);

    const skip = (page - 1) * limit;
    const [responses, total] = await Promise.all([
      this.prisma.surveyResponse.findMany({
        where: { surveyId, workspaceId },
        orderBy: { submittedAt: 'desc' },
        skip,
        take: limit,
        include: {
          answers: {
            include: { question: { select: { label: true, type: true, order: true } } },
            orderBy: { question: { order: 'asc' } },
          },
          portalUser: { select: { id: true, email: true, name: true } },
        },
      }),
      this.prisma.surveyResponse.count({ where: { surveyId, workspaceId } }),
    ]);

    return {
      data: responses,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── Portal: public survey fetch ──────────────────────────────────────────────

  async getPublicSurvey(orgSlug: string, surveyId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug: orgSlug },
      select: { id: true, status: true },
    });
    if (!workspace) throw new NotFoundException(`Workspace '${orgSlug}' not found`);

    const survey = await this.prisma.survey.findFirst({
      where: {
        id: surveyId,
        workspaceId: workspace.id,
        status: SurveyStatus.PUBLISHED,
        isPublic: true,
      },
      include: {
        questions: { orderBy: { order: 'asc' } },
      },
    });
    if (!survey) throw new NotFoundException('Survey not found or not published');

    return survey;
  }

  async listPublicSurveys(orgSlug: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug: orgSlug },
      select: { id: true, status: true },
    });
    if (!workspace) throw new NotFoundException(`Workspace '${orgSlug}' not found`);

    return this.prisma.survey.findMany({
      where: {
        workspaceId: workspace.id,
        status: SurveyStatus.PUBLISHED,
        isPublic: true,
      },
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        _count: { select: { questions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Portal: submit response ──────────────────────────────────────────────────

  async submitResponse(orgSlug: string, surveyId: string, dto: SubmitSurveyResponseDto) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug: orgSlug },
      select: { id: true, status: true },
    });
    if (!workspace) throw new NotFoundException(`Workspace '${orgSlug}' not found`);

    const survey = await this.prisma.survey.findFirst({
      where: {
        id: surveyId,
        workspaceId: workspace.id,
        status: SurveyStatus.PUBLISHED,
        isPublic: true,
      },
      include: {
        questions: { orderBy: { order: 'asc' } },
      },
    });
     if (!survey) throw new NotFoundException('Survey not found or not published');

    // ── Duplicate submission guard ────────────────────────────────────────────
    // Prevent the same respondent from submitting the same survey twice.
    // Keyed on (surveyId + respondentEmail) when email is provided, or
    // (surveyId + anonymousId) when an anonymous session token is provided.
    // If neither is present the check is skipped (anonymous, no session).
    if (dto.respondentEmail || dto.anonymousId) {
      const existingResponse = await this.prisma.surveyResponse.findFirst({
        where: {
          surveyId,
          workspaceId: workspace.id,
          ...(dto.respondentEmail
            ? { respondentEmail: dto.respondentEmail }
            : { anonymousId: dto.anonymousId }),
        },
        select: { id: true },
      });
      if (existingResponse) {
        // Return success-like response so the UI can show the thank-you screen
        // without revealing whether the respondent has already submitted.
        return {
          success: true,
          responseId: existingResponse.id,
          feedbackIds: [],
          feedbackId: null,
          thankYouMessage: survey.thankYouMessage ?? 'Thank you for your response!',
          redirectUrl: survey.redirectUrl ?? null,
          duplicate: true,
        };
      }
    }

    // Validate required questions are answered
    const requiredQuestions = survey.questions.filter((q) => q.required);
    const answeredIds = new Set(dto.answers.map((a) => a.questionId));
    for (const rq of requiredQuestions) {
      if (!answeredIds.has(rq.id)) {
        throw new BadRequestException(`Question "${rq.label}" is required.`);
      }
    }

    // Resolve or create PortalUser if email provided
    let portalUserId: string | null = null;
    if (dto.respondentEmail) {
      const pu = await this.prisma.portalUser.upsert({
        where: { workspaceId_email: { workspaceId: workspace.id, email: dto.respondentEmail } },
        create: {
          workspaceId: workspace.id,
          email: dto.respondentEmail,
          name: dto.respondentName ?? null,
        },
        update: {},
      });
      portalUserId = pu.id;
    } else if (dto.portalUserId) {
      const pu = await this.prisma.portalUser.findFirst({
        where: { id: dto.portalUserId, workspaceId: workspace.id },
      });
      if (pu) portalUserId = pu.id;
    }

    // Build a lookup map: questionId → full question definition
    const questionMap = new Map(survey.questions.map((q) => [q.id, q]));

    // ── Classify each answer by question type ──────────────────────────────────
    type TextCandidate = { questionId: string; questionText: string; text: string };
    type EvidenceCandidate = {
      questionId: string;
      questionText: string;
      questionType: SurveyQuestionType;
      choiceValues: unknown[] | null;
      numericValue: number | null;
      normalisedScore: number | null;
      ratingMin: number;
      ratingMax: number;
    };

    const textCandidates: TextCandidate[] = [];
    const evidenceCandidates: EvidenceCandidate[] = [];

    for (const answer of dto.answers) {
      const question = questionMap.get(answer.questionId);
      if (!question) continue;

      if (TEXT_QUESTION_TYPES.has(question.type)) {
        // Open-text: only keep answers that are substantive
        const text = (answer.textValue ?? '').trim();
        if (text.length >= MIN_TEXT_LENGTH) {
          textCandidates.push({
            questionId: question.id,
            questionText: question.label,
            text,
          });
        }
      } else if (EVIDENCE_QUESTION_TYPES.has(question.type)) {
        // Structured: always store as evidence
        const numericValue = answer.numericValue ?? null;
        const normalisedScore =
          numericValue !== null
            ? normaliseNumeric(
                numericValue,
                question.type,
                question.ratingMin ?? 1,
                question.ratingMax ?? 5,
              )
            : null;
        evidenceCandidates.push({
          questionId: question.id,
          questionText: question.label,
          questionType: question.type,
          choiceValues: Array.isArray(answer.choiceValues) ? (answer.choiceValues as unknown[]) : null,
          numericValue,
          normalisedScore,
          ratingMin: question.ratingMin ?? 1,
          ratingMax: question.ratingMax ?? 5,
        });
      }
    }

    // ── Persist response + raw answers + SurveyEvidence in one transaction ─────
    const { responseId, feedbackIds } = await this.prisma.$transaction(async (tx) => {
      // 1. Create the SurveyResponse with all raw answers
      const resp = await tx.surveyResponse.create({
        data: {
          surveyId,
          workspaceId: workspace.id,
          portalUserId,
          respondentEmail: dto.respondentEmail ?? null,
          respondentName: dto.respondentName ?? null,
          anonymousId: dto.anonymousId ?? null,
          customerId: dto.customerId ?? null,
          metadata: { userAgent: null },
          answers: {
            create: dto.answers.map((a) => ({
              questionId: a.questionId,
              textValue: a.textValue ?? null,
              numericValue: a.numericValue ?? null,
              choiceValues: a.choiceValues ? a.choiceValues : undefined,
            })),
          },
        },
      });

      // 2. Create one Feedback per substantive open-text answer
      const createdFeedbackIds: string[] = [];
      // All open-text answers create Feedback records regardless of convertToFeedback flag.
      // The flag is preserved for backward-compat API surface but no longer gates signal creation.
      if (textCandidates.length > 0) {
        for (const candidate of textCandidates) {
          const fb = await tx.feedback.create({
            data: {
              workspaceId: workspace.id,
              sourceType:      FeedbackSourceType.SURVEY,
              primarySource:   FeedbackPrimarySource.SURVEY,
              secondarySource: FeedbackSecondarySource.PORTAL,
              // sourceRef encodes the full provenance chain
              sourceRef: `survey:${surveyId}:question:${candidate.questionId}`,
              // Title = the question label — NOT the survey title
              title: candidate.questionText,
              description: candidate.text,
              rawText: candidate.text,
              normalizedText: candidate.text.toLowerCase(),
              status: FeedbackStatus.NEW,
              portalUserId,
              metadata: {
                surveyId,
                surveyTitle: survey.title,
                responseId: resp.id,
                questionId: candidate.questionId,
                questionText: candidate.questionText,
                questionType: 'TEXT',
                respondentEmail: dto.respondentEmail ?? null,
                respondentName: dto.respondentName ?? null,
              },
            },
          });
          createdFeedbackIds.push(fb.id);
        }

        // Link the first feedback to the response for backward compat
        if (createdFeedbackIds.length > 0) {
          await tx.surveyResponse.update({
            where: { id: resp.id },
            data: { feedbackId: createdFeedbackIds[0] },
          });
        }
      }

      // 3. Create SurveyEvidence rows for all structured answers
      if (evidenceCandidates.length > 0) {
        await tx.surveyEvidence.createMany({
          data: evidenceCandidates.map((ev) => ({
            workspaceId: workspace.id,
            surveyId,
            responseId: resp.id,
            questionId: ev.questionId,
            questionText: ev.questionText,
            questionType: ev.questionType,
            choiceValues: ev.choiceValues ? (ev.choiceValues as string[]) : undefined,
            numericValue: ev.numericValue,
            normalisedScore: ev.normalisedScore,
            respondentEmail: dto.respondentEmail ?? null,
            customerId: dto.customerId ?? null,
            metadata: {
              surveyTitle: survey.title,
              ratingMin: ev.ratingMin,
              ratingMax: ev.ratingMax,
            },
          })),
        });
      }

      return { responseId: resp.id, feedbackIds: createdFeedbackIds };
    });

    // ── Create ImportBatch so batch finalization fires after all items complete ──
    // The AiAnalysisProcessor.updateBatchProgress() increments completedRows/failedRows
    // per item. When all rows are accounted for it triggers runBatchFinalization(),
    // which runs borderline reassignment, merge, suppress, centroid refresh, promote,
    // and confidence refresh — giving the clustering engine a full batch-level view.
    if (feedbackIds.length > 0) {
      try {
        const batch = await this.prisma.importBatch.create({
          data: {
            workspaceId: workspace.id,
            totalRows: feedbackIds.length,
            completedRows: 0,
            failedRows: 0,
            stage: 'ANALYZING',
            status: 'PROCESSING',
          },
          select: { id: true },
        });
        await this.prisma.feedback.updateMany({
          where: { id: { in: feedbackIds } },
          data: { importBatchId: batch.id },
        });
      } catch (batchErr) {
        this.logger.stepWarn(
          { jobType: 'SURVEY_SUBMIT', workspaceId: workspace.id, entityId: surveyId },
          'BATCH_CREATE_FAILED',
          `Non-fatal: failed to create ImportBatch for survey response: ${(batchErr as Error).message}`,
        );
      }
    }

    // ── Enqueue AI analysis for each open-text Feedback (fire-and-forget) ─────
    // Uses RetryPolicy.standard() so survey signals get the same retry/backoff
    // guarantees as feedback inbox items. The analysis processor's idempotency
    // guard (keyed on feedbackId) prevents duplicate processing on re-submit.
    const retryOpts = RetryPolicy.standard();
    for (const feedbackId of feedbackIds) {
      try {
        await this.analysisQueue.add(
          { feedbackId, workspaceId: workspace.id },
          retryOpts,
        );
        this.logger.debug(
          { jobType: 'SURVEY_SUBMIT', workspaceId: workspace.id, entityId: surveyId },
          `Enqueued AI analysis for survey open-text Feedback ${feedbackId}`,
          { feedbackId },
        );
      } catch (err) {
        // Queue unavailability must not fail the HTTP response — the survey
        // response is already persisted. Log for operator visibility.
        this.logger.stepWarn(
          { jobType: 'SURVEY_SUBMIT', workspaceId: workspace.id, entityId: surveyId },
          'AI_ANALYSIS_ENQUEUE_FAILED',
          `Failed to enqueue AI analysis for Feedback ${feedbackId}: ${(err as Error).message}`,
        );
      }
    }

    // ── Enqueue survey intelligence for CIQ/revenue signals (fire-and-forget) ───
    try {
      await this.intelligenceQueue.add(
        {
          workspaceId: workspace.id,
          surveyId,
          responseId,
          feedbackId: feedbackIds[0] ?? null,
        },
        RetryPolicy.light(),
      );
    } catch (err) {
      this.logger.stepWarn(
        { jobType: 'SURVEY_SUBMIT', workspaceId: workspace.id, entityId: surveyId },
        'INTELLIGENCE_ENQUEUE_FAILED',
        `Failed to enqueue survey intelligence job: ${(err as Error).message}`,
      );
    }

    return {
      success: true,
      responseId,
      feedbackIds,
      // Backward compat: single feedbackId for callers that expect it
      feedbackId: feedbackIds[0] ?? null,
      thankYouMessage: survey.thankYouMessage ?? 'Thank you for your response!',
      redirectUrl: survey.redirectUrl ?? null,
    };
  }

  // ─── Survey Intelligence Summary ─────────────────────────────────────────────

  /**
   * Returns aggregated intelligence for a survey:
   * - response volume
   * - average sentiment (from processed responses)
   * - average NPS / rating
   * - linked theme IDs (from feedback linked to this survey)
   * - key topics (merged from processed responses)
   */
  async getSurveyIntelligence(workspaceId: string, surveyId: string) {
    await this.resolveSurvey(workspaceId, surveyId);

    const responses = await this.prisma.surveyResponse.findMany({
      where: { surveyId, workspaceId },
      select: {
        id: true,
        metadata: true,
        feedbackId: true,
        answers: {
          select: {
            numericValue: true,
            question: { select: { type: true } },
          },
        },
      },
    });

    const totalResponses = responses.length;

    // Aggregate sentiment from processed responses
    const sentiments: number[] = [];
    const allKeyTopics: string[] = [];
    for (const r of responses) {
      const meta = r.metadata as Record<string, any> | null;
      const intel = meta?.intelligence;
      if (intel && typeof intel.aggregateSentiment === 'number') {
        sentiments.push(intel.aggregateSentiment);
      }
      if (intel && Array.isArray(intel.keyTopics)) {
        allKeyTopics.push(...intel.keyTopics);
      }
    }
    const avgSentiment = sentiments.length > 0
      ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
      : null;

    // Aggregate NPS / rating answers
    const npsValues: number[] = [];
    const ratingValues: number[] = [];
    for (const r of responses) {
      for (const a of r.answers) {
        if (a.numericValue != null) {
          if (a.question.type === 'NPS') npsValues.push(a.numericValue);
          if (a.question.type === 'RATING') ratingValues.push(a.numericValue);
        }
      }
    }
    const avgNps = npsValues.length > 0
      ? npsValues.reduce((a, b) => a + b, 0) / npsValues.length
      : null;
    const avgRating = ratingValues.length > 0
      ? ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length
      : null;

    // NPS score: % promoters - % detractors
    let npsScore: number | null = null;
    if (npsValues.length > 0) {
      const promoters = npsValues.filter((v) => v >= 9).length;
      const detractors = npsValues.filter((v) => v <= 6).length;
      npsScore = Math.round(((promoters - detractors) / npsValues.length) * 100);
    }

    // Linked themes from feedback — fetch titles so the UI can display them
    const feedbackIds = responses.map((r) => r.feedbackId).filter(Boolean) as string[];
    const linkedThemeIds: string[] = [];
    const linkedThemes: Array<{ id: string; title: string }> = [];
    if (feedbackIds.length > 0) {
      const themeFeedbacks = await this.prisma.themeFeedback.findMany({
        where: { feedbackId: { in: feedbackIds } },
        select: { themeId: true },
      });
      const uniqueThemeIds = [...new Set(themeFeedbacks.map((tf) => tf.themeId))];
      linkedThemeIds.push(...uniqueThemeIds);
      if (uniqueThemeIds.length > 0) {
        const themeRows = await this.prisma.theme.findMany({
          where: { id: { in: uniqueThemeIds } },
          select: { id: true, title: true },
        });
        linkedThemes.push(...themeRows);
      }
    }

    // Top key topics
    const topicCounts = new Map<string, number>();
    for (const topic of allKeyTopics) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
    const keyTopics = [...topicCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([topic]) => topic);

    const processedCount = sentiments.length;

    // Sentiment distribution
    const sentimentDistribution = sentiments.length > 0 ? {
      positive: sentiments.filter((s) => s > 0.1).length,
      neutral:  sentiments.filter((s) => s >= -0.1 && s <= 0.1).length,
      negative: sentiments.filter((s) => s < -0.1).length,
    } : null;

    // Top feature requests and pain points from metadata
    const allFeatureRequests: string[] = [];
    const allPainPoints: string[] = [];
    for (const r of responses) {
      const meta = r.metadata as Record<string, any> | null;
      const intel = meta?.intelligence;
      if (intel) {
        if (Array.isArray(intel.featureRequests)) allFeatureRequests.push(...(intel.featureRequests as string[]));
        if (Array.isArray(intel.painPoints)) allPainPoints.push(...(intel.painPoints as string[]));
      }
    }
    const frCounts = new Map<string, number>();
    for (const fr of allFeatureRequests) frCounts.set(fr, (frCounts.get(fr) ?? 0) + 1);
    const ppCounts = new Map<string, number>();
    for (const pp of allPainPoints) ppCounts.set(pp, (ppCounts.get(pp) ?? 0) + 1);
    const topFeatureRequests = [...frCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);
    const topPainPoints = [...ppCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);

    // Insight score
    const insightScore = totalResponses > 0
      ? Math.round(
          (processedCount / totalResponses) * 40 +
          (keyTopics.length / 8) * 30 +
          (avgSentiment != null ? 30 : 0),
        )
      : null;

    // Per-question structured breakdowns (NPS, RATING, SINGLE_CHOICE, MULTIPLE_CHOICE)
    // These are shown as analytics evidence — NOT as fake text themes
    const questions = await this.prisma.surveyQuestion.findMany({
      where: { surveyId },
      orderBy: { order: 'asc' },
      select: { id: true, type: true, label: true, options: true, ratingMin: true, ratingMax: true },
    });
    const allAnswers = await this.prisma.surveyAnswer.findMany({
      where: { response: { surveyId } },
      select: { questionId: true, numericValue: true, textValue: true, choiceValues: true },
    });
    const answersByQuestion = new Map<string, typeof allAnswers>();
    for (const a of allAnswers) {
      if (!answersByQuestion.has(a.questionId)) answersByQuestion.set(a.questionId, []);
      answersByQuestion.get(a.questionId)!.push(a);
    }
    const questionBreakdowns = questions
      .filter((q) => EVIDENCE_QUESTION_TYPES.has(q.type as SurveyQuestionType))
      .map((q) => {
        const answers = answersByQuestion.get(q.id) ?? [];
        const responseCount = answers.length;
        if (q.type === SurveyQuestionType.NPS || q.type === SurveyQuestionType.RATING) {
          const nums = answers.map((a) => a.numericValue).filter((v): v is number => v != null);
          const avg = nums.length > 0 ? nums.reduce((s, v) => s + v, 0) / nums.length : null;
          // NPS breakdown: promoters (9-10), passives (7-8), detractors (0-6)
          const distribution: Record<string, number> = {};
          if (q.type === SurveyQuestionType.NPS) {
            distribution['Promoters (9-10)'] = nums.filter((v) => v >= 9).length;
            distribution['Passives (7-8)']   = nums.filter((v) => v >= 7 && v <= 8).length;
            distribution['Detractors (0-6)'] = nums.filter((v) => v <= 6).length;
          } else {
            const min = q.ratingMin ?? 1;
            const max = q.ratingMax ?? 5;
            for (let i = min; i <= max; i++) {
              distribution[String(i)] = nums.filter((v) => v === i).length;
            }
          }
          return { questionId: q.id, label: q.label, type: q.type, responseCount, avg, distribution };
        }
        // SINGLE_CHOICE / MULTIPLE_CHOICE
        const choiceCounts: Record<string, number> = {};
        for (const a of answers) {
          const choices = (a.choiceValues as string[] | null) ?? (a.textValue ? [a.textValue] : []);
          for (const c of choices) {
            choiceCounts[c] = (choiceCounts[c] ?? 0) + 1;
          }
        }
        return { questionId: q.id, label: q.label, type: q.type, responseCount, avg: null, distribution: choiceCounts };
      });

    // Revenue-weighted intelligence (best-effort)
    const survey = await this.resolveSurvey(workspaceId, surveyId);
    let revenueWeighted: RevenueWeightedInsight | null = null;
    try {
      revenueWeighted = await this.surveyIntelligenceService.computeRevenueWeightedIntelligence(workspaceId, surveyId);
      await this.surveyIntelligenceService.persistIntelligenceScores(surveyId, revenueWeighted);
    } catch (_err) {
      // Non-critical
    }

    return {
      surveyId,
      totalResponses,
      processedCount,
      avgSentiment: avgSentiment !== null ? parseFloat(avgSentiment.toFixed(3)) : null,
      avgNps: avgNps !== null ? parseFloat(avgNps.toFixed(2)) : null,
      avgRating: avgRating !== null ? parseFloat(avgRating.toFixed(2)) : null,
      npsScore,
      linkedThemeIds,
      /** Linked global themes with titles — derived from survey text responses that were
       *  converted to Feedback and subsequently clustered by the AI engine. */
      linkedThemes,
      keyTopics,
      npsResponseCount: npsValues.length,
      ratingResponseCount: ratingValues.length,
      textResponseCount: feedbackIds.length,
      insightScore,
      sentimentDistribution,
      topFeatureRequests,
      topPainPoints,
      /** Per-question structured analytics for NPS / Rating / Choice questions.
       *  These are evidence breakdowns, NOT text-derived themes. */
      questionBreakdowns,
      revenueWeighted,
      surveyType: survey.surveyType,
      validationScore: revenueWeighted?.validationScore ?? survey.validationScore ?? null,
      revenueWeightedScore: revenueWeighted?.revenueWeightedScore ?? survey.revenueWeightedScore ?? null,
    };
  }
}

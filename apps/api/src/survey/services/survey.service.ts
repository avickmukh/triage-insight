import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { SurveyStatus, SurveyType, FeedbackSourceType, FeedbackStatus } from '@prisma/client';
import { SURVEY_INTELLIGENCE_QUEUE } from '../processors/survey-intelligence.processor';
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
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(SURVEY_INTELLIGENCE_QUEUE) private readonly intelligenceQueue: Queue,
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

    // Create the response + answers in a transaction
    const response = await this.prisma.$transaction(async (tx) => {
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
        include: {
          answers: true,
        },
      });

      // ── Intelligence readiness: convert text answers to Feedback ──────────
      if (survey.convertToFeedback) {
        const textAnswers = dto.answers.filter((a) => a.textValue && a.textValue.trim().length > 10);
        if (textAnswers.length > 0) {
          // Combine all text answers into a single feedback description
          const questionMap = new Map(survey.questions.map((q) => [q.id, q.label]));
          const parts = textAnswers.map((a) => {
            const qLabel = questionMap.get(a.questionId) ?? 'Response';
            return `**${qLabel}**: ${a.textValue!.trim()}`;
          });
          const description = parts.join('\n\n');
          const title = `Survey response: ${survey.title}`;

          const feedback = await tx.feedback.create({
            data: {
              workspaceId: workspace.id,
              sourceType: FeedbackSourceType.SURVEY,
              sourceRef: `survey:${surveyId}`,
              title,
              description,
              rawText: description,
              status: FeedbackStatus.NEW,
              portalUserId,
              metadata: {
                surveyId,
                surveyTitle: survey.title,
                responseId: resp.id,
                respondentEmail: dto.respondentEmail ?? null,
              },
            },
          });

          // Update response to link to the created feedback
          await tx.surveyResponse.update({
            where: { id: resp.id },
            data: { feedbackId: feedback.id },
          });

          return { ...resp, feedbackId: feedback.id };
        }
      }

      return resp;
    });

    // ── Enqueue async intelligence extraction (fire-and-forget) ──────────────
    const feedbackId = (response as any).feedbackId ?? null;
    this.intelligenceQueue
      .add({
        workspaceId: workspace.id,
        surveyId,
        responseId: response.id,
        feedbackId,
      })
      .catch(() => { /* non-critical — intelligence enrichment is best-effort */ });

    return {
      success: true,
      responseId: response.id,
      feedbackId,
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

    // Linked themes from feedback
    const feedbackIds = responses.map((r) => r.feedbackId).filter(Boolean) as string[];
    const linkedThemeIds: string[] = [];
    if (feedbackIds.length > 0) {
      const themeFeedbacks = await this.prisma.themeFeedback.findMany({
        where: { feedbackId: { in: feedbackIds } },
        select: { themeId: true },
      });
      const uniqueThemeIds = [...new Set(themeFeedbacks.map((tf) => tf.themeId))];
      linkedThemeIds.push(...uniqueThemeIds);
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
      keyTopics,
      npsResponseCount: npsValues.length,
      ratingResponseCount: ratingValues.length,
      textResponseCount: feedbackIds.length,
      insightScore,
      sentimentDistribution,
      topFeatureRequests,
      topPainPoints,
      revenueWeighted,
      surveyType: survey.surveyType,
      validationScore: revenueWeighted?.validationScore ?? survey.validationScore ?? null,
      revenueWeightedScore: revenueWeighted?.revenueWeightedScore ?? survey.revenueWeightedScore ?? null,
    };
  }
}

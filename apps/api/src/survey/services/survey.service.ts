import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SurveyStatus, FeedbackSourceType, FeedbackStatus } from '@prisma/client';
import {
  CreateSurveyDto,
  UpdateSurveyDto,
  CreateSurveyQuestionDto,
  UpdateSurveyQuestionDto,
  SubmitSurveyResponseDto,
  SurveyQueryDto,
} from '../dto/survey.dto';

@Injectable()
export class SurveyService {
  constructor(private readonly prisma: PrismaService) {}

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
        convertToFeedback: dto.convertToFeedback ?? true,
        thankYouMessage: dto.thankYouMessage ?? null,
        redirectUrl: dto.redirectUrl ?? null,
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
        convertToFeedback: dto.convertToFeedback,
        thankYouMessage: dto.thankYouMessage,
        redirectUrl: dto.redirectUrl,
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

    return {
      success: true,
      responseId: response.id,
      feedbackId: (response as any).feedbackId ?? null,
      thankYouMessage: survey.thankYouMessage ?? 'Thank you for your response!',
      redirectUrl: survey.redirectUrl ?? null,
    };
  }
}

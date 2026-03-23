import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../workspace/guards/roles.guard';
import { Roles } from '../workspace/decorators/roles.decorator';
import { WorkspaceRole } from '@prisma/client';
import { SurveyService } from './services/survey.service';
import {
  CreateSurveyDto,
  UpdateSurveyDto,
  CreateSurveyQuestionDto,
  UpdateSurveyQuestionDto,
  SubmitSurveyResponseDto,
  SurveyQueryDto,
} from './dto/survey.dto';

// ─── Workspace-authenticated survey endpoints ─────────────────────────────────

@Controller('workspaces/:workspaceId/surveys')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SurveyController {
  constructor(private readonly surveyService: SurveyService) {}

  @Post()
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateSurveyDto,
  ) {
    return this.surveyService.createSurvey(workspaceId, dto);
  }

  @Get()
  list(
    @Param('workspaceId') workspaceId: string,
    @Query() query: SurveyQueryDto,
  ) {
    return this.surveyService.listSurveys(workspaceId, query);
  }

  @Get(':surveyId')
  detail(
    @Param('workspaceId') workspaceId: string,
    @Param('surveyId') surveyId: string,
  ) {
    return this.surveyService.getSurveyDetail(workspaceId, surveyId);
  }

  @Patch(':surveyId')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('surveyId') surveyId: string,
    @Body() dto: UpdateSurveyDto,
  ) {
    return this.surveyService.updateSurvey(workspaceId, surveyId, dto);
  }

  @Post(':surveyId/publish')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  @HttpCode(HttpStatus.OK)
  publish(
    @Param('workspaceId') workspaceId: string,
    @Param('surveyId') surveyId: string,
  ) {
    return this.surveyService.publishSurvey(workspaceId, surveyId);
  }

  @Post(':surveyId/unpublish')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  @HttpCode(HttpStatus.OK)
  unpublish(
    @Param('workspaceId') workspaceId: string,
    @Param('surveyId') surveyId: string,
  ) {
    return this.surveyService.unpublishSurvey(workspaceId, surveyId);
  }

  @Post(':surveyId/close')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  @HttpCode(HttpStatus.OK)
  close(
    @Param('workspaceId') workspaceId: string,
    @Param('surveyId') surveyId: string,
  ) {
    return this.surveyService.closeSurvey(workspaceId, surveyId);
  }

  @Delete(':surveyId')
  @Roles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('surveyId') surveyId: string,
  ) {
    return this.surveyService.deleteSurvey(workspaceId, surveyId);
  }

  // ─── Questions ─────────────────────────────────────────────────────────────

  @Post(':surveyId/questions')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  addQuestion(
    @Param('workspaceId') workspaceId: string,
    @Param('surveyId') surveyId: string,
    @Body() dto: CreateSurveyQuestionDto,
  ) {
    return this.surveyService.addQuestion(workspaceId, surveyId, dto);
  }

  @Patch(':surveyId/questions/:questionId')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  updateQuestion(
    @Param('workspaceId') workspaceId: string,
    @Param('surveyId') surveyId: string,
    @Param('questionId') questionId: string,
    @Body() dto: UpdateSurveyQuestionDto,
  ) {
    return this.surveyService.updateQuestion(workspaceId, surveyId, questionId, dto);
  }

  @Delete(':surveyId/questions/:questionId')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  @HttpCode(HttpStatus.OK)
  deleteQuestion(
    @Param('workspaceId') workspaceId: string,
    @Param('surveyId') surveyId: string,
    @Param('questionId') questionId: string,
  ) {
    return this.surveyService.deleteQuestion(workspaceId, surveyId, questionId);
  }

  // ─── Responses ─────────────────────────────────────────────────────────────

  @Get(':surveyId/responses')
  listResponses(
    @Param('workspaceId') workspaceId: string,
    @Param('surveyId') surveyId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.surveyService.listResponses(workspaceId, surveyId, Number(page) || 1, Number(limit) || 20);
  }

  // ─── Intelligence ───────────────────────────────────────────────────────────

  @Get(':surveyId/intelligence')
  intelligence(
    @Param('workspaceId') workspaceId: string,
    @Param('surveyId') surveyId: string,
  ) {
    return this.surveyService.getSurveyIntelligence(workspaceId, surveyId);
  }
}

// ─── Public portal survey endpoints (no auth) ────────────────────────────────

@Controller('portal/:orgSlug/surveys')
export class PublicSurveyController {
  constructor(private readonly surveyService: SurveyService) {}

  @Get()
  listPublic(@Param('orgSlug') orgSlug: string) {
    return this.surveyService.listPublicSurveys(orgSlug);
  }

  @Get(':surveyId')
  getPublic(
    @Param('orgSlug') orgSlug: string,
    @Param('surveyId') surveyId: string,
  ) {
    return this.surveyService.getPublicSurvey(orgSlug, surveyId);
  }

  @Post(':surveyId/responses')
  @HttpCode(HttpStatus.CREATED)
  submit(
    @Param('orgSlug') orgSlug: string,
    @Param('surveyId') surveyId: string,
    @Body() dto: SubmitSurveyResponseDto,
  ) {
    return this.surveyService.submitResponse(orgSlug, surveyId, dto);
  }
}

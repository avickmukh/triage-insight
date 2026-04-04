import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../workspace/guards/roles.guard';
import { Roles } from '../../workspace/decorators/roles.decorator';
import { WorkspaceRole, DuplicateSuggestionStatus } from '@prisma/client';
import { DuplicateSuggestionsService } from '../services/duplicate-suggestions.service';
import { IsEnum, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

class DuplicateSuggestionQueryDto {
  @IsOptional()
  @IsEnum(DuplicateSuggestionStatus)
  @Transform(({ value }) => value?.toUpperCase())
  status?: DuplicateSuggestionStatus;
}

interface AuthenticatedRequest {
  user: { sub: string; email: string };
}

/**
 * DuplicateSuggestionsController
 *
 * Routes:
 *   GET  /workspaces/:workspaceId/duplicate-suggestions
 *   GET  /workspaces/:workspaceId/feedback/:feedbackId/duplicate-suggestions
 *   POST /workspaces/:workspaceId/duplicate-suggestions/:suggestionId/accept
 *   POST /workspaces/:workspaceId/duplicate-suggestions/:suggestionId/reject
 */
@Controller('workspaces/:workspaceId')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DuplicateSuggestionsController {
  constructor(
    private readonly duplicateSuggestionsService: DuplicateSuggestionsService,
  ) {}

  /**
   * List all PENDING (or filtered) duplicate suggestions for the workspace.
   * Accessible by all roles so reviewers can triage.
   */
  @Get('duplicate-suggestions')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  listForWorkspace(
    @Param('workspaceId') workspaceId: string,
    @Query() query: DuplicateSuggestionQueryDto,
  ) {
    return this.duplicateSuggestionsService.listForWorkspace(
      workspaceId,
      query.status,
    );
  }

  /**
   * List duplicate suggestions for a specific feedback item.
   * Accessible by all roles.
   */
  @Get('feedback/:feedbackId/duplicate-suggestions')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  listForFeedback(
    @Param('workspaceId') workspaceId: string,
    @Param('feedbackId') feedbackId: string,
    @Query() query: DuplicateSuggestionQueryDto,
  ) {
    return this.duplicateSuggestionsService.listForFeedback(
      workspaceId,
      feedbackId,
      query.status,
    );
  }

  /**
   * Accept a duplicate suggestion.
   * Triggers a merge: source is marked MERGED, mergedIntoId = target.
   * ADMIN and EDITOR only — Viewers cannot make merge decisions.
   */
  @Post('duplicate-suggestions/:suggestionId/accept')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  accept(
    @Param('workspaceId') workspaceId: string,
    @Param('suggestionId') suggestionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.duplicateSuggestionsService.accept(
      workspaceId,
      suggestionId,
      req.user.sub,
    );
  }

  /**
   * Reject a duplicate suggestion.
   * Marks it REJECTED so it does not reappear in PENDING lists.
   * ADMIN and EDITOR only.
   */
  @Post('duplicate-suggestions/:suggestionId/reject')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  reject(
    @Param('workspaceId') workspaceId: string,
    @Param('suggestionId') suggestionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.duplicateSuggestionsService.reject(
      workspaceId,
      suggestionId,
      req.user.sub,
    );
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PublicPortalService } from './public-portal.service';
import { PublicVoteDto } from './dto/public-vote.dto';
import { PublicCommentDto } from './dto/public-comment.dto';
import { PublicFeedbackQueryDto } from './dto/public-feedback-query.dto';

/**
 * Public portal endpoints — no authentication required.
 *
 * All routes are prefixed with /public/:workspaceSlug to scope them to a
 * specific workspace identified by its human-readable slug.
 *
 * Full resolved paths (with global api/v1 prefix):
 *   GET  /api/v1/public/:workspaceSlug/feedback
 *   GET  /api/v1/public/:workspaceSlug/feedback/:id
 *   GET  /api/v1/public/:workspaceSlug/roadmap
 *   POST /api/v1/public/:workspaceSlug/feedback/:id/vote
 *   POST /api/v1/public/:workspaceSlug/feedback/:id/comments
 */
@Controller('public/:workspaceSlug')
export class PublicPortalController {
  constructor(private readonly service: PublicPortalService) {}

  // ─── Feedback List ────────────────────────────────────────────────────────

  @Get('feedback')
  listFeedback(
    @Param('workspaceSlug') workspaceSlug: string,
    @Query() query: PublicFeedbackQueryDto,
  ) {
    return this.service.listFeedback(workspaceSlug, query);
  }

  // ─── Feedback Detail ──────────────────────────────────────────────────────

  @Get('feedback/:id')
  getFeedbackDetail(
    @Param('workspaceSlug') workspaceSlug: string,
    @Param('id') id: string,
  ) {
    return this.service.getFeedbackDetail(workspaceSlug, id);
  }

  // ─── Roadmap ──────────────────────────────────────────────────────────────

  @Get('roadmap')
  listRoadmap(@Param('workspaceSlug') workspaceSlug: string) {
    return this.service.listRoadmap(workspaceSlug);
  }

  // ─── Vote ─────────────────────────────────────────────────────────────────

  @Post('feedback/:id/vote')
  @HttpCode(HttpStatus.CREATED)
  vote(
    @Param('workspaceSlug') workspaceSlug: string,
    @Param('id') id: string,
    @Body() dto: PublicVoteDto,
  ) {
    return this.service.vote(workspaceSlug, id, dto);
  }

  // ─── Comment ──────────────────────────────────────────────────────────────

  @Post('feedback/:id/comments')
  @HttpCode(HttpStatus.CREATED)
  addComment(
    @Param('workspaceSlug') workspaceSlug: string,
    @Param('id') id: string,
    @Body() dto: PublicCommentDto,
  ) {
    return this.service.addComment(workspaceSlug, id, dto);
  }
}

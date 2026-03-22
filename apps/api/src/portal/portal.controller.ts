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
import { PortalService } from './portal.service';
import { PortalCreateFeedbackDto } from './dto/portal-create-feedback.dto';
import { PublicFeedbackQueryDto } from '../public/dto/public-feedback-query.dto';
import { PublicVoteDto } from '../public/dto/public-vote.dto';
import { PublicCommentDto } from '../public/dto/public-comment.dto';

/**
 * Workspace-scoped public portal endpoints — no authentication required.
 *
 * All routes are prefixed with /portal/:orgSlug to match the multi-tenant
 * architecture where :orgSlug is the human-readable workspace identifier.
 *
 * Full resolved paths (with global api/v1 prefix):
 *   GET  /api/v1/portal/:orgSlug/feedback
 *   GET  /api/v1/portal/:orgSlug/feedback/:id
 *   POST /api/v1/portal/:orgSlug/feedback
 *   GET  /api/v1/portal/:orgSlug/roadmap
 *   POST /api/v1/portal/:orgSlug/feedback/:id/vote
 *   POST /api/v1/portal/:orgSlug/feedback/:id/comments
 */
@Controller('portal/:orgSlug')
export class PortalController {
  constructor(private readonly service: PortalService) {}

  // ─── 1. Feedback List ─────────────────────────────────────────────────────

  @Get('feedback')
  listFeedback(
    @Param('orgSlug') orgSlug: string,
    @Query() query: PublicFeedbackQueryDto,
  ) {
    return this.service.listFeedback(orgSlug, query);
  }

  // ─── 2. Feedback Detail ───────────────────────────────────────────────────

  @Get('feedback/:id')
  getFeedbackDetail(
    @Param('orgSlug') orgSlug: string,
    @Param('id') id: string,
  ) {
    return this.service.getFeedbackDetail(orgSlug, id);
  }

  // ─── 3. Create Feedback ───────────────────────────────────────────────────

  @Post('feedback')
  @HttpCode(HttpStatus.CREATED)
  createFeedback(
    @Param('orgSlug') orgSlug: string,
    @Body() dto: PortalCreateFeedbackDto,
  ) {
    return this.service.createFeedback(orgSlug, dto);
  }

  // ─── 4. Roadmap ───────────────────────────────────────────────────────────

  @Get('roadmap')
  listRoadmap(@Param('orgSlug') orgSlug: string) {
    return this.service.listRoadmap(orgSlug);
  }

  // ─── 5. Vote ──────────────────────────────────────────────────────────────

  @Post('feedback/:id/vote')
  @HttpCode(HttpStatus.CREATED)
  vote(
    @Param('orgSlug') orgSlug: string,
    @Param('id') id: string,
    @Body() dto: PublicVoteDto,
  ) {
    return this.service.vote(orgSlug, id, dto);
  }

  // ─── 6. Comment ───────────────────────────────────────────────────────────

  @Post('feedback/:id/comments')
  @HttpCode(HttpStatus.CREATED)
  addComment(
    @Param('orgSlug') orgSlug: string,
    @Param('id') id: string,
    @Body() dto: PublicCommentDto,
  ) {
    return this.service.addComment(orgSlug, id, dto);
  }
}

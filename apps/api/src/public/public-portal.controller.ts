import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Request, Response } from 'express';
import { PublicPortalService } from './public-portal.service';
import { PortalSseGateway, SseMessage } from './gateway/portal-sse.gateway';
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
 *   GET  /api/v1/public/:workspaceSlug/events  ← SSE stream
 */
@Controller('public/:workspaceSlug')
export class PublicPortalController {
  constructor(
    private readonly service: PublicPortalService,
    private readonly sseGateway: PortalSseGateway,
  ) {}

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

  // ─── SSE Event Stream ─────────────────────────────────────────────────────

  /**
   * GET /api/v1/public/:workspaceSlug/events
   *
   * Server-Sent Events stream scoped to a single workspace.
   * Clients receive real-time notifications for:
   *   - FEEDBACK_CREATED
   *   - FEEDBACK_VOTED
   *   - FEEDBACK_COMMENTED
   *   - ROADMAP_STATUS_CHANGED
   *   - PING (keepalive every 30s)
   */
  @Sse('events')
  sseEvents(
    @Param('workspaceSlug') workspaceSlug: string,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Observable<SseMessage> {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Register the client and get its Subject
    const subject = this.sseGateway.subscribe(workspaceSlug);

    // Send an initial PING so the client knows the connection is live
    subject.next({
      data: JSON.stringify({ ts: new Date().toISOString() }),
      type: 'PING',
    });

    // Keepalive ping every 30 seconds
    const pingInterval = setInterval(() => {
      if (!subject.closed) {
        this.sseGateway.ping(workspaceSlug);
      }
    }, 30_000);

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(pingInterval);
      this.sseGateway.unsubscribe(workspaceSlug, subject);
    });

    return subject.asObservable();
  }
}

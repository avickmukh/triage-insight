import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { UpdateFeedbackDto } from './dto/update-feedback.dto';
import { QueryFeedbackDto } from './dto/query-feedback.dto';
import { SemanticSearchDto } from './dto/semantic-search.dto';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { ConfirmAttachmentDto } from './dto/confirm-attachment.dto';
import { PublicFeedbackDto } from './dto/public-feedback.dto';
import { BulkDismissFeedbackDto, BulkAssignFeedbackDto } from './dto/bulk-feedback.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../workspace/guards/roles.guard';
import { Roles } from '../workspace/decorators/roles.decorator';
import { WorkspaceRole } from '@prisma/client';
import { PublicPortalService } from './ingestion/public-portal.service';
import { CsvImportService } from './ingestion/csv-import.service';

interface AuthenticatedRequest {
  user: { sub: string; email: string };
}

// Public endpoint for portal submissions
@Controller('public/feedback')
export class PublicFeedbackController {
  constructor(private readonly publicPortalService: PublicPortalService) {}

  @Post(':workspaceSlug')
  submitFeedback(
    @Param('workspaceSlug') workspaceSlug: string,
    @Body() dto: PublicFeedbackDto,
  ) {
    return this.publicPortalService.submit(workspaceSlug, dto);
  }
}

@Controller('workspaces/:workspaceId/feedback')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FeedbackController {
  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly csvImportService: CsvImportService,
  ) {}

  // ─── Collection routes (no :id segment) ────────────────────────────────────
  // IMPORTANT: All static routes MUST be declared before any :id routes to
  // prevent NestJS from matching e.g. GET /semantic-search as GET /:id.

  @Post()
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() createFeedbackDto: CreateFeedbackDto,
  ) {
    return this.feedbackService.create(workspaceId, createFeedbackDto);
  }

  @Get()
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  findAll(
    @Param('workspaceId') workspaceId: string,
    @Query() query: QueryFeedbackDto,
  ) {
    return this.feedbackService.findAll(workspaceId, query);
  }

  // --- Semantic Search ---
  /**
   * GET /workspaces/:workspaceId/feedback/semantic-search?q=<query>&limit=<n>&threshold=<t>
   *
   * Generates an embedding for `q` and returns the top feedback items ranked
   * by cosine similarity.  Only feedback that has been through the AI pipeline
   * (embedding IS NOT NULL) is considered.
   *
   * MUST be declared before `:id` routes to avoid NestJS routing conflicts
   * (otherwise NestJS matches 'semantic-search' as the :id parameter).
   */
  @Get('semantic-search')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  semanticSearch(
    @Param('workspaceId') workspaceId: string,
    @Query() dto: SemanticSearchDto,
  ) {
    return this.feedbackService.semanticSearch(workspaceId, dto);
  }

  // --- Bulk AI pipeline re-trigger ---
  /**
   * POST /workspaces/:workspaceId/feedback/reprocess-pipeline
   *
   * Re-enqueues the AI analysis job (embedding → sentiment → clustering) for
   * every feedback item in this workspace that has not yet been processed
   * (embedding IS NULL) or has never been assigned to a theme.
   *
   * MUST be declared before `:id` routes to avoid NestJS routing conflicts.
   */
  @Post('reprocess-pipeline')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  reprocessPipeline(
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.feedbackService.reprocessPipeline(workspaceId);
  }

  // --- Ingestion ---
  /**
   * POST /workspaces/:workspaceId/feedback/import/csv/headers
   * Parses a CSV file and returns detected column headers + 3 preview rows.
   * Used by the frontend column-mapping step BEFORE the actual import.
   * MUST be declared before `:id` routes to avoid NestJS routing conflicts.
   */
  @Post('import/csv/headers')
  @UseInterceptors(FileInterceptor('file'))
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  parseCsvHeaders(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 })],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.csvImportService.parseHeaders(file.buffer);
  }

  /**
   * POST /workspaces/:workspaceId/feedback/import/csv
   * Accepts an optional JSON `mapping` field alongside the file.
   * mapping = { feedbackText: 'col', title?: 'col', customerEmail?: 'col', source?: 'col' }
   * MUST be declared before `:id` routes to avoid NestJS routing conflicts.
   */
  @Post('import/csv')
  @UseInterceptors(FileInterceptor('file'))
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  importCsv(
    @Param('workspaceId') workspaceId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 })], // 10MB
      }),
    )
    file: Express.Multer.File,
    @Body('mapping') rawMapping?: string,
  ) {
    const mapping = rawMapping ? (JSON.parse(rawMapping) as import('./ingestion/csv-import.service').CsvColumnMapping) : undefined;
    return this.csvImportService.import(workspaceId, file.buffer, mapping);
  }

  // --- Pipeline status ---
  /**
   * GET /workspaces/:workspaceId/feedback/pipeline-status
   *
   * Returns the current AI pipeline progress for the workspace.
   * Used by the frontend to show a blocking progress indicator.
   * Survives tab close/re-login because state is persisted in AiJobLog.
   */
  @Get('pipeline-status')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getPipelineStatus(@Param('workspaceId') workspaceId: string) {
    return this.feedbackService.getPipelineStatus(workspaceId);
  }

  // ─── Bulk action routes (Step 3 Gap Fix) ─────────────────────────────────────
  /**
   * POST /workspaces/:workspaceId/feedback/bulk/dismiss
   * Sets status to ARCHIVED for all supplied feedbackIds.
   */
  @Post('bulk/dismiss')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  bulkDismiss(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: BulkDismissFeedbackDto,
  ) {
    return this.feedbackService.bulkDismiss(workspaceId, dto.feedbackIds);
  }

  /**
   * POST /workspaces/:workspaceId/feedback/bulk/assign
   * Links all supplied feedbackIds to the given themeId.
   */
  @Post('bulk/assign')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  bulkAssign(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: BulkAssignFeedbackDto,
  ) {
    return this.feedbackService.bulkAssignToTheme(workspaceId, dto.feedbackIds, dto.themeId);
  }

  // ─── Item routes (:id segment) ──────────────────────────────────────────────

  @Get(':id')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  findOne(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.feedbackService.findOne(workspaceId, id);
  }

  @Patch(':id')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() updateFeedbackDto: UpdateFeedbackDto,
  ) {
    return this.feedbackService.update(workspaceId, id, updateFeedbackDto);
  }

  @Delete(':id')
  @Roles(WorkspaceRole.ADMIN)
  remove(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.feedbackService.remove(workspaceId, id);
  }

  // --- Attachments ---

  @Post(':id/attachments/presigned-url')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  createAttachmentPresignedUrl(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() createAttachmentDto: CreateAttachmentDto,
  ) {
    return this.feedbackService.createAttachmentPresignedUrl(
      workspaceId,
      id,
      createAttachmentDto.fileName,
      createAttachmentDto.contentType,
    );
  }

  @Post(':id/attachments/confirm')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  confirmAttachment(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() confirmAttachmentDto: ConfirmAttachmentDto,
  ) {
    return this.feedbackService.confirmAttachment(
      workspaceId,
      id,
      confirmAttachmentDto.key,
      confirmAttachmentDto.fileName,
      confirmAttachmentDto.mimeType,
      confirmAttachmentDto.sizeBytes,
    );
  }

  // --- Comments ---
  /**
   * GET /workspaces/:workspaceId/feedback/:id/comments
   * Returns all comments for a feedback item, ordered by createdAt ascending.
   */
  @Get(':id/comments')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getComments(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.feedbackService.getComments(workspaceId, id);
  }

  /**
   * POST /workspaces/:workspaceId/feedback/:id/comments
   * Adds a comment to a feedback item. The authenticated user is recorded as
   * the author. Returns the created FeedbackComment.
   */
  @Post(':id/comments')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  addComment(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() body: { content: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.feedbackService.addComment(workspaceId, id, body.content, req.user.sub);
  }

  // --- Related Feedback ---
  /**
   * GET /workspaces/:workspaceId/feedback/:id/related
   *
   * Returns up to 10 semantically related feedback items using pgvector
   * cosine similarity on the stored embedding. Excludes the source item
   * itself and any MERGED items. Returns an empty array if the source
   * item has not yet been embedded.
   */
  @Get(':id/related')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  findRelated(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.feedbackService.findRelated(workspaceId, id);
  }

  // --- Duplicate Detection ---

  @Get(':id/potential-duplicates')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  findPotentialDuplicates(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.feedbackService.findPotentialDuplicates(workspaceId, id);
  }
}

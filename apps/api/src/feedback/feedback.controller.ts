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
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { ConfirmAttachmentDto } from './dto/confirm-attachment.dto';
import { PublicFeedbackDto } from './dto/public-feedback.dto';
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

  // --- Ingestion ---

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
  ) {
    return this.csvImportService.import(workspaceId, file.buffer);
  }
}

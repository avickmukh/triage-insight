import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../workspace/guards/roles.guard';
import { Roles } from '../workspace/decorators/roles.decorator';
import { WorkspaceRole } from '@prisma/client';
import { VoiceService } from './services/voice.service';
import { FinalizeVoiceUploadDto, VoicePresignedUrlDto } from './dto/voice.dto';

@Controller('workspaces/:workspaceId/voice')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  /**
   * POST /workspaces/:workspaceId/voice/presigned-url
   * Returns a presigned S3 PUT URL for the client to upload audio directly.
   * ADMIN and EDITOR only.
   */
  @Post('presigned-url')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  createPresignedUrl(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: VoicePresignedUrlDto,
  ) {
    return this.voiceService.createPresignedUploadUrl(workspaceId, dto);
  }

  /**
   * POST /workspaces/:workspaceId/voice/finalize
   * Called after the client has successfully PUT the file to S3.
   * Creates UploadAsset + AiJobLog and enqueues the transcription job.
   * ADMIN and EDITOR only.
   */
  @Post('finalize')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  finalizeUpload(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: FinalizeVoiceUploadDto,
  ) {
    return this.voiceService.finalizeUpload(workspaceId, dto);
  }

  /**
   * GET /workspaces/:workspaceId/voice
   * Lists all voice uploads for the workspace, enriched with job status and
   * linked feedback.  All roles can read.
   */
  @Get()
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  listUploads(
    @Param('workspaceId') workspaceId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.voiceService.listUploads(workspaceId, page, limit);
  }

  /**
   * GET /workspaces/:workspaceId/voice/:uploadAssetId
   * Returns full detail for a single upload including transcript, feedback
   * linkage, and a short-lived signed download URL.
   */
  @Get(':uploadAssetId')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  async getUpload(
    @Param('workspaceId') workspaceId: string,
    @Param('uploadAssetId') uploadAssetId: string,
  ) {
    const result = await this.voiceService.getUpload(workspaceId, uploadAssetId);
    if (!result) throw new NotFoundException('Upload not found');
    return result;
  }
}

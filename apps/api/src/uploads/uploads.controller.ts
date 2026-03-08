import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../workspace/guards/roles.guard';
import { Roles } from '../workspace/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { S3Service } from './services/s3.service';
import { CreateUploadDto } from './dto/create-upload.dto';

@Controller('workspaces/:workspaceId/uploads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UploadsController {
  constructor(private readonly s3Service: S3Service) {}

  @Post('presigned-url')
  @Roles(Role.ADMIN, Role.EDITOR)
  createPresignedUrl(
    @Param('workspaceId') workspaceId: string,
    @Body() createUploadDto: CreateUploadDto,
  ) {
    // Note: This is a generic endpoint. The feedback-specific one ties the upload to a feedback item.
    // This could be used for other upload types in the future.
    return this.s3Service.createPresignedUrl(
      workspaceId,
      createUploadDto.fileName,
      createUploadDto.contentType,
    );
  }
}

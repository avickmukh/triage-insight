import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FeedbackService } from '../feedback.service';
import { PublicFeedbackDto } from '../dto/public-feedback.dto';
import { FeedbackSourceType, FeedbackPrimarySource, FeedbackSecondarySource } from '@prisma/client';

@Injectable()
export class PublicPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feedbackService: FeedbackService,
  ) {}

  async submit(workspaceSlug: string, dto: PublicFeedbackDto) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug: workspaceSlug },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    return this.feedbackService.create(workspace.id, {
      ...dto,
      sourceType:      FeedbackSourceType.PUBLIC_PORTAL,
      primarySource:   FeedbackPrimarySource.FEEDBACK,
      secondarySource: FeedbackSecondarySource.PORTAL,
      customerId:      dto.email, // Use email as customer identifier
    });
  }
}

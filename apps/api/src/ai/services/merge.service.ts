import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from './audit.service';
import { FeedbackStatus, AuditLogAction } from '@prisma/client';

@Injectable()
export class MergeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async mergeFeedback(
    workspaceId: string,
    userId: string,
    targetId: string,
    sourceIds: string[],
  ) {
    if (sourceIds.includes(targetId)) {
      throw new BadRequestException('Cannot merge a feedback item into itself.');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Verify all feedback items exist in the workspace
      const feedbackToMerge = await tx.feedback.findMany({
        where: {
          id: { in: [targetId, ...sourceIds] },
          workspaceId,
        },
      });

      if (feedbackToMerge.length !== sourceIds.length + 1) {
        throw new NotFoundException('One or more feedback items not found in this workspace.');
      }

      // 2. Update source feedback items: set status to MERGED and link to target
      await tx.feedback.updateMany({
        where: {
          id: { in: sourceIds },
        },
        data: {
          status: FeedbackStatus.MERGED,
          mergedIntoId: targetId,
        },
      });

      // 3. Create audit log
      await this.auditService.logAction(workspaceId, userId, AuditLogAction.FEEDBACK_MERGE, {
        targetId,
        sourceIds,
      });

      // 4. Return the target feedback
      const targetFeedback = await tx.feedback.findUnique({ 
        where: { id: targetId },
        include: { mergedFrom: true }, // Include the newly linked records
      });

      return targetFeedback;
    });
  }
}

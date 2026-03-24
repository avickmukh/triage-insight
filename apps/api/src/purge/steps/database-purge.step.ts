import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PurgeService } from '../purge.service';
import { PurgeStepStatus } from '@prisma/client';

/**
 * DatabasePurgeStep
 *
 * Deletes the Workspace row from the database. Because every child table
 * has `onDelete: Cascade` on its `workspaceId` foreign key, a single
 * `prisma.workspace.delete()` call triggers a full cascade deletion of
 * all 35 workspace-scoped tables.
 *
 * The WorkspaceDeletionRequest and WorkspaceDeletionAuditLog records are
 * intentionally NOT cascade-deleted (they have no onDelete: Cascade on
 * workspaceId) so the audit trail is preserved after the workspace is gone.
 *
 * User records are NOT deleted — only WorkspaceMember rows are removed
 * via cascade. Users who had no other workspaces become "orphaned" users
 * (valid accounts with zero memberships). A separate periodic cleanup job
 * can handle these if required by policy.
 *
 * This step is idempotent: if the workspace is already deleted, it returns
 * successfully.
 */
@Injectable()
export class DatabasePurgeStep {
  private readonly logger = new Logger(DatabasePurgeStep.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly purgeService: PurgeService,
  ) {}

  async execute(deletionRequestId: string, workspaceId: string): Promise<void> {
    const startedAt = new Date();

    // Check if workspace still exists (idempotency guard)
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, slug: true },
    });

    if (!workspace) {
      this.logger.warn(
        `[DatabasePurgeStep] Workspace ${workspaceId} not found — already deleted. Skipping.`,
      );
      await this.purgeService.logStep(
        deletionRequestId,
        workspaceId,
        'PURGE_DATABASE',
        PurgeStepStatus.SUCCESS,
        { skipped: true, reason: 'Workspace already deleted' },
      );
      return;
    }

    // Count child records for the audit log before deletion
    const [
      feedbackCount,
      themeCount,
      customerCount,
      supportTicketCount,
      surveyCount,
      roadmapCount,
      memberCount,
    ] = await Promise.all([
      this.prisma.feedback.count({ where: { workspaceId } }),
      this.prisma.theme.count({ where: { workspaceId } }),
      this.prisma.customer.count({ where: { workspaceId } }),
      this.prisma.supportTicket.count({ where: { workspaceId } }),
      this.prisma.survey.count({ where: { workspaceId } }),
      this.prisma.roadmapItem.count({ where: { workspaceId } }),
      this.prisma.workspaceMember.count({ where: { workspaceId } }),
    ]);

    this.logger.log(
      `[DatabasePurgeStep] Deleting workspace ${workspaceId} (${workspace.name}) with ` +
        `${feedbackCount} feedback, ${themeCount} themes, ${customerCount} customers, ` +
        `${supportTicketCount} tickets, ${surveyCount} surveys, ${roadmapCount} roadmap items, ` +
        `${memberCount} members`,
    );

    // The single delete — cascades to all 35 child tables
    await this.prisma.workspace.delete({ where: { id: workspaceId } });

    this.logger.log(
      `[DatabasePurgeStep] Workspace ${workspaceId} deleted from database`,
    );

    await this.purgeService.logStep(
      deletionRequestId,
      workspaceId,
      'PURGE_DATABASE',
      PurgeStepStatus.SUCCESS,
      {
        workspaceName: workspace.name,
        workspaceSlug: workspace.slug,
        recordsDeleted: {
          feedback: feedbackCount,
          themes: themeCount,
          customers: customerCount,
          supportTickets: supportTicketCount,
          surveys: surveyCount,
          roadmapItems: roadmapCount,
          members: memberCount,
        },
        durationMs: Date.now() - startedAt.getTime(),
      },
    );
  }
}

import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { WorkspaceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * WorkspaceFreezeGuard
 *
 * Shared utility used by all mutation services (feedback, support, survey,
 * roadmap, integrations, AI processors) to reject writes when a workspace
 * has been frozen pending a data purge.
 *
 * Usage:
 *   await this.freezeGuard.assertNotFrozen(workspaceId);
 */
@Injectable()
export class WorkspaceFreezeGuard {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Throws UnprocessableEntityException if the workspace is FROZEN.
   * Safe to call in any service — returns void on success.
   */
  async assertNotFrozen(workspaceId: string): Promise<void> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { status: true },
    });

    if (workspace?.status === WorkspaceStatus.FROZEN) {
      throw new UnprocessableEntityException(
        'This workspace is currently frozen pending a scheduled data purge. ' +
          'All mutations are blocked. Contact your platform administrator.',
      );
    }
  }

  /**
   * Returns true if the workspace is frozen (non-throwing variant).
   * Useful for background job processors that need to skip silently.
   */
  async isFrozen(workspaceId: string): Promise<boolean> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { status: true },
    });
    return workspace?.status === WorkspaceStatus.FROZEN;
  }
}

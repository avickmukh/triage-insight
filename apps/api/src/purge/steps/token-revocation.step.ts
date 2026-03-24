import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PurgeService } from '../purge.service';
import { PurgeStepStatus } from '@prisma/client';

/**
 * TokenRevocationStep
 *
 * Revokes all RefreshTokens and invalidates PasswordResetTokens for users
 * whose LAST workspace membership is the one being purged.
 *
 * Users who belong to other workspaces are NOT affected — only their
 * WorkspaceMember record for this workspace will be cascade-deleted later
 * by the DatabasePurgeStep.
 *
 * This step is idempotent: re-running it after partial completion is safe.
 */
@Injectable()
export class TokenRevocationStep {
  private readonly logger = new Logger(TokenRevocationStep.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly purgeService: PurgeService,
  ) {}

  async execute(deletionRequestId: string, workspaceId: string): Promise<void> {
    const startedAt = new Date();

    // Find all users who are members of this workspace
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: { userId: true },
    });
    const userIds = members.map((m) => m.userId);

    if (userIds.length === 0) {
      await this.purgeService.logStep(
        deletionRequestId,
        workspaceId,
        'REVOKE_TOKENS',
        PurgeStepStatus.SUCCESS,
        { usersRevoked: 0, reason: 'No members found' },
      );
      return;
    }

    // Identify users whose ONLY remaining workspace is this one
    const usersWithSingleMembership = await this.prisma.workspaceMember.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds } },
      _count: { workspaceId: true },
      having: { workspaceId: { _count: { equals: 1 } } },
    });

    const singleMembershipUserIds = usersWithSingleMembership.map((u) => u.userId);

    let revokedCount = 0;
    let resetCount = 0;

    if (singleMembershipUserIds.length > 0) {
      // Revoke all refresh tokens for these users
      const revoked = await this.prisma.refreshToken.updateMany({
        where: { userId: { in: singleMembershipUserIds }, revoked: false },
        data: { revoked: true },
      });
      revokedCount = revoked.count;

      // Delete password reset tokens for these users
      const deleted = await this.prisma.passwordResetToken.deleteMany({
        where: { userId: { in: singleMembershipUserIds } },
      });
      resetCount = deleted.count;

      this.logger.log(
        `[TokenRevocationStep] Revoked ${revokedCount} refresh tokens and deleted ${resetCount} reset tokens for ${singleMembershipUserIds.length} users`,
      );
    }

    await this.purgeService.logStep(
      deletionRequestId,
      workspaceId,
      'REVOKE_TOKENS',
      PurgeStepStatus.SUCCESS,
      {
        totalMembers: userIds.length,
        singleMembershipUsers: singleMembershipUserIds.length,
        refreshTokensRevoked: revokedCount,
        passwordResetTokensDeleted: resetCount,
        durationMs: Date.now() - startedAt.getTime(),
      },
    );
  }
}

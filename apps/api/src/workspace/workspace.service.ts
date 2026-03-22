import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceRole } from '@prisma/client';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import * as crypto from 'crypto';

/** SHA-256 hash of a raw token string (hex). */
function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentWorkspace(userId: string) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId },
      include: { workspace: true },
    });
    if (!membership) {
      throw new NotFoundException('You are not a member of any workspace.');
    }
    return membership.workspace;
  }

  async updateCurrentWorkspace(userId: string, updateWorkspaceDto: UpdateWorkspaceDto) {
    const workspace = await this.getCurrentWorkspace(userId);
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: workspace.id } },
    });
    if (!membership || membership.role !== WorkspaceRole.ADMIN) {
      throw new ForbiddenException('Only workspace admins can update workspace settings.');
    }
    return this.prisma.workspace.update({
      where: { id: workspace.id },
      data: updateWorkspaceDto,
    });
  }

  async getWorkspaceMembers(workspaceId: string) {
    return this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true, status: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
      // position is now a first-class field on WorkspaceMember — returned automatically
    });
  }

  /**
   * Create a WorkspaceInvite record.
   * Generates a random raw token, stores only its SHA-256 hash in the DB,
   * and returns the raw token to the caller so the frontend can build the invite URL.
   * In production, the raw token would be emailed directly; here it is returned
   * in the API response for copy-to-clipboard use.
   */
  async inviteMember(userId: string, dto: InviteMemberDto) {
    const workspace = await this.getCurrentWorkspace(userId);
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: workspace.id } },
    });
    if (!membership || membership.role !== WorkspaceRole.ADMIN) {
      throw new ForbiddenException('Only workspace admins can invite members.');
    }

    // Check if user is already a member
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) {
      const alreadyMember = await this.prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: existingUser.id, workspaceId: workspace.id } },
      });
      if (alreadyMember) {
        throw new ConflictException('This user is already a member of the workspace.');
      }
    }

    // Generate raw token — only the hash is persisted
    const rawToken = crypto.randomUUID();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prisma.workspaceInvite.upsert({
      where: { workspaceId_email: { workspaceId: workspace.id, email: dto.email } },
      create: {
        workspaceId: workspace.id,
        email: dto.email,
        firstName: dto.firstName ?? null,
        lastName: dto.lastName ?? null,
        position: dto.position ?? null,
        role: dto.role,
        invitedById: userId,
        expiresAt,
        token: tokenHash,
      },
      update: {
        firstName: dto.firstName ?? null,
        lastName: dto.lastName ?? null,
        position: dto.position ?? null,
        role: dto.role,
        invitedById: userId,
        expiresAt,
        usedAt: null,
        token: tokenHash,
      },
    });

    return {
      // Raw token returned so the frontend can construct the accept-invite URL.
      // The hash is stored in the DB; the raw token is never persisted.
      inviteToken: rawToken,
      email: dto.email,
      role: dto.role,
      expiresAt,
    };
  }

  async removeMember(adminUserId: string, targetUserId: string) {
    const workspace = await this.getCurrentWorkspace(adminUserId);
    const adminMembership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: adminUserId, workspaceId: workspace.id } },
    });
    if (!adminMembership || adminMembership.role !== WorkspaceRole.ADMIN) {
      throw new ForbiddenException('Only workspace admins can remove members.');
    }
    if (adminUserId === targetUserId) {
      throw new BadRequestException('You cannot remove yourself from the workspace.');
    }
    const targetMembership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId: workspace.id } },
    });
    if (!targetMembership) {
      throw new NotFoundException('Member not found in this workspace.');
    }
    await this.prisma.workspaceMember.delete({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId: workspace.id } },
    });
    return { message: 'Member removed successfully.' };
  }

  async updateMemberRole(adminUserId: string, targetUserId: string, dto: UpdateMemberRoleDto) {
    const workspace = await this.getCurrentWorkspace(adminUserId);
    const adminMembership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: adminUserId, workspaceId: workspace.id } },
    });
    if (!adminMembership || adminMembership.role !== WorkspaceRole.ADMIN) {
      throw new ForbiddenException('Only workspace admins can change member roles.');
    }
    if (adminUserId === targetUserId) {
      throw new BadRequestException('You cannot change your own role.');
    }
    const targetMembership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId: workspace.id } },
    });
    if (!targetMembership) {
      throw new NotFoundException('Member not found in this workspace.');
    }
    return this.prisma.workspaceMember.update({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId: workspace.id } },
      data: { role: dto.role },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
  }

  async getPendingInvites(userId: string) {
    const workspace = await this.getCurrentWorkspace(userId);
    return this.prisma.workspaceInvite.findMany({
      where: { workspaceId: workspace.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvite(adminUserId: string, inviteId: string) {
    const workspace = await this.getCurrentWorkspace(adminUserId);
    const adminMembership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: adminUserId, workspaceId: workspace.id } },
    });
    if (!adminMembership || adminMembership.role !== WorkspaceRole.ADMIN) {
      throw new ForbiddenException('Only workspace admins can revoke invites.');
    }
    const invite = await this.prisma.workspaceInvite.findFirst({
      where: { id: inviteId, workspaceId: workspace.id },
    });
    if (!invite) throw new NotFoundException('Invite not found.');
    await this.prisma.workspaceInvite.delete({ where: { id: inviteId } });
    return { message: 'Invite revoked.' };
  }
}

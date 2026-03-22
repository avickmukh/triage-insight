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
    });
  }

  /**
   * Create a WorkspaceInvite record.
   * In production this would also send an email; here we return the token so the
   * frontend can construct the invite link (e.g. for display / copy-to-clipboard).
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

    // Upsert invite (re-invite resets the token and expiry)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const invite = await this.prisma.workspaceInvite.upsert({
      where: { workspaceId_email: { workspaceId: workspace.id, email: dto.email } },
      create: {
        workspaceId: workspace.id,
        email: dto.email,
        role: dto.role,
        invitedById: userId,
        expiresAt,
      },
      update: {
        role: dto.role,
        invitedById: userId,
        expiresAt,
        usedAt: null,
      },
    });

    return {
      inviteToken: invite.token,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
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

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitService } from '../billing/plan-limit.service';
import { EmailService } from '../email/email.service';
import { DomainVerificationStatus, WorkspaceRole } from '@prisma/client';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { SetDomainDto } from './dto/set-domain.dto';
import { UpdatePortalSettingsDto } from './dto/update-portal-settings.dto';
import * as crypto from 'crypto';

/** SHA-256 hash of a raw token string (hex). */
function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimit: PlanLimitService,
    private readonly emailService: EmailService,
  ) {}

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

  async updateCurrentWorkspace(
    userId: string,
    updateWorkspaceDto: UpdateWorkspaceDto,
  ) {
    const workspace = await this.getCurrentWorkspace(userId);
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: workspace.id } },
    });
    if (!membership || membership.role !== WorkspaceRole.ADMIN) {
      throw new ForbiddenException(
        'Only workspace admins can update workspace settings.',
      );
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
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            status: true,
          },
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

    // ── Plan limit: check seat and admin limits before issuing invite ─────────
    await this.planLimit.assertCanAddMember(workspace.id, dto.role);

    // Check if user is already a member
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      const alreadyMember = await this.prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: existingUser.id,
            workspaceId: workspace.id,
          },
        },
      });
      if (alreadyMember) {
        throw new ConflictException(
          'This user is already a member of the workspace.',
        );
      }
    }

    // Generate raw token — only the hash is persisted
    const rawToken = crypto.randomUUID();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prisma.workspaceInvite.upsert({
      where: {
        workspaceId_email: { workspaceId: workspace.id, email: dto.email },
      },
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

    const inviteLink = `https://app.triageinsight.com/accept-invite?token=${rawToken}`;

    await this.emailService.send({
      to: dto.email,
      subject: `You're invited to join ${workspace.name} on TriageInsight`,
      html: `<p>Click <a href="${inviteLink}">here</a> to accept your invitation.</p>`,
      text: `Accept your invitation here: ${inviteLink}`,
    });

    return {
      message: 'Invite sent successfully.',
      email: dto.email,
    };
  }

  async removeMember(adminUserId: string, targetUserId: string) {
    const workspace = await this.getCurrentWorkspace(adminUserId);
    const adminMembership = await this.prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId: adminUserId, workspaceId: workspace.id },
      },
    });
    if (!adminMembership || adminMembership.role !== WorkspaceRole.ADMIN) {
      throw new ForbiddenException('Only workspace admins can remove members.');
    }
    if (adminUserId === targetUserId) {
      throw new BadRequestException(
        'You cannot remove yourself from the workspace.',
      );
    }
    const targetMembership = await this.prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId: targetUserId, workspaceId: workspace.id },
      },
    });
    if (!targetMembership) {
      throw new NotFoundException('Member not found in this workspace.');
    }
    await this.prisma.workspaceMember.delete({
      where: {
        userId_workspaceId: { userId: targetUserId, workspaceId: workspace.id },
      },
    });
    return { message: 'Member removed successfully.' };
  }

  async updateMemberRole(
    adminUserId: string,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
  ) {
    const workspace = await this.getCurrentWorkspace(adminUserId);
    const adminMembership = await this.prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId: adminUserId, workspaceId: workspace.id },
      },
    });
    if (!adminMembership || adminMembership.role !== WorkspaceRole.ADMIN) {
      throw new ForbiddenException(
        'Only workspace admins can change member roles.',
      );
    }
    if (adminUserId === targetUserId) {
      throw new BadRequestException('You cannot change your own role.');
    }
    const targetMembership = await this.prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId: targetUserId, workspaceId: workspace.id },
      },
    });
    if (!targetMembership) {
      throw new NotFoundException('Member not found in this workspace.');
    }
    return this.prisma.workspaceMember.update({
      where: {
        userId_workspaceId: { userId: targetUserId, workspaceId: workspace.id },
      },
      data: { role: dto.role },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  /**
   * GET /workspace/current/limits
   * Returns current usage vs plan limits for the calling user's workspace.
   * Accessible to all authenticated members.
   */
  async getLimitSummary(userId: string) {
    const workspace = await this.getCurrentWorkspace(userId);
    return this.planLimit.getLimitSummary(workspace.id);
  }

  async getPendingInvites(userId: string) {
    const workspace = await this.getCurrentWorkspace(userId);
    return this.prisma.workspaceInvite.findMany({
      where: {
        workspaceId: workspace.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvite(adminUserId: string, inviteId: string) {
    const workspace = await this.getCurrentWorkspace(adminUserId);
    const adminMembership = await this.prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId: adminUserId, workspaceId: workspace.id },
      },
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

  // ── Domain management ────────────────────────────────────────────────────────

  /**
   * Returns the domain settings for the calling user's workspace.
   * Readable by all authenticated members.
   */
  async getDomainSettings(userId: string) {
    const workspace = await this.getCurrentWorkspace(userId);
    return {
      customDomain: workspace.customDomain ?? null,
      domainVerificationStatus: workspace.domainVerificationStatus,
      domainVerificationToken: workspace.domainVerificationToken ?? null,
      domainLastCheckedAt: workspace.domainLastCheckedAt ?? null,
      defaultDomain: `${workspace.slug}.triageinsight.com`,
    };
  }

  /**
   * Sets or updates the custom domain for the calling user's workspace.
   *
   * - Normalises the hostname to lowercase.
   * - Rejects domains already claimed by another workspace.
   * - Generates a fresh TXT verification token and resets status to PENDING.
   * - Does NOT perform live DNS lookup (that is triggered by verifyDomain).
   */
  async setDomain(adminUserId: string, dto: SetDomainDto) {
    const workspace = await this.getCurrentWorkspace(adminUserId);
    const normalised = dto.customDomain.toLowerCase().trim();

    // Prevent cross-workspace domain hijacking
    const existing = await this.prisma.workspace.findUnique({
      where: { customDomain: normalised },
    });
    if (existing && existing.id !== workspace.id) {
      throw new ConflictException(
        'This domain is already associated with another workspace.',
      );
    }

    // Generate a fresh verification token (TXT record value)
    const verificationToken = `triage-verify=${crypto.randomUUID()}`;

    const updated = await this.prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        customDomain: normalised,
        domainVerificationStatus: DomainVerificationStatus.PENDING,
        domainVerificationToken: verificationToken,
        domainLastCheckedAt: null,
      },
    });

    return {
      customDomain: updated.customDomain,
      domainVerificationStatus: updated.domainVerificationStatus,
      domainVerificationToken: updated.domainVerificationToken,
      domainLastCheckedAt: updated.domainLastCheckedAt,
      defaultDomain: `${workspace.slug}.triageinsight.com`,
    };
  }

  /**
   * Triggers a domain verification check.
   *
   * MVP implementation: marks the attempt timestamp and returns the current
   * state. Full DNS TXT lookup can be wired in here once a DNS resolver
   * library is added (e.g. `dns.promises.resolveTxt`).
   *
   * The caller should poll this endpoint after adding the TXT record to DNS.
   */
  async verifyDomain(adminUserId: string) {
    const workspace = await this.getCurrentWorkspace(adminUserId);

    if (!workspace.customDomain || !workspace.domainVerificationToken) {
      throw new BadRequestException(
        'No custom domain is configured. Set a domain before verifying.',
      );
    }

    const now = new Date();

    /*
     * TODO: Replace this stub with a real DNS TXT lookup:
     *
     *   import { promises as dns } from 'dns';
     *   const records = await dns.resolveTxt(workspace.customDomain).catch(() => []);
     *   const flat = records.flat();
     *   const verified = flat.includes(workspace.domainVerificationToken);
     *
     * Then set status to VERIFIED or FAILED accordingly.
     */
    const verified = false; // stub — always PENDING until DNS lookup is wired

    const newStatus = verified
      ? DomainVerificationStatus.VERIFIED
      : DomainVerificationStatus.PENDING;

    const updated = await this.prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        domainVerificationStatus: newStatus,
        domainLastCheckedAt: now,
      },
    });

    return {
      customDomain: updated.customDomain,
      domainVerificationStatus: updated.domainVerificationStatus,
      domainVerificationToken: updated.domainVerificationToken,
      domainLastCheckedAt: updated.domainLastCheckedAt,
      defaultDomain: `${workspace.slug}.triageinsight.com`,
    };
  }

  // ── Portal settings ───────────────────────────────────────────────────────

  /**
   * Returns the portal-specific subset of workspace settings.
   * Includes the computed portal URL (slug-based default or custom domain).
   */
  async getPortalSettings(userId: string) {
    const workspace = await this.getCurrentWorkspace(userId);
    const portalUrl = workspace.customDomain
      ? `https://${workspace.customDomain}`
      : `${process.env.FRONTEND_URL ?? 'https://app.triageinsight.com'}/${workspace.slug}/portal`;
    return {
      portalVisibility: workspace.portalVisibility,
      name: workspace.name,
      description: workspace.description,
      slug: workspace.slug,
      portalUrl,
      customDomain: workspace.customDomain,
      domainVerificationStatus: workspace.domainVerificationStatus,
    };
  }

  /**
   * Updates portal-specific settings (visibility, name, description).
   * ADMIN only — enforced at the controller level and re-checked here.
   */
  async updatePortalSettings(userId: string, dto: UpdatePortalSettingsDto) {
    const workspace = await this.getCurrentWorkspace(userId);
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: workspace.id } },
    });
    if (!membership || membership.role !== WorkspaceRole.ADMIN) {
      throw new ForbiddenException(
        'Only workspace admins can update portal settings.',
      );
    }
    const updated = await this.prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        ...(dto.portalVisibility !== undefined && {
          portalVisibility: dto.portalVisibility,
        }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });
    const portalUrl = updated.customDomain
      ? `https://${updated.customDomain}`
      : `${process.env.FRONTEND_URL ?? 'https://app.triageinsight.com'}/${updated.slug}/portal`;
    return {
      portalVisibility: updated.portalVisibility,
      name: updated.name,
      description: updated.description,
      slug: updated.slug,
      portalUrl,
    };
  }

  async removeDomain(adminUserId: string) {
    const workspace = await this.getCurrentWorkspace(adminUserId);

    if (!workspace.customDomain) {
      throw new BadRequestException(
        'No custom domain is currently configured.',
      );
    }

    const updated = await this.prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        customDomain: null,
        domainVerificationStatus: DomainVerificationStatus.UNVERIFIED,
        domainVerificationToken: null,
        domainLastCheckedAt: null,
      },
    });

    return {
      customDomain: updated.customDomain,
      domainVerificationStatus: updated.domainVerificationStatus,
      domainVerificationToken: updated.domainVerificationToken,
      domainLastCheckedAt: updated.domainLastCheckedAt,
      defaultDomain: `${workspace.slug}.triageinsight.com`,
    };
  }
}

import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { SignUpDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { SetupPasswordDto } from './dto/setup-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { WorkspaceRole, WorkspaceStatus } from '@prisma/client';

/** SHA-256 hash of a raw token string (hex). Used for invite token storage. */
function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Workspace User Auth ──────────────────────────────────────────────────

  /**
   * Register a new org admin and create their workspace.
   * Rejects if the org name or slug already exists.
   * Only the initial org admin can self-register; all other users must be invited.
   */
  async signUp(signUpDto: SignUpDto & { orgName?: string; orgSlug?: string }) {
    const { email, password, firstName, lastName, orgName, orgSlug } = signUpDto;

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('A user with this email already exists.');
    }

    const workspaceName = orgName?.trim() || `${firstName}'s Workspace`;
    const rawSlug = orgSlug?.trim()
      ? orgSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
      : workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const [nameConflict, slugConflict] = await Promise.all([
      this.prisma.workspace.findFirst({ where: { name: workspaceName } }),
      this.prisma.workspace.findFirst({ where: { slug: rawSlug } }),
    ]);
    if (nameConflict) {
      throw new ConflictException('An organisation with this name already exists.');
    }
    if (slugConflict) {
      throw new ConflictException('An organisation with this URL slug already exists.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { user } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash, firstName, lastName },
      });
      await tx.workspace.create({
        data: {
          name: workspaceName,
          slug: rawSlug,
          status: WorkspaceStatus.ACTIVE,
          members: {
            create: { userId: user.id, role: WorkspaceRole.ADMIN },
          },
        },
      });
      return { user };
    });

    return this.generateTokens(user.id, user.email);
  }

  /**
   * Workspace-scoped login: verifies the user is a member of the workspace
   * identified by orgSlug, and that the workspace is ACTIVE.
   * Falls back to global login when orgSlug is absent.
   */
  async login(loginDto: LoginDto & { orgSlug?: string }) {
    const { email, password, orgSlug } = loginDto;

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials.');
    }
    if (user.status === 'DISABLED') {
      throw new ForbiddenException('This account has been disabled.');
    }
    if (user.status === 'INVITED') {
      throw new ForbiddenException('Please set up your password using the invite link before logging in.');
    }

    if (orgSlug) {
      const workspace = await this.prisma.workspace.findUnique({ where: { slug: orgSlug } });
      if (!workspace) {
        throw new NotFoundException(`Workspace '${orgSlug}' not found.`);
      }
      // Gate on workspace lifecycle status
      if (workspace.status === WorkspaceStatus.SUSPENDED) {
        throw new ForbiddenException('This workspace has been suspended. Please contact support.');
      }
      if (workspace.status === WorkspaceStatus.DISABLED) {
        throw new ForbiddenException('This workspace has been disabled.');
      }
      if (workspace.status === WorkspaceStatus.PENDING) {
        throw new ForbiddenException('This workspace is not yet active.');
      }
      const membership = await this.prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
      });
      if (!membership) {
        throw new ForbiddenException('You are not a member of this workspace.');
      }
    }

    return this.generateTokens(user.id, user.email);
  }

  /**
   * Accepts an invite token (raw), hashes it, looks up the invite,
   * sets the user's password, and activates their account.
   */
  async setupPassword(dto: SetupPasswordDto) {
    const tokenHash = hashToken(dto.token);
    const invite = await this.prisma.workspaceInvite.findUnique({
      where: { token: tokenHash },
      include: { workspace: { select: { name: true, slug: true } } },
    });

    if (!invite) throw new NotFoundException('Invite token not found.');
    if (invite.usedAt) throw new BadRequestException('This invite link has already been used.');
    if (invite.expiresAt < new Date()) throw new BadRequestException('This invite link has expired.');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    let user = await this.prisma.user.findUnique({ where: { email: invite.email } });

    if (user) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, status: 'ACTIVE' },
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          email: invite.email,
          passwordHash,
          firstName: '',
          lastName: '',
          status: 'ACTIVE',
        },
      });
    }

    await this.prisma.workspaceMember.upsert({
      where: { userId_workspaceId: { userId: user.id, workspaceId: invite.workspaceId } },
      create: { userId: user.id, workspaceId: invite.workspaceId, role: invite.role },
      update: { role: invite.role },
    });

    await this.prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });

    return this.generateTokens(user.id, user.email);
  }

  async refreshToken(userId: string, refreshToken: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const rt = await this.prisma.refreshToken.findFirst({
      where: { token: refreshToken, userId, revoked: false },
    });
    if (!user || !rt || rt.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }
    // Rotate: revoke old token before issuing new one (prevents reuse)
    await this.prisma.refreshToken.update({ where: { id: rt.id }, data: { revoked: true } });
    return this.generateTokens(user.id, user.email);
  }

  async logout(userId: string, refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, token: refreshToken },
      data: { revoked: true },
    });
    return { message: 'Logout successful' };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    const { passwordHash: _pw, ...result } = user;
    return result;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
      },
    });
    const { passwordHash: _pw, ...result } = user;
    return result;
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect.');
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { message: 'Password changed successfully.' };
  }

  /**
   * Validate an invite token (raw) before the user fills in their password.
   * The raw token is hashed before lookup.
   */
  async getInviteInfo(rawToken: string) {
    const tokenHash = hashToken(rawToken);
    const invite = await this.prisma.workspaceInvite.findUnique({
      where: { token: tokenHash },
      include: { workspace: { select: { name: true, slug: true } } },
    });
    if (!invite) throw new NotFoundException('Invite token not found.');
    if (invite.usedAt) throw new BadRequestException('This invite link has already been used.');
    if (invite.expiresAt < new Date()) throw new BadRequestException('This invite link has expired.');
    return {
      email: invite.email,
      role: invite.role,
      workspaceName: invite.workspace.name,
      workspaceSlug: invite.workspace.slug,
    };
  }

  // ─── Portal User Auth ─────────────────────────────────────────────────────

  /**
   * Register a portal user (public-facing identity) for a specific workspace.
   * Email must be unique within the workspace.
   */
  async portalSignUp(workspaceSlug: string, dto: { email: string; name?: string; password: string }) {
    const workspace = await this.prisma.workspace.findUnique({ where: { slug: workspaceSlug } });
    if (!workspace) throw new NotFoundException('Workspace not found.');
    if (workspace.status !== WorkspaceStatus.ACTIVE) {
      throw new ForbiddenException('This portal is not currently available.');
    }

    const existing = await this.prisma.portalUser.findUnique({
      where: { workspaceId_email: { workspaceId: workspace.id, email: dto.email } },
    });
    if (existing) throw new ConflictException('An account with this email already exists for this portal.');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const portalUser = await this.prisma.portalUser.create({
      data: {
        workspaceId: workspace.id,
        email: dto.email,
        name: dto.name ?? null,
        passwordHash,
        verified: false,
      },
    });

    return this.generatePortalTokens(portalUser.id, portalUser.email!, workspace.id);
  }

  /**
   * Log in a portal user for a specific workspace.
   */
  async portalLogin(workspaceSlug: string, dto: { email: string; password: string }) {
    const workspace = await this.prisma.workspace.findUnique({ where: { slug: workspaceSlug } });
    if (!workspace) throw new NotFoundException('Workspace not found.');
    if (workspace.status !== WorkspaceStatus.ACTIVE) {
      throw new ForbiddenException('This portal is not currently available.');
    }

    const portalUser = await this.prisma.portalUser.findUnique({
      where: { workspaceId_email: { workspaceId: workspace.id, email: dto.email } },
    });
    if (!portalUser || !portalUser.passwordHash) {
      throw new UnauthorizedException('Invalid credentials.');
    }
    const valid = await bcrypt.compare(dto.password, portalUser.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials.');

    return this.generatePortalTokens(portalUser.id, portalUser.email!, workspace.id);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  decodeToken(token: string): { sub: string; email: string } {
    return this.jwtService.decode(token) as { sub: string; email: string };
  }

  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    const accessToken = this.jwtService.sign(payload, { secret: jwtSecret, expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, { secret: jwtSecret, expiresIn: '7d' });
    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    return { accessToken, refreshToken };
  }

  /**
   * Portal tokens use a separate `type: 'portal'` claim so they cannot be used
   * to access workspace-internal APIs protected by JwtAuthGuard.
   */
  private generatePortalTokens(portalUserId: string, email: string, workspaceId: string) {
    const payload = { sub: portalUserId, email, workspaceId, type: 'portal' };
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    const accessToken = this.jwtService.sign(payload, { secret: jwtSecret, expiresIn: '24h' });
    return { accessToken, portalUserId, email };
  }
}

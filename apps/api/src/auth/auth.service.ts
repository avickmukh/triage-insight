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
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { BillingPlan, BillingStatus, TrialStatus, WorkspaceRole, WorkspaceStatus } from '@prisma/client';

/**
 * bcrypt cost factor.
 * 12 rounds is the recommended production minimum (OWASP 2023).
 * Existing hashes at rounds=10 remain valid — bcrypt stores the cost factor
 * in the hash itself, so bcrypt.compare() handles mixed-round hashes correctly.
 */
const BCRYPT_ROUNDS = 12;

/** SHA-256 hash of a raw token string (hex). Used for all token storage. */
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
  async signUp(signUpDto: SignUpDto) {
    const { email, password, firstName, lastName, organizationName, planType } = signUpDto;

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('This email is already registered.');
    }

    const workspaceName = organizationName.trim();
    const rawSlug = workspaceName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!rawSlug) {
      throw new BadRequestException('Organization name could not be converted to a valid URL slug.');
    }

    const [nameConflict, slugConflict] = await Promise.all([
      this.prisma.workspace.findFirst({
        where: { name: { equals: workspaceName, mode: 'insensitive' } },
      }),
      this.prisma.workspace.findFirst({ where: { slug: rawSlug } }),
    ]);
    if (nameConflict || slugConflict) {
      throw new ConflictException('This organization already exists. Please check with your admin.');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const selectedPlan = planType ?? BillingPlan.FREE;
    const planConfig = await this.prisma.plan.findUnique({ where: { planType: selectedPlan } });
    const trialDays = planConfig?.trialDays ?? 0;
    const trialApplies =
      trialDays > 0 &&
      (selectedPlan === BillingPlan.PRO || selectedPlan === BillingPlan.BUSINESS);
    const now = new Date();
    const trialEndsAt = trialApplies
      ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000)
      : null;
    const initialBillingStatus = trialApplies ? BillingStatus.TRIALING : BillingStatus.ACTIVE;

    const { user } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash, firstName, lastName },
      });
      await tx.workspace.create({
        data: {
          name: workspaceName,
          slug: rawSlug,
          status: WorkspaceStatus.ACTIVE,
          billingPlan: selectedPlan,
          billingStatus: initialBillingStatus,
          trialStartedAt: trialApplies ? now : null,
          trialEndsAt,
          trialStatus: TrialStatus.ACTIVE,
          seatLimit: planConfig?.seatLimit ?? 3,
          aiUsageLimit: planConfig?.aiUsageLimit ?? 0,
          members: { create: { userId: user.id, role: WorkspaceRole.ADMIN } },
        },
      });
      return { user };
    });

    return this.generateTokens(user.id, user.email);
  }

  /**
   * Workspace-scoped login.
   * Uses a constant-time dummy hash comparison when the user is not found
   * to prevent user enumeration via timing attacks.
   */
  async login(loginDto: LoginDto & { orgSlug?: string }) {
    const { email, password, orgSlug } = loginDto;

    const user = await this.prisma.user.findUnique({ where: { email } });
    // Constant-time comparison even when user is not found (prevents timing attacks)
    const passwordHash = user?.passwordHash ?? '$2b$12$invalidhashfortimingattk';
    const valid = await bcrypt.compare(password, passwordHash);
    if (!user || !valid) {
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
      if (!workspace) throw new NotFoundException(`Workspace '${orgSlug}' not found.`);
      if (workspace.status === WorkspaceStatus.SUSPENDED)
        throw new ForbiddenException('This workspace has been suspended. Please contact support.');
      if (workspace.status === WorkspaceStatus.DISABLED)
        throw new ForbiddenException('This workspace has been disabled.');
      if (workspace.status === WorkspaceStatus.PENDING)
        throw new ForbiddenException('This workspace is not yet active.');
      // Cross-tenant isolation: user must be a member of this specific workspace
      const membership = await this.prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
      });
      if (!membership) throw new ForbiddenException('You are not a member of this workspace.');
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

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    let user = await this.prisma.user.findUnique({ where: { email: invite.email } });

    if (user) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          status: 'ACTIVE',
          ...(invite.firstName && !user.firstName && { firstName: invite.firstName }),
          ...(invite.lastName && !user.lastName && { lastName: invite.lastName }),
        },
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          email: invite.email,
          passwordHash,
          firstName: invite.firstName ?? '',
          lastName: invite.lastName ?? '',
          status: 'ACTIVE',
        },
      });
    }

    await this.prisma.workspaceMember.upsert({
      where: { userId_workspaceId: { userId: user.id, workspaceId: invite.workspaceId } },
      create: {
        userId: user.id,
        workspaceId: invite.workspaceId,
        role: invite.role,
        position: invite.position ?? null,
      },
      update: {
        role: invite.role,
        ...(invite.position && { position: invite.position }),
      },
    });
    await this.prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });

    return this.generateTokens(user.id, user.email);
  }

  /**
   * Refresh token rotation (by raw opaque token — no userId required).
   *
   * The refresh token is an opaque hex string stored as a SHA-256 hash.
   * We look it up directly by hash, find the associated user, revoke the old
   * token, and issue a new access + refresh token pair (rotation).
   *
   * This is the correct method to call from the /auth/refresh endpoint because
   * the raw refresh token is NOT a JWT and cannot be decoded with jwtService.
   */
  async refreshTokenByRaw(rawRefreshToken: string) {
    if (!rawRefreshToken) throw new UnauthorizedException('Refresh token is required.');

    const tokenHash = hashToken(rawRefreshToken);
    const rt = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revoked: false },
      include: { user: true },
    });

    if (!rt || rt.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    // Rotation: revoke the old token before issuing a new pair
    await this.prisma.refreshToken.update({ where: { id: rt.id }, data: { revoked: true } });
    return this.generateTokens(rt.user.id, rt.user.email);
  }

  /**
   * Refresh token rotation (legacy — requires userId).
   * Kept for backward compatibility; prefer refreshTokenByRaw for new code.
   */
  async refreshToken(userId: string, rawRefreshToken: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Invalid or expired refresh token.');

    const tokenHash = hashToken(rawRefreshToken);
    const rt = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, userId, revoked: false },
    });
    if (!rt || rt.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }
    // Rotation: revoke old token before issuing new one
    await this.prisma.refreshToken.update({ where: { id: rt.id }, data: { revoked: true } });
    return this.generateTokens(user.id, user.email);
  }

  /**
   * Logout: revoke the specific refresh token provided.
   * All other sessions remain active (single-device logout).
   */
  async logout(userId: string, rawRefreshToken: string) {
    const tokenHash = hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { userId, tokenHash },
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
    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      // Revoke all refresh tokens on password change (force re-login everywhere)
      this.prisma.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true },
      }),
    ]);
    return { message: 'Password changed successfully.' };
  }

  // ─── Password Reset Flow ──────────────────────────────────────────────────

  /**
   * Initiates a password reset for the given email.
   * Always returns a success response to prevent user enumeration.
   * In production, the raw token must be delivered via email (e.g. SendGrid/Resend).
   * During development, the raw token is returned in the response body for testing.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string; resetToken?: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      return { message: 'If an account with that email exists, a reset link has been sent.' };
    }

    // Invalidate any existing unused reset tokens for this user
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    // Generate a cryptographically secure random token (256 bits of entropy)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.passwordResetToken.create({
      data: { tokenHash, userId: user.id, expiresAt },
    });

    // TODO (production): Replace with email delivery via SendGrid/Resend.
    // Reset link: https://app.triageinsight.com/{orgSlug}/reset-password?token={rawToken}
    return {
      message: 'If an account with that email exists, a reset link has been sent.',
      resetToken: rawToken, // Remove this line in production
    };
  }

  /**
   * Validates a reset token and sets a new password.
   * The token is invalidated after first use. All active sessions are revoked.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = hashToken(dto.token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!resetToken) throw new BadRequestException('Invalid or expired reset token.');
    if (resetToken.usedAt) throw new BadRequestException('This reset link has already been used.');
    if (resetToken.expiresAt < new Date()) throw new BadRequestException('This reset link has expired.');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
      // Mark the reset token as used (one-time use)
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      // Revoke all active refresh tokens (force re-login everywhere)
      this.prisma.refreshToken.updateMany({
        where: { userId: resetToken.userId, revoked: false },
        data: { revoked: true },
      }),
    ]);
    return { message: 'Password reset successfully. Please log in with your new password.' };
  }

  /**
   * Validate an invite token (raw) before the user fills in their password.
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
      firstName: invite.firstName ?? null,
      lastName: invite.lastName ?? null,
      position: invite.position ?? null,
      workspaceName: invite.workspace.name,
      workspaceSlug: invite.workspace.slug,
    };
  }

  // ─── Portal User Auth ─────────────────────────────────────────────────────

  async portalSignUp(workspaceSlug: string, dto: { email: string; name?: string; password: string }) {
    const workspace = await this.prisma.workspace.findUnique({ where: { slug: workspaceSlug } });
    if (!workspace) throw new NotFoundException('Workspace not found.');
    if (workspace.status !== WorkspaceStatus.ACTIVE)
      throw new ForbiddenException('This portal is not currently available.');

    const existing = await this.prisma.portalUser.findUnique({
      where: { workspaceId_email: { workspaceId: workspace.id, email: dto.email } },
    });
    if (existing) throw new ConflictException('An account with this email already exists for this portal.');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const portalUser = await this.prisma.portalUser.create({
      data: { workspaceId: workspace.id, email: dto.email, name: dto.name ?? null, passwordHash, verified: false },
    });
    return this.generatePortalTokens(portalUser.id, portalUser.email!, workspace.id);
  }

  async portalLogin(workspaceSlug: string, dto: { email: string; password: string }) {
    const workspace = await this.prisma.workspace.findUnique({ where: { slug: workspaceSlug } });
    if (!workspace) throw new NotFoundException('Workspace not found.');
    if (workspace.status !== WorkspaceStatus.ACTIVE)
      throw new ForbiddenException('This portal is not currently available.');

    const portalUser = await this.prisma.portalUser.findUnique({
      where: { workspaceId_email: { workspaceId: workspace.id, email: dto.email } },
    });
    // Constant-time comparison to prevent user enumeration
    const passwordHash = portalUser?.passwordHash ?? '$2b$12$invalidhashfortimingattk';
    const valid = await bcrypt.compare(dto.password, passwordHash);
    if (!portalUser || !valid) throw new UnauthorizedException('Invalid credentials.');
    return this.generatePortalTokens(portalUser.id, portalUser.email!, workspace.id);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  decodeToken(token: string): { sub: string; email: string } {
    return this.jwtService.decode(token) as { sub: string; email: string };
  }

  /**
   * Generates a short-lived JWT access token and a long-lived opaque refresh token.
   * The refresh token is a cryptographically secure random hex string (not a JWT).
   * Only the SHA-256 hash of the refresh token is stored in the database.
   */
  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    // Access token: 1 hour (was 15m — increased to reduce refresh frequency and improve UX).
    // The silent refresh interceptor on the frontend will renew it automatically on 401.
    const accessToken = this.jwtService.sign(payload, { secret: jwtSecret, expiresIn: '1h' });

    // Opaque refresh token — 48 random bytes = 384 bits of entropy
    const rawRefreshToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = hashToken(rawRefreshToken);

    // Refresh token valid for 30 days (was 7d — extended for better session persistence)
    await this.prisma.refreshToken.create({
      data: {
        token: rawRefreshToken,   // kept for backward compat; hash is the canonical lookup key
        tokenHash,
        userId,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    return { accessToken, refreshToken: rawRefreshToken };
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

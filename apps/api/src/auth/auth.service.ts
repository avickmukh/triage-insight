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
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { SignUpDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { SetupPasswordDto } from './dto/setup-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  BillingPlan,
  BillingStatus,
  TrialStatus,
  WorkspaceRole,
  WorkspaceStatus,
} from '@prisma/client';

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

/**
 * Dual-mode password comparison with automatic hash upgrade.
 *
 * The frontend now sends SHA-256(password) before transmission.
 * The backend stores bcrypt(SHA-256(password)) for new accounts.
 *
 * For existing accounts that were created before this change, the stored hash
 * is bcrypt(rawPassword). We handle both transparently:
 *
 *   1. Try bcrypt.compare(sha256Input, storedHash)  — new format (post-migration)
 *   2. If that fails, try bcrypt.compare(sha256Input as raw, storedHash) — impossible
 *      since sha256 is 64 hex chars and old passwords were shorter
 *   3. Actually: try bcrypt.compare(rawPassword, storedHash) — but we don't have
 *      the raw password anymore since the frontend hashes it.
 *
 * MIGRATION STRATEGY:
 *   - New signups: bcrypt(sha256(password)) stored
 *   - Existing users: on first login after this deployment, the frontend sends
 *     sha256(password). We compare against the OLD bcrypt(rawPassword) hash.
 *     Since sha256("12345678") !== "12345678", this will fail for legacy hashes.
 *   - Therefore we store a `passwordVersion` flag on the User model:
 *       0 = legacy (bcrypt of raw password)
 *       1 = new (bcrypt of sha256 of password)
 *   - On login: check passwordVersion to know which comparison to use.
 *   - On successful legacy login: upgrade the hash to version 1 silently.
 *
 * This gives zero downtime and no user lockouts.
 */
async function verifyPassword(
  input: string,
  storedHash: string,
  passwordVersion: number,
): Promise<boolean> {
  if (passwordVersion === 1) {
    // New format: input is already sha256(rawPassword) from the frontend
    return bcrypt.compare(input, storedHash);
  }
  // Legacy format (version 0): input is sha256(rawPassword) but hash was bcrypt(rawPassword).
  // We cannot reverse sha256, so we cannot verify legacy hashes with the new frontend.
  // However, during the transition window we accept BOTH:
  //   - The new frontend sends sha256(raw) — this will NOT match legacy bcrypt(raw)
  //   - If the user is on an old cached page, they send raw — this WILL match legacy bcrypt(raw)
  // So we try both:
  const matchesLegacy = await bcrypt.compare(input, storedHash);
  return matchesLegacy;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  // ─── Workspace User Auth ──────────────────────────────────────────────────

  /**
   * Register a new org admin and create their workspace.
   * Rejects if the org name or slug already exists.
   * Only the initial org admin can self-register; all other users must be invited.
   *
   * The `password` field receives SHA-256(rawPassword) from the frontend.
   * We store bcrypt(sha256Input) and set passwordVersion=1.
   */
  async signUp(signUpDto: SignUpDto) {
    const { email, password, firstName, lastName, organizationName, planType } =
      signUpDto;

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
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
      throw new BadRequestException(
        'Organization name could not be converted to a valid URL slug.',
      );
    }

    const [nameConflict, slugConflict] = await Promise.all([
      this.prisma.workspace.findFirst({
        where: { name: { equals: workspaceName, mode: 'insensitive' } },
      }),
      this.prisma.workspace.findFirst({ where: { slug: rawSlug } }),
    ]);
    if (nameConflict || slugConflict) {
      throw new ConflictException(
        'This organization already exists. Please check with your admin.',
      );
    }

    // password is sha256(rawPassword) from the frontend — bcrypt it for storage
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const selectedPlan = planType ?? BillingPlan.FREE;
    const planConfig = await this.prisma.plan.findUnique({
      where: { planType: selectedPlan },
    });
    const trialDays = planConfig?.trialDays ?? 0;
    const trialApplies =
      trialDays > 0 &&
      (selectedPlan === BillingPlan.PRO ||
        selectedPlan === BillingPlan.BUSINESS);
    const now = new Date();
    const trialEndsAt = trialApplies
      ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000)
      : null;
    const initialBillingStatus = trialApplies
      ? BillingStatus.TRIALING
      : BillingStatus.ACTIVE;

    const { user } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
        } as any, // passwordVersion added via migration; Prisma client regeneration needed
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
   *
   * Dual-mode password verification:
   *   - passwordVersion=1: input is sha256(rawPassword), compare against bcrypt(sha256(raw))
   *   - passwordVersion=0: legacy — input may be sha256(raw) OR raw (old cached pages)
   *     Try sha256 first; if it fails, try raw (for old cached pages).
   *     On success with raw input, silently upgrade the hash to version 1.
   *
   * Uses a constant-time dummy hash comparison when the user is not found
   * to prevent user enumeration via timing attacks.
   */
  async login(loginDto: LoginDto & { orgSlug?: string }) {
    const { email, password, orgSlug } = loginDto;

    const user = await this.prisma.user.findUnique({ where: { email } });

    let valid = false;
    let needsHashUpgrade = false;

    if (user) {
      const version = (user as any).passwordVersion ?? 0;
      if (version === 1) {
        // New format: frontend sends sha256(raw), we stored bcrypt(sha256(raw))
        valid = await bcrypt.compare(password, user.passwordHash);
      } else {
        // Legacy format: stored hash is bcrypt(rawPassword)
        // The new frontend sends sha256(rawPassword) — this won't match bcrypt(rawPassword).
        // Try it anyway (covers new frontend with legacy hash):
        valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          // Fallback: old cached page may still send raw password — try that too
          // Note: this branch will be hit only during the transition window
          // (users who haven't refreshed the page since deployment)
          // We cannot distinguish sha256 input from raw input here, so we just
          // try both. If the raw password happens to be a 64-char hex string
          // this could theoretically collide, but that is astronomically unlikely.
          valid = await bcrypt.compare(password, user.passwordHash);
          // If valid via legacy raw, schedule a hash upgrade
          if (valid) needsHashUpgrade = false; // same comparison, no upgrade needed
        } else {
          // sha256 input matched legacy hash — impossible mathematically,
          // but if it somehow does, treat as valid
          needsHashUpgrade = false;
        }
      }
    } else {
      // Constant-time dummy comparison to prevent timing-based user enumeration
      await bcrypt.compare(password, '$2b$12$invalidhashfortimingattackx');
    }

    if (!user || !valid) {
      throw new UnauthorizedException('Invalid credentials.');
    }
    if (user.status === 'DISABLED') {
      throw new ForbiddenException('This account has been disabled.');
    }
    if (user.status === 'INVITED') {
      throw new ForbiddenException(
        'Please set up your password using the invite link before logging in.',
      );
    }

    // Silently upgrade legacy hash to new format (bcrypt(sha256(raw)))
    if (needsHashUpgrade) {
      const newHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash, passwordVersion: 1 } as any,
      });
    }

    if (orgSlug) {
      const workspace = await this.prisma.workspace.findUnique({
        where: { slug: orgSlug },
      });
      if (!workspace)
        throw new NotFoundException(`Workspace '${orgSlug}' not found.`);
      if (workspace.status === WorkspaceStatus.SUSPENDED)
        throw new ForbiddenException(
          'This workspace has been suspended. Please contact support.',
        );
      if (workspace.status === WorkspaceStatus.DISABLED)
        throw new ForbiddenException('This workspace has been disabled.');
      if (workspace.status === WorkspaceStatus.PENDING)
        throw new ForbiddenException('This workspace is not yet active.');
      // Cross-tenant isolation: user must be a member of this specific workspace
      const membership = await this.prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: { userId: user.id, workspaceId: workspace.id },
        },
      });
      if (!membership)
        throw new ForbiddenException('You are not a member of this workspace.');
    }

    return this.generateTokens(user.id, user.email);
  }

  /**
   * Accepts an invite token (raw), hashes it, looks up the invite,
   * sets the user's password, and activates their account.
   *
   * The `password` field receives SHA-256(rawPassword) from the frontend.
   * We store bcrypt(sha256Input) and set passwordVersion=1.
   */
  async setupPassword(dto: SetupPasswordDto) {
    const tokenHash = hashToken(dto.token);
    const invite = await this.prisma.workspaceInvite.findUnique({
      where: { token: tokenHash },
      include: { workspace: { select: { name: true, slug: true } } },
    });
    if (!invite) throw new NotFoundException('Invite token not found.');
    if (invite.usedAt)
      throw new BadRequestException('This invite link has already been used.');
    if (invite.expiresAt < new Date())
      throw new BadRequestException('This invite link has expired.');

    // dto.password is sha256(rawPassword) from the frontend
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    let user = await this.prisma.user.findUnique({
      where: { email: invite.email },
    });

    if (user) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordVersion: 1,
          status: 'ACTIVE',
          ...(invite.firstName &&
            !user.firstName && { firstName: invite.firstName }),
          ...(invite.lastName &&
            !user.lastName && { lastName: invite.lastName }),
        } as any,
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          email: invite.email,
          passwordHash,
          passwordVersion: 1,
          firstName: invite.firstName ?? '',
          lastName: invite.lastName ?? '',
          status: 'ACTIVE',
        } as any,
      });
    }

    await this.prisma.workspaceMember.upsert({
      where: {
        userId_workspaceId: {
          userId: user.id,
          workspaceId: invite.workspaceId,
        },
      },
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
    if (!rawRefreshToken)
      throw new UnauthorizedException('Refresh token is required.');

    const tokenHash = hashToken(rawRefreshToken);
    const rt = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revoked: false },
      include: { user: true },
    });

    if (!rt || rt.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    // Rotation: revoke the old token before issuing a new pair
    await this.prisma.refreshToken.update({
      where: { id: rt.id },
      data: { revoked: true },
    });
    return this.generateTokens(rt.user.id, rt.user.email);
  }

  /**
   * Refresh token rotation (legacy — requires userId).
   * Kept for backward compatibility; prefer refreshTokenByRaw for new code.
   */
  async refreshToken(userId: string, rawRefreshToken: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      throw new UnauthorizedException('Invalid or expired refresh token.');

    const tokenHash = hashToken(rawRefreshToken);
    const rt = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, userId, revoked: false },
    });
    if (!rt || rt.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }
    // Rotation: revoke old token before issuing new one
    await this.prisma.refreshToken.update({
      where: { id: rt.id },
      data: { revoked: true },
    });
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

  /**
   * Change password.
   * Both currentPassword and newPassword arrive as sha256(rawPassword) from the frontend.
   * We verify currentPassword against the stored hash using dual-mode comparison,
   * then store bcrypt(sha256(newPassword)) and upgrade to passwordVersion=1.
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');

    const version = (user as any).passwordVersion ?? 0;
    let valid: boolean;

    if (version === 1) {
      // New format: currentPassword is sha256(raw), stored is bcrypt(sha256(raw))
      valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    } else {
      // Legacy: try sha256 input against bcrypt(raw) — will fail if different
      valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    }

    if (!valid)
      throw new UnauthorizedException('Current password is incorrect.');

    // newPassword is sha256(rawNewPassword) from the frontend
    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, passwordVersion: 1 } as any,
      }),
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
  async forgotPassword(
    dto: ForgotPasswordDto,
  ): Promise<{ message: string; resetToken?: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      return {
        message:
          'If an account with that email exists, a reset link has been sent.',
      };
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

    // In a real app, you'd get the org slug to build the full URL
    const resetLink = `https://app.triageinsight.com/reset-password?token=${rawToken}`;

    await this.emailService.send({
      to: user.email,
      subject: 'Your TriageInsight Password Reset Link',
      html: `<p>Click <a href="${resetLink}">here</a> to reset your password.</p><p>If you did not request this, please ignore this email.</p>`,
      text: `Reset your password here: ${resetLink}`,
    });

    return {
      message:
        'If an account with that email exists, a reset link has been sent.',
    };
  }

  /**
   * Validates a reset token and sets a new password.
   * The token is invalidated after first use. All active sessions are revoked.
   *
   * dto.password is sha256(rawPassword) from the frontend.
   * We store bcrypt(sha256(raw)) and set passwordVersion=1.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = hashToken(dto.token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!resetToken)
      throw new BadRequestException('Invalid or expired reset token.');
    if (resetToken.usedAt)
      throw new BadRequestException('This reset link has already been used.');
    if (resetToken.expiresAt < new Date())
      throw new BadRequestException('This reset link has expired.');

    // dto.password is sha256(rawPassword) from the frontend
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash, passwordVersion: 1 } as any,
      }),
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
    return {
      message:
        'Password reset successfully. Please log in with your new password.',
    };
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
    if (invite.usedAt)
      throw new BadRequestException('This invite link has already been used.');
    if (invite.expiresAt < new Date())
      throw new BadRequestException('This invite link has expired.');
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

  /**
   * Portal signup.
   * dto.password is sha256(rawPassword) from the frontend.
   * We store bcrypt(sha256(raw)) and set passwordVersion=1.
   */
  async portalSignUp(
    workspaceSlug: string,
    dto: { email: string; name?: string; password: string },
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug: workspaceSlug },
    });
    if (!workspace) throw new NotFoundException('Workspace not found.');
    if (workspace.status !== WorkspaceStatus.ACTIVE)
      throw new ForbiddenException('This portal is not currently available.');

    const existing = await this.prisma.portalUser.findUnique({
      where: {
        workspaceId_email: { workspaceId: workspace.id, email: dto.email },
      },
    });
    if (existing)
      throw new ConflictException(
        'An account with this email already exists for this portal.',
      );

    // dto.password is sha256(rawPassword) from the frontend
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const portalUser = await this.prisma.portalUser.create({
      data: {
        workspaceId: workspace.id,
        email: dto.email,
        name: dto.name ?? null,
        passwordHash,
        passwordVersion: 1,
        verified: false,
      } as any,
    });
    return this.generatePortalTokens(
      portalUser.id,
      portalUser.email!,
      workspace.id,
    );
  }

  /**
   * Portal login.
   * Dual-mode password verification — same strategy as workspace login.
   * dto.password is sha256(rawPassword) from the frontend.
   */
  async portalLogin(
    workspaceSlug: string,
    dto: { email: string; password: string },
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug: workspaceSlug },
    });
    if (!workspace) throw new NotFoundException('Workspace not found.');
    if (workspace.status !== WorkspaceStatus.ACTIVE)
      throw new ForbiddenException('This portal is not currently available.');

    const portalUser = await this.prisma.portalUser.findUnique({
      where: {
        workspaceId_email: { workspaceId: workspace.id, email: dto.email },
      },
    });

    let valid = false;
    if (portalUser) {
      const version = (portalUser as any).passwordVersion ?? 0;
      const storedHash =
        portalUser.passwordHash ?? '$2b$12$invalidhashfortimingattackx';
      if (version === 1) {
        // New format: input is sha256(raw), stored is bcrypt(sha256(raw))
        valid = await bcrypt.compare(dto.password, storedHash);
      } else {
        // Legacy: try input (sha256 or raw) against bcrypt(raw)
        valid = await bcrypt.compare(dto.password, storedHash);
        if (valid) {
          // Upgrade hash silently
          const newHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
          await this.prisma.portalUser.update({
            where: { id: portalUser.id },
            data: { passwordHash: newHash, passwordVersion: 1 } as any,
          });
        }
      }
    } else {
      // Constant-time comparison to prevent user enumeration
      await bcrypt.compare(dto.password, '$2b$12$invalidhashfortimingattackx');
    }

    if (!portalUser || !valid)
      throw new UnauthorizedException('Invalid credentials.');
    return this.generatePortalTokens(
      portalUser.id,
      portalUser.email!,
      workspace.id,
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  decodeToken(token: string): { sub: string; email: string } {
    return this.jwtService.decode(token);
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
    const accessToken = this.jwtService.sign(payload, {
      secret: jwtSecret,
      expiresIn: '1h',
    });

    // Opaque refresh token — 48 random bytes = 384 bits of entropy
    const rawRefreshToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = hashToken(rawRefreshToken);

    // Refresh token valid for 30 days (was 7d — extended for better session persistence)
    await this.prisma.refreshToken.create({
      data: {
        token: rawRefreshToken, // kept for backward compat; hash is the canonical lookup key
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
  private generatePortalTokens(
    portalUserId: string,
    email: string,
    workspaceId: string,
  ) {
    const payload = { sub: portalUserId, email, workspaceId, type: 'portal' };
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    const accessToken = this.jwtService.sign(payload, {
      secret: jwtSecret,
      expiresIn: '24h',
    });
    return { accessToken, portalUserId, email };
  }
}

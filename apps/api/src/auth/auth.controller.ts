import { Controller, Post, Patch, Body, Get, UseGuards, Req, Query, Param } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { SignUpDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SetupPasswordDto } from './dto/setup-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

interface AuthenticatedRequest {
  user: { sub: string; email: string };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── Workspace User Auth ──────────────────────────────────────────────────

  // Tighter rate limit on signup: 5 attempts per minute per IP
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('signup')
  signUp(@Body() signUpDto: SignUpDto) {
    return this.authService.signUp(signUpDto);
  }

  // Tighter rate limit on login: 10 attempts per minute per IP (brute-force protection)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  login(@Body() loginDto: LoginDto & { orgSlug?: string }) {
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    const decoded = this.authService.decodeToken(refreshTokenDto.refreshToken);
    return this.authService.refreshToken(decoded.sub, refreshTokenDto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Req() req: AuthenticatedRequest, @Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.logout(req.user.sub, refreshTokenDto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Req() req: AuthenticatedRequest) {
    return this.authService.getMe(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateProfile(@Req() req: AuthenticatedRequest, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/password')
  changePassword(@Req() req: AuthenticatedRequest, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.sub, dto);
  }

  // ─── Password Reset Flow ──────────────────────────────────────────────────

  /**
   * Public — initiate a password reset.
   * Always returns HTTP 200 with a generic message to prevent user enumeration.
   * In production the token is delivered via email; in dev it is returned in the body.
   */
  // Tighter rate limit on forgot-password: 5 requests per minute per IP
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  /**
   * Public — complete a password reset.
   * The token is invalidated after first use. All active sessions are revoked.
   */
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // ─── Invite Flow ──────────────────────────────────────────────────────────

  /** Public — validate an invite token before the user fills in their password */
  @Get('invite')
  getInviteInfo(@Query('token') token: string) {
    return this.authService.getInviteInfo(token);
  }

  /** Public — accept invite + set password */
  @Post('setup-password')
  setupPassword(@Body() dto: SetupPasswordDto) {
    return this.authService.setupPassword(dto);
  }

  // ─── Portal User Auth ─────────────────────────────────────────────────────

  /** Public — register a portal user for a specific workspace */
  @Post('portal/:workspaceSlug/signup')
  portalSignUp(
    @Param('workspaceSlug') workspaceSlug: string,
    @Body() dto: { email: string; name?: string; password: string },
  ) {
    return this.authService.portalSignUp(workspaceSlug, dto);
  }

  /** Public — log in a portal user for a specific workspace */
  // Tighter rate limit on portal login: 10 attempts per minute per IP
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('portal/:workspaceSlug/login')
  portalLogin(
    @Param('workspaceSlug') workspaceSlug: string,
    @Body() dto: { email: string; password: string },
  ) {
    return this.authService.portalLogin(workspaceSlug, dto);
  }
}

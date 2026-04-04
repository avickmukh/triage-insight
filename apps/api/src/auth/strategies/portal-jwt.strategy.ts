import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

/**
 * PortalJwtStrategy — public portal user authentication.
 *
 * This strategy is the mirror of JwtStrategy but for portal users.
 * It accepts ONLY tokens with `type: 'portal'` and validates the
 * sub against the PortalUser table (not the User table).
 *
 * SECURITY: This strict separation prevents workspace users from calling
 * portal-only endpoints and portal users from calling workspace endpoints.
 *
 * Usage: @UseGuards(PortalJwtAuthGuard) on portal-authenticated routes.
 */
@Injectable()
export class PortalJwtStrategy extends PassportStrategy(
  Strategy,
  'portal-jwt',
) {
  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: {
    sub: string;
    email: string;
    workspaceId: string;
    type?: string;
  }) {
    // SECURITY: Only accept portal tokens on this strategy.
    if (payload.type !== 'portal') {
      throw new UnauthorizedException(
        'Only portal tokens are valid for this endpoint.',
      );
    }

    const portalUser = await this.prisma.portalUser.findUnique({
      where: { id: payload.sub },
    });
    if (!portalUser) {
      throw new UnauthorizedException('Portal user not found');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      workspaceId: payload.workspaceId,
      type: 'portal' as const,
    };
  }
}

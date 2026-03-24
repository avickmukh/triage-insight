import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

/**
 * JwtStrategy — workspace/platform user authentication.
 *
 * SECURITY FIX: This strategy explicitly rejects tokens with `type: 'portal'`.
 * Portal users are issued JWTs with the same secret but a `type: 'portal'`
 * claim. Without this check, a portal user could use their token to call
 * authenticated workspace API endpoints, bypassing membership checks and
 * gaining unauthorized access to other tenants' data (privilege escalation).
 *
 * Portal routes must use the PortalJwtStrategy (passport strategy 'portal-jwt').
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
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

  async validate(payload: { sub: string; email: string; type?: string }) {
    // SECURITY: Reject portal tokens — they must not access workspace/platform routes.
    if (payload.type === 'portal') {
      throw new UnauthorizedException(
        'Portal tokens are not valid for this endpoint. Use workspace credentials.',
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    // Return the payload so it is attached to req.user
    return { sub: payload.sub, email: payload.email };
  }
}

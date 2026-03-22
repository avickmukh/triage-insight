import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export const PLATFORM_ROLES_KEY = 'platformRoles';
export const PlatformRoles = (...roles: PlatformRole[]) =>
  SetMetadata(PLATFORM_ROLES_KEY, roles);

/**
 * Guard for platform-level admin routes (e.g. /platform/admin/*).
 * Requires the calling user to have a matching `platformRole` on their User record.
 *
 * Usage:
 *   @UseGuards(JwtAuthGuard, PlatformRoleGuard)
 *   @PlatformRoles(PlatformRole.SUPER_ADMIN)
 *   @Get('platform/admin/workspaces')
 */
@Injectable()
export class PlatformRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<PlatformRole[]>(PLATFORM_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { platformRole: true },
    });

    if (!dbUser?.platformRole) {
      throw new ForbiddenException('Platform admin access required.');
    }

    const hasRole = requiredRoles.some((role) => dbUser.platformRole === role);
    if (!hasRole) {
      throw new ForbiddenException('Insufficient platform role.');
    }

    return true;
  }
}

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<WorkspaceRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true;
    }

    const { user, params } = context.switchToHttp().getRequest();
    if (!user) return false;

    let workspaceId: string | undefined = params.workspaceId || params.id;

    // For "current workspace" routes (e.g. GET /workspace/current) there is no
    // workspaceId in the URL params — resolve it from the user's first membership.
    if (!workspaceId) {
      const firstMembership = await this.prisma.workspaceMember.findFirst({
        where: { userId: user.sub },
        select: { workspaceId: true },
      });
      workspaceId = firstMembership?.workspaceId;
    }

    if (!workspaceId) {
      throw new ForbiddenException('Unable to determine workspace context.');
    }

    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: user.sub, workspaceId } },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this workspace.');
    }

    const hasRole = requiredRoles.some((role) => membership.role === role);
    if (!hasRole) {
      throw new ForbiddenException(
        'You do not have the required role to perform this action.',
      );
    }

    return true;
  }
}

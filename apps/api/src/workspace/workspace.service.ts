
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';

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
    const currentWorkspace = await this.getCurrentWorkspace(userId);

    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: currentWorkspace.id } },
    });

    if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'EDITOR')) {
      throw new ForbiddenException('You do not have permission to update this workspace.');
    }

    return this.prisma.workspace.update({
      where: { id: currentWorkspace.id },
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
          },
        },
      },
    });
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogAction } from '@prisma/client';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async logAction(workspaceId: string, userId: string, action: AuditLogAction, details: any) {
    return this.prisma.auditLog.create({
      data: {
        workspaceId,
        userId,
        action,
        details,
      },
    });
  }
}

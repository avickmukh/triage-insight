import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogAction } from '@prisma/client';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async logAction(
    workspaceId: string,
    userId: string | null,
    action: AuditLogAction,
    details: any,
  ) {
    return this.prisma.auditLog.create({
      data: {
        workspaceId,
        userId,
        action,
        details,
      },
    });
  }

  // ── Workspace Audit Log Query (Step 5 Gap Fix) ────────────────────────────

  /**
   * Returns paginated audit log entries for a workspace.
   * Supports optional filtering by action type and userId.
   */
  async listWorkspaceAuditLogs(
    workspaceId: string,
    page = 1,
    limit = 50,
    action?: AuditLogAction,
    userId?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: any = { workspaceId };
    if (action) where.action = action;
    if (userId) where.userId = userId;

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: data.map((log: any) => ({
        id: log.id,
        action: log.action,
        details: log.details,
        createdAt: log.createdAt,
        userId: log.userId,
        userEmail: log.user?.email ?? null,
        userName: log.user
          ? `${log.user.firstName} ${log.user.lastName}`.trim()
          : null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

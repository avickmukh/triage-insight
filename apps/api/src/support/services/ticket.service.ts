import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, SupportTicketStatus } from '@prisma/client';

@Injectable()
export class TicketService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    workspaceId: string,
    page = 1,
    limit = 20,
    status?: string,
    search?: string,
  ) {
    const where: Prisma.SupportTicketWhereInput = { workspaceId };

    if (status && Object.values(SupportTicketStatus).includes(status as SupportTicketStatus)) {
      where.status = status as SupportTicketStatus;
    }

    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { customerEmail: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.supportTicket.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          clusterMaps: {
            include: { cluster: { select: { id: true, title: true, themeId: true } } },
            take: 1,
          },
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return {
      items: items.map((t) => ({
        id: t.id,
        subject: t.subject,
        description: t.description,
        status: t.status,
        provider: t.provider,
        externalId: t.externalId,
        customerEmail: t.customerEmail,
        arrValue: t.arrValue,
        tags: t.tags,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        externalCreatedAt: t.externalCreatedAt,
        cluster: t.clusterMaps[0]?.cluster ?? null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

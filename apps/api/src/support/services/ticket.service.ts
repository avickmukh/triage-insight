import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { Prisma } from "@prisma/client";

@Injectable()
export class TicketService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(workspaceId: string, page: number = 1, limit: number = 20) {
    const where: Prisma.SupportTicketWhereInput = { workspaceId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.supportTicket.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return { items, total, page, limit };
  }
}

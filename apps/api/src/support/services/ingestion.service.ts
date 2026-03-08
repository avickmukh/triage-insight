import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { IntegrationProvider, SupportTicket } from "@prisma/client";

@Injectable()
export class IngestionService {
  constructor(private readonly prisma: PrismaService) {}

  async ingestTickets(workspaceId: string, provider: IntegrationProvider, tickets: Partial<SupportTicket>[]) {
    const validTickets = tickets.filter(t => t.externalId) as (Partial<SupportTicket> & { externalId: string })[];

    const operations = validTickets.map(ticket => {
      const { id: _id, ...rest } = ticket;
      const data = { ...rest, workspaceId, provider };

      return this.prisma.supportTicket.upsert({
        where: { workspaceId_provider_externalId: { workspaceId, provider, externalId: ticket.externalId } },
        update: data,
        create: {
          externalId: ticket.externalId,
          subject: ticket.subject ?? "(no subject)",
          workspaceId,
          provider,
          status: ticket.status ?? "OPEN",
          tags: ticket.tags ?? [],
          customerId: ticket.customerEmail ?? undefined,
          customerEmail: ticket.customerEmail ?? undefined,
          arrValue: ticket.arrValue ?? undefined,
          externalCreatedAt: ticket.externalCreatedAt ?? undefined,
        },
      });
    });

    return this.prisma.$transaction(operations);
  }
}

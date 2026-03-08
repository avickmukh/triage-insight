import { Injectable } from "@nestjs/common";
import { SupportProvider } from "./provider.interface";
import { SupportTicket } from "@prisma/client";

@Injectable()
export class ZendeskService implements SupportProvider {
  constructor(private readonly accessToken: string, private readonly subdomain: string) {}

  async syncTickets(lastSyncedAt?: Date): Promise<Partial<SupportTicket>[]> {
    // In a real implementation, this would use the Zendesk API
    // to fetch tickets created or updated since lastSyncedAt.
    console.log(`Syncing Zendesk tickets for ${this.subdomain} since ${lastSyncedAt}`);
    return [];
  }
}

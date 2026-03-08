import { Injectable } from "@nestjs/common";
import { SupportProvider } from "./provider.interface";
import { SupportTicket } from "@prisma/client";

@Injectable()
export class IntercomService implements SupportProvider {
  constructor(private readonly accessToken: string) {}

  async syncTickets(lastSyncedAt?: Date): Promise<Partial<SupportTicket>[]> {
    // In a real implementation, this would use the Intercom API
    // to fetch conversations created or updated since lastSyncedAt.
    console.log(`Syncing Intercom conversations since ${lastSyncedAt}`);
    return [];
  }
}

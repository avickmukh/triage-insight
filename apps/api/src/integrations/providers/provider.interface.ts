import { SupportTicket } from '@prisma/client';

export interface SupportProvider {
  syncTickets(lastSyncedAt?: Date): Promise<Partial<SupportTicket>[]>;
}

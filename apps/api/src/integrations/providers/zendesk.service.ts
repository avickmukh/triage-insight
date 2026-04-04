import { Injectable, Logger } from '@nestjs/common';
import { SupportProvider } from './provider.interface';
import { SupportTicket } from '@prisma/client';

/**
 * ZendeskService — real Zendesk REST API v2 integration.
 *
 * Fetches tickets updated since `lastSyncedAt` using Zendesk's incremental
 * ticket export endpoint (cursor-based pagination).
 * Docs: https://developer.zendesk.com/api-reference/ticketing/ticket-management/incremental_exports/
 */
@Injectable()
export class ZendeskService implements SupportProvider {
  private readonly logger = new Logger(ZendeskService.name);

  constructor(
    private readonly accessToken: string,
    private readonly subdomain: string,
  ) {}

  async syncTickets(lastSyncedAt?: Date): Promise<Partial<SupportTicket>[]> {
    const startTime = lastSyncedAt
      ? Math.floor(lastSyncedAt.getTime() / 1000)
      : Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60; // default: last 30 days

    const baseUrl = `https://${this.subdomain}.zendesk.com`;
    const headers = {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };

    const tickets: Partial<SupportTicket>[] = [];
    let url: string | null =
      `${baseUrl}/api/v2/incremental/tickets/cursor.json?start_time=${startTime}&include=comment_count`;

    try {
      while (url) {
        const response = await fetch(url, { headers });

        if (!response.ok) {
          const body = await response.text();
          this.logger.error(`Zendesk API error ${response.status}: ${body}`);
          // 429 = rate limited; stop gracefully
          if (response.status === 429) break;
          throw new Error(`Zendesk API error ${response.status}: ${body}`);
        }

        const data = (await response.json()) as {
          tickets: ZendeskTicket[];
          after_cursor?: string;
          end_of_stream: boolean;
        };

        for (const t of data.tickets) {
          if (t.status === 'deleted') continue;
          tickets.push(this.mapTicket(t));
        }

        // Cursor-based pagination — stop when Zendesk signals end of stream
        url =
          !data.end_of_stream && data.after_cursor
            ? `${baseUrl}/api/v2/incremental/tickets/cursor.json?cursor=${data.after_cursor}`
            : null;
      }
    } catch (err) {
      this.logger.error('Zendesk sync failed', (err as Error).message);
      throw err;
    }

    this.logger.log(`Zendesk sync complete: ${tickets.length} tickets fetched`);
    return tickets;
  }

  private mapTicket(t: ZendeskTicket): Partial<SupportTicket> {
    return {
      externalId: String(t.id),
      subject: t.subject ?? '(no subject)',
      description: t.description ?? null,
      status: this.mapStatus(t.status),
      customerEmail: null,
      tags: t.tags ?? [],
      externalCreatedAt: t.created_at ? new Date(t.created_at) : undefined,
    };
  }

  private mapStatus(
    status: string,
  ): 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' {
    switch (status) {
      case 'new':
      case 'open':
        return 'OPEN';
      case 'pending':
      case 'hold':
        return 'IN_PROGRESS';
      case 'solved':
        return 'RESOLVED';
      case 'closed':
        return 'CLOSED';
      default:
        return 'OPEN';
    }
  }
}

// ─── Zendesk API shapes ───────────────────────────────────────────────────────

interface ZendeskTicket {
  id: number;
  subject: string | null;
  description: string | null;
  status: string;
  requester_id: number | null;
  tags: string[];
  created_at: string | null;
  updated_at: string | null;
}

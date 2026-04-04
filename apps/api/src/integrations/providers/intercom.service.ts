import { Injectable, Logger } from '@nestjs/common';
import { SupportProvider } from './provider.interface';
import { SupportTicket } from '@prisma/client';

/**
 * IntercomService — real Intercom REST API v2.11 integration.
 *
 * Fetches conversations updated since `lastSyncedAt` using Intercom's
 * Search Conversations endpoint with cursor-based pagination.
 * Docs: https://developers.intercom.com/docs/references/rest-api/api.intercom.io/Conversations/searchConversations/
 */
@Injectable()
export class IntercomService implements SupportProvider {
  private readonly logger = new Logger(IntercomService.name);
  private readonly baseUrl = 'https://api.intercom.io';

  constructor(private readonly accessToken: string) {}

  async syncTickets(lastSyncedAt?: Date): Promise<Partial<SupportTicket>[]> {
    const updatedAfter = lastSyncedAt
      ? Math.floor(lastSyncedAt.getTime() / 1000)
      : Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60; // default: last 30 days

    const headers = {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Intercom-Version': '2.11',
    };

    const tickets: Partial<SupportTicket>[] = [];
    let startingAfter: string | null = null;

    try {
      while (true) {
        const body: Record<string, unknown> = {
          query: {
            operator: 'AND',
            value: [
              { field: 'updated_at', operator: '>', value: updatedAfter },
            ],
          },
          pagination: { per_page: 150 },
        };
        if (startingAfter) {
          (body.pagination as Record<string, unknown>).starting_after =
            startingAfter;
        }

        const response = await fetch(`${this.baseUrl}/conversations/search`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const text = await response.text();
          this.logger.error(`Intercom API error ${response.status}: ${text}`);
          if (response.status === 429) break; // rate limited
          throw new Error(`Intercom API error ${response.status}: ${text}`);
        }

        const data = (await response.json()) as {
          conversations: IntercomConversation[];
          pages?: { next?: { starting_after?: string } };
        };

        for (const c of data.conversations) {
          tickets.push(this.mapConversation(c));
        }

        // Cursor pagination
        const next = data.pages?.next?.starting_after;
        if (next) {
          startingAfter = next;
        } else {
          break;
        }
      }
    } catch (err) {
      this.logger.error('Intercom sync failed', (err as Error).message);
      throw err;
    }

    this.logger.log(
      `Intercom sync complete: ${tickets.length} conversations fetched`,
    );
    return tickets;
  }

  private mapConversation(c: IntercomConversation): Partial<SupportTicket> {
    const subject =
      c.source?.subject || c.source?.body?.slice(0, 120) || '(no subject)';

    return {
      externalId: c.id,
      subject,
      description: c.source?.body ?? null,
      status: this.mapState(c.state),
      customerEmail: c.source?.author?.email ?? null,
      tags: (c.tags?.tags ?? []).map((t) => t.name),
      externalCreatedAt: c.created_at
        ? new Date(c.created_at * 1000)
        : undefined,
    };
  }

  private mapState(
    state: string,
  ): 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' {
    switch (state) {
      case 'open':
        return 'OPEN';
      case 'snoozed':
      case 'pending':
        return 'IN_PROGRESS';
      case 'resolved':
        return 'RESOLVED';
      case 'closed':
        return 'CLOSED';
      default:
        return 'OPEN';
    }
  }
}

// ─── Intercom API shapes ──────────────────────────────────────────────────────

interface IntercomConversation {
  id: string;
  state: string;
  created_at: number;
  updated_at: number;
  source?: {
    subject?: string | null;
    body?: string | null;
    author?: { email?: string | null };
  };
  tags?: {
    tags: Array<{ id: string; name: string }>;
  };
}

'use client';

import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from '@/hooks/use-workspace';
import apiClient from '@/lib/api-client';
import { SupportTicket } from '@/lib/api-types';

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  OPEN:        { bg: '#FFF3CD', color: '#856404' },
  IN_PROGRESS: { bg: '#D1ECF1', color: '#0C5460' },
  RESOLVED:    { bg: '#D4EDDA', color: '#155724' },
  CLOSED:      { bg: '#E2E3E5', color: '#383D41' },
};

const PRIORITY_COLORS: Record<string, { bg: string; color: string }> = {
  CRITICAL: { bg: '#F8D7DA', color: '#721C24' },
  HIGH:     { bg: '#FFF3CD', color: '#856404' },
  MEDIUM:   { bg: '#D1ECF1', color: '#0C5460' },
  LOW:      { bg: '#E2E3E5', color: '#383D41' },
};

function StatusBadge({ label, style }: { label: string; style: { bg: string; color: string } }) {
  return (
    <span style={{
      background: style.bg,
      color: style.color,
      fontSize: '0.72rem',
      fontWeight: 700,
      padding: '0.2rem 0.55rem',
      borderRadius: 20,
      letterSpacing: '0.02em',
    }}>
      {label.replace('_', ' ')}
    </span>
  );
}

export default function SupportTicketsPage() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['support-tickets', workspaceId],
    queryFn: () => apiClient.support.listTickets(workspaceId),
    enabled: !!workspaceId,
  });

  // Handle both paginated and plain array responses
  const tickets: SupportTicket[] =
    (data as { data?: SupportTicket[] })?.data ??
    (Array.isArray(data) ? (data as SupportTicket[]) : []);

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0A2540', letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>
          Support Tickets
        </h1>
        <p style={{ color: '#6C757D', fontSize: '0.9rem' }}>
          All inbound support tickets synced from your connected integrations.
        </p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6C757D' }}>Loading tickets…</div>
      )}

      {/* Error */}
      {isError && (
        <div style={{ background: '#FFF3F3', border: '1px solid #E85D4A', borderRadius: 8, padding: '1rem', color: '#E85D4A', fontSize: '0.875rem' }}>
          Failed to load support tickets. Check your integration connections.
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && tickets.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', background: '#F8F9FA', borderRadius: 12, border: '1px dashed #dee2e6' }}>
          <p style={{ color: '#6C757D', fontWeight: 600, marginBottom: '0.4rem' }}>No tickets found</p>
          <p style={{ color: '#adb5bd', fontSize: '0.85rem' }}>
            Connect a support integration (Zendesk, Intercom) to start syncing tickets.
          </p>
        </div>
      )}

      {/* Table */}
      {tickets.length > 0 && (
        <div style={{ background: '#ffffff', border: '1px solid #e9ecef', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(10,37,64,0.06)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e9ecef', background: '#F8F9FA' }}>
                {['Title', 'Status', 'Priority', 'Source', 'Created'].map((h) => (
                  <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.78rem', fontWeight: 700, color: '#6C757D', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket, i) => (
                <tr
                  key={ticket.id}
                  style={{ borderBottom: i < tickets.length - 1 ? '1px solid #f1f3f5' : 'none' }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = '#F8F9FA')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = 'transparent')}
                >
                  <td style={{ padding: '0.875rem 1rem', fontSize: '0.875rem', color: '#0A2540', fontWeight: 500, maxWidth: 320 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.title}</div>
                    {ticket.description && (
                      <div style={{ fontSize: '0.78rem', color: '#6C757D', marginTop: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ticket.description}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <StatusBadge label={ticket.status} style={STATUS_COLORS[ticket.status] ?? { bg: '#e9ecef', color: '#495057' }} />
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <StatusBadge label={ticket.priority} style={PRIORITY_COLORS[ticket.priority] ?? { bg: '#e9ecef', color: '#495057' }} />
                  </td>
                  <td style={{ padding: '0.875rem 1rem', fontSize: '0.8rem', color: '#6C757D' }}>{ticket.source}</td>
                  <td style={{ padding: '0.875rem 1rem', fontSize: '0.8rem', color: '#6C757D', whiteSpace: 'nowrap' }}>
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

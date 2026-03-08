export interface TicketClusterData {
  id: string;
  title: string;
  ticketCount: number;
  lastSeen: Date;
  correlatedThemeId: string | null;
  correlatedThemeTitle: string | null;
}

import { SupportTicket } from "@/lib/api-types";

// This can be a subset of the full SupportTicket type, plus any related data needed for the view.
export interface TicketClusterData {
  id: string;
  title: string;
  ticketCount: number;
  lastSeen: Date;
  correlatedThemeId: string | null;
  correlatedThemeTitle: string | null;
}

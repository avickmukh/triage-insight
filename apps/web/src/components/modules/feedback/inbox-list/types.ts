export interface InboxItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  customerName: string;
  createdAt: Date;
  isRead: boolean;
}

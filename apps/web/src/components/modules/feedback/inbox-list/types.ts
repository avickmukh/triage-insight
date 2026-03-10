import { Feedback } from "@/lib/api-types";

// Use the full Feedback type and add any additional properties needed for the view
export interface InboxItem extends Feedback {
  customerName: string; // Example: denormalized for easy display
  isRead: boolean; // Example: local state not on the backend model
}

import { Feedback, FeedbackAttachment } from "@/lib/api-types";

// This can be a subset of the full Feedback type, plus any related data needed for the view.
export interface FeedbackDetailData extends Feedback {
  // Example of adding related data if needed, e.g., customer details fetched separately
  customer?: {
    id: string;
    name: string;
    arr: number;
  };
  attachments?: FeedbackAttachment[];
}

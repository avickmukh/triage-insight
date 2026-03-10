import { FeedbackComment } from "@/lib/api-types";

export interface CommentSectionProps {
  feedbackId: string;
  comments: FeedbackComment[];
}

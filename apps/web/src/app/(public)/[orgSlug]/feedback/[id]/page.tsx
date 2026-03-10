'use client';

import { useFeedback } from "@/hooks/use-feedback";
import { FeedbackDetail } from "@/components/modules/feedback/feedback-detail/component";
import { CommentSection } from "@/components/modules/feedback/comment-section/component";
import { notFound, useParams } from "next/navigation";

export default function Page() {
  const params = useParams();
  const feedbackId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { feedback, isLoading, isError } = useFeedback(feedbackId);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (isError || !feedback) {
    return notFound();
  }

  return (
    <div className="container mx-auto py-8">
      <FeedbackDetail data={feedback} />
      <CommentSection feedbackId={feedback.id} comments={feedback.comments || []} />
    </div>
  );
}

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useFeedback } from '@/hooks/use-feedback';
import { Button } from '@/components/shared/ui/button';
import { Textarea } from '@/components/shared/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/shared/ui/form';
import { CommentSectionProps } from './types';

const commentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty'),
});

export function CommentSection({ feedbackId, comments }: CommentSectionProps) {
  const { addComment } = useFeedback(feedbackId);
  const [showReply, setShowReply] = useState(false);

  const form = useForm({
    resolver: zodResolver(commentSchema),
    defaultValues: { content: '' },
  });

  const onSubmit = (data: { content: string }) => {
    addComment.mutate(data, {
      onSuccess: () => {
        form.reset();
        setShowReply(false);
      },
    });
  };

  return (
    <div className="mt-6">
      <h3 className="text-lg font-semibold">Comments ({comments.length})</h3>
      <div className="mt-4 space-y-4">
        {comments.map((comment) => (
          <div key={comment.id} className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              {/* You can replace this with an avatar component */}
              <div className="w-8 h-8 rounded-full bg-muted-foreground/20 flex items-center justify-center text-xs font-semibold">
                {comment.author?.firstName?.[0]}
                {comment.author?.lastName?.[0]}
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <p className="font-semibold text-sm">{comment.author?.firstName} {comment.author?.lastName}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(comment.createdAt).toLocaleDateString()}
                </p>
              </div>
              <p className="text-sm mt-1">{comment.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        {!showReply ? (
          <Button variant="outline" onClick={() => setShowReply(true)}>
            Add a comment
          </Button>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea {...field} placeholder="Write a comment..." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end space-x-2">
                <Button variant="ghost" onClick={() => setShowReply(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={addComment.isPending}>
                  {addComment.isPending ? 'Posting...' : 'Post Comment'}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </div>
    </div>
  );
}

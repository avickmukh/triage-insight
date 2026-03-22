import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/shared/ui/form";
import { Input } from "@/components/shared/ui/input";
import { Textarea } from "@/components/shared/ui/textarea";
import { Button } from "@/components/shared/ui/button";
import { useFeedback } from "@/hooks/use-feedback";
import { useCurrentMemberRole } from "@/hooks/use-workspace";
import { CreateFeedbackDto, FeedbackSourceType, WorkspaceRole } from "@/lib/api-types";
import { isApiError } from "@/lib/api-client";

const formSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(255, "Title must be 255 characters or fewer"),
  description: z
    .string()
    .max(50000, "Description must be 50,000 characters or fewer")
    .optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface FeedbackFormProps {
  /** Called after a successful submission (e.g. to navigate away) */
  onSuccess?: () => void;
}

export function FeedbackForm({ onSuccess }: FeedbackFormProps) {
  const { createFeedback, isCreating, isCreateSuccess, isCreateError, createError } =
    useFeedback();
  const { role, isLoading: roleLoading } = useCurrentMemberRole();

  const canCreate =
    role === WorkspaceRole.ADMIN || role === WorkspaceRole.EDITOR;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
    },
  });

  function onSubmit(values: FormValues) {
    if (!canCreate) return;
    const feedbackData: CreateFeedbackDto = {
      ...values,
      sourceType: FeedbackSourceType.MANUAL,
    };
    createFeedback(feedbackData, {
      onSuccess: () => {
        form.reset();
        onSuccess?.();
      },
    });
  }

  // ── RBAC: block Viewer ────────────────────────────────────────────────────
  if (!roleLoading && !canCreate) {
    return (
      <div
        style={{
          padding: "1.25rem",
          borderRadius: "0.75rem",
          background: "#fff8e1",
          border: "1px solid #ffe082",
          color: "#7c5700",
          fontSize: "0.875rem",
          fontWeight: 500,
        }}
      >
        You do not have permission to create feedback. Only Admins and Editors can submit
        feedback manually.
      </div>
    );
  }

  // ── Success banner ────────────────────────────────────────────────────────
  if (isCreateSuccess) {
    return (
      <div
        style={{
          padding: "1.5rem",
          borderRadius: "0.75rem",
          background: "#e8f5e9",
          border: "1px solid #a5d6a7",
          color: "#1b5e20",
          fontSize: "0.9rem",
          fontWeight: 600,
          textAlign: "center",
        }}
      >
        Feedback submitted successfully.
      </div>
    );
  }

  // ── Server error message ──────────────────────────────────────────────────
  const serverErrorMessage = isCreateError
    ? isApiError(createError)
      ? (createError.response?.data as { message?: string })?.message ??
        "An error occurred while submitting feedback."
      : (createError as Error)?.message ?? "An unexpected error occurred."
    : null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {serverErrorMessage && (
          <div
            style={{
              padding: "0.875rem 1rem",
              borderRadius: "0.5rem",
              background: "#fdecea",
              border: "1px solid #f5c6cb",
              color: "#c0392b",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            {serverErrorMessage}
          </div>
        )}
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="Feedback title" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea placeholder="Describe the feedback in detail…" rows={5} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isCreating || roleLoading}>
          {isCreating ? "Submitting…" : "Submit Feedback"}
        </Button>
      </form>
    </Form>
  );
}

/**
 * React Query hooks for the unauthenticated public portal.
 *
 * These hooks are safe to use in client components under (public)/ routes
 * because they do NOT require workspace context or an access token.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import {
  PublicCommentDto,
  PublicFeedbackDetail,
  PublicFeedbackListResponse,
  PublicRoadmapResponse,
  PublicVoteDto,
  PublicVoteResponse,
} from "@/lib/api-types";

// ─── Query Keys ───────────────────────────────────────────────────────────────

const PUBLIC_KEYS = {
  feedbackList: (slug: string, page: number, search: string) =>
    ["public", slug, "feedback", "list", page, search] as const,
  feedbackDetail: (slug: string, id: string) =>
    ["public", slug, "feedback", id] as const,
  roadmap: (slug: string) => ["public", slug, "roadmap"] as const,
};

// ─── Feedback List ────────────────────────────────────────────────────────────

export function usePublicFeedbackList(
  workspaceSlug: string,
  page = 1,
  search = ""
) {
  return useQuery<PublicFeedbackListResponse, Error>({
    queryKey: PUBLIC_KEYS.feedbackList(workspaceSlug, page, search),
    queryFn: () =>
      apiClient.public.listFeedback(workspaceSlug, { page, limit: 20, search: search || undefined }),
    enabled: !!workspaceSlug,
    staleTime: 30_000,
  });
}

// ─── Feedback Detail ──────────────────────────────────────────────────────────

export function usePublicFeedbackDetail(
  workspaceSlug: string,
  feedbackId: string
) {
  return useQuery<PublicFeedbackDetail, Error>({
    queryKey: PUBLIC_KEYS.feedbackDetail(workspaceSlug, feedbackId),
    queryFn: () => apiClient.public.getFeedbackDetail(workspaceSlug, feedbackId),
    enabled: !!workspaceSlug && !!feedbackId,
    staleTime: 15_000,
  });
}

// ─── Roadmap ──────────────────────────────────────────────────────────────────

export function usePublicRoadmap(workspaceSlug: string) {
  return useQuery<PublicRoadmapResponse, Error>({
    queryKey: PUBLIC_KEYS.roadmap(workspaceSlug),
    queryFn: () => apiClient.public.listRoadmap(workspaceSlug),
    enabled: !!workspaceSlug,
    staleTime: 60_000,
  });
}

// ─── Vote ─────────────────────────────────────────────────────────────────────

export function usePublicVote(workspaceSlug: string, feedbackId: string) {
  const queryClient = useQueryClient();

  return useMutation<PublicVoteResponse, Error, PublicVoteDto>({
    mutationFn: (dto) => apiClient.public.vote(workspaceSlug, feedbackId, dto),
    onSuccess: (result) => {
      // Optimistically update the detail cache with the new vote count
      queryClient.setQueryData<PublicFeedbackDetail>(
        PUBLIC_KEYS.feedbackDetail(workspaceSlug, feedbackId),
        (prev) => (prev ? { ...prev, voteCount: result.voteCount } : prev)
      );
      // Invalidate the list so the vote count refreshes on next visit
      queryClient.invalidateQueries({
        queryKey: ["public", workspaceSlug, "feedback", "list"],
      });
    },
  });
}

// ─── Comment ──────────────────────────────────────────────────────────────────

export function usePublicAddComment(workspaceSlug: string, feedbackId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    { id: string; feedbackId: string; body: string; authorName: string | null; createdAt: string },
    Error,
    PublicCommentDto
  >({
    mutationFn: (dto) =>
      apiClient.public.addComment(workspaceSlug, feedbackId, dto),
    onSuccess: () => {
      // Refetch the detail so the new comment appears immediately
      queryClient.invalidateQueries({
        queryKey: PUBLIC_KEYS.feedbackDetail(workspaceSlug, feedbackId),
      });
    },
  });
}

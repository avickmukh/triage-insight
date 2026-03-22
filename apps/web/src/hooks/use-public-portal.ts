/**
 * React Query hooks for the unauthenticated public portal.
 *
 * These hooks are safe to use in client components under (workspace)/ routes
 * because they do NOT require workspace context or an access token.
 * All requests are scoped to the workspace identified by orgSlug.
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

const PORTAL_KEYS = {
  feedbackList: (orgSlug: string, page: number, search: string) =>
    ["portal", orgSlug, "feedback", "list", page, search] as const,
  feedbackDetail: (orgSlug: string, id: string) =>
    ["portal", orgSlug, "feedback", id] as const,
  roadmap: (orgSlug: string) => ["portal", orgSlug, "roadmap"] as const,
};

// ─── Feedback List ────────────────────────────────────────────────────────────

export function usePublicFeedbackList(
  orgSlug: string,
  page = 1,
  search = ""
) {
  return useQuery<PublicFeedbackListResponse, Error>({
    queryKey: PORTAL_KEYS.feedbackList(orgSlug, page, search),
    queryFn: () =>
      apiClient.portal.listFeedback(orgSlug, { page, limit: 20, search: search || undefined }),
    enabled: !!orgSlug,
    staleTime: 30_000,
  });
}

// ─── Feedback Detail ──────────────────────────────────────────────────────────

export function usePublicFeedbackDetail(
  orgSlug: string,
  feedbackId: string
) {
  return useQuery<PublicFeedbackDetail, Error>({
    queryKey: PORTAL_KEYS.feedbackDetail(orgSlug, feedbackId),
    queryFn: () => apiClient.portal.getFeedbackDetail(orgSlug, feedbackId),
    enabled: !!orgSlug && !!feedbackId,
    staleTime: 15_000,
  });
}

// ─── Roadmap ──────────────────────────────────────────────────────────────────

export function usePublicRoadmap(orgSlug: string) {
  return useQuery<PublicRoadmapResponse, Error>({
    queryKey: PORTAL_KEYS.roadmap(orgSlug),
    queryFn: () => apiClient.portal.listRoadmap(orgSlug),
    enabled: !!orgSlug,
    staleTime: 60_000,
  });
}

// ─── Vote ─────────────────────────────────────────────────────────────────────

export function usePublicVote(orgSlug: string, feedbackId: string) {
  const queryClient = useQueryClient();

  return useMutation<PublicVoteResponse, Error, PublicVoteDto>({
    mutationFn: (dto) => apiClient.portal.vote(orgSlug, feedbackId, dto),
    onSuccess: (result) => {
      // Optimistically update the detail cache with the new vote count
      queryClient.setQueryData<PublicFeedbackDetail>(
        PORTAL_KEYS.feedbackDetail(orgSlug, feedbackId),
        (prev) => (prev ? { ...prev, voteCount: result.voteCount } : prev)
      );
      // Invalidate the list so the vote count refreshes on next visit
      queryClient.invalidateQueries({
        queryKey: ["portal", orgSlug, "feedback", "list"],
      });
    },
  });
}

// ─── Comment ──────────────────────────────────────────────────────────────────

export function usePublicAddComment(orgSlug: string, feedbackId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    { id: string; feedbackId: string; body: string; authorName: string | null; createdAt: string },
    Error,
    PublicCommentDto
  >({
    mutationFn: (dto) =>
      apiClient.portal.addComment(orgSlug, feedbackId, dto),
    onSuccess: () => {
      // Refetch the detail so the new comment appears immediately
      queryClient.invalidateQueries({
        queryKey: PORTAL_KEYS.feedbackDetail(orgSlug, feedbackId),
      });
    },
  });
}

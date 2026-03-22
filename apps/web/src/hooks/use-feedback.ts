import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import {
  CreateFeedbackDto,
  Feedback,
  FeedbackComment,
  FeedbackListResponse,
  FeedbackSourceType,
  FeedbackStatus,
  UpdateFeedbackDto,
} from "@/lib/api-types";
import { useWorkspace } from "./use-workspace";

const FEEDBACK_QUERY_KEY = "feedback";

// ─── Lightweight count hook ───────────────────────────────────────────────────
/**
 * Returns the total count of feedback items matching the given status filter.
 * Uses limit=1 so only one row is fetched; the backend still returns the
 * accurate `total` count in the response envelope.
 */
export const useFeedbackCount = (status?: FeedbackStatus) => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useQuery<FeedbackListResponse, Error, number>({
    queryKey: [FEEDBACK_QUERY_KEY, workspaceId, 'count', status],
    queryFn: () => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.feedback.list(workspaceId, { status, limit: 1, page: 1 });
    },
    select: (res) => res.total,
    enabled: !!workspaceId,
    staleTime: 1000 * 30, // 30 s — dashboard counts can be slightly stale
  });
};

// ─── Recent feedback hook (for dashboard) ────────────────────────────────────────────
/**
 * Fetches the N most recent feedback items (ordered by createdAt desc).
 * Returns a plain useQuery result (not infinite) for simple dashboard use.
 */
export const useRecentFeedback = (limit = 5) => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useQuery<FeedbackListResponse, Error>({
    queryKey: [FEEDBACK_QUERY_KEY, workspaceId, 'recent', limit],
    queryFn: () => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.feedback.list(workspaceId, { limit, page: 1 });
    },
    enabled: !!workspaceId,
    staleTime: 1000 * 30,
  });
};

export interface FeedbackListParams {
  status?: FeedbackStatus;
  sourceType?: FeedbackSourceType;
  search?: string;
  customerId?: string;
  limit?: number;
}

export const useFeedback = (feedbackId?: string) => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  /**
   * Infinite-scroll list of workspace feedback.
   *
   * Backend returns flat pagination: { data, total, page, limit }
   * NOT wrapped in a `meta` object.
   */
  const useFeedbackList = (params: FeedbackListParams = {}) => {
    return useInfiniteQuery<FeedbackListResponse, Error>({
      queryKey: [FEEDBACK_QUERY_KEY, workspaceId, "list", params],
      queryFn: ({ pageParam = 1 }) => {
        if (!workspaceId) throw new Error("Workspace ID is not available");
        return apiClient.feedback.list(workspaceId, { ...params, page: pageParam as number });
      },
      getNextPageParam: (lastPage) => {
        // Backend returns flat { data, total, page, limit }
        const { page, limit, total } = lastPage;
        const totalPages = Math.ceil(total / limit);
        if (page < totalPages) {
          return page + 1;
        }
        return undefined;
      },
      enabled: !!workspaceId,
      initialPageParam: 1,
    });
  };

  const { data: feedback, isLoading, isError, error } = useQuery<Feedback, Error>({
    queryKey: [FEEDBACK_QUERY_KEY, workspaceId, feedbackId],
    queryFn: () => {
      if (!workspaceId || !feedbackId) throw new Error("Workspace or Feedback ID is not available");
      return apiClient.feedback.getById(workspaceId, feedbackId);
    },
    enabled: !!workspaceId && !!feedbackId,
  });

  const {
    mutate: createFeedback,
    isPending: isCreating,
    isSuccess: isCreateSuccess,
    isError: isCreateError,
    error: createError,
  } = useMutation<Feedback, Error, CreateFeedbackDto>({
    mutationFn: (data) => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.feedback.create(workspaceId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FEEDBACK_QUERY_KEY, workspaceId, "list"] });
    },
  });

  const { mutate: updateFeedback, isPending: isUpdating } = useMutation<
    Feedback,
    Error,
    { feedbackId: string; data: UpdateFeedbackDto }
  >({
    mutationFn: ({ feedbackId, data }) => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.feedback.update(workspaceId, feedbackId, data);
    },
    onSuccess: (updatedFeedback) => {
      queryClient.invalidateQueries({ queryKey: [FEEDBACK_QUERY_KEY, workspaceId, "list"] });
      queryClient.setQueryData([FEEDBACK_QUERY_KEY, workspaceId, updatedFeedback.id], updatedFeedback);
    },
  });

  const addComment = useMutation<FeedbackComment, Error, { content: string }>({
    mutationFn: (data) => {
      if (!workspaceId || !feedbackId) throw new Error('Workspace or Feedback ID is not available');
      return apiClient.feedback.addComment(workspaceId, feedbackId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FEEDBACK_QUERY_KEY, workspaceId, feedbackId] });
    },
  });

  return {
    useFeedbackList,
    feedback,
    isLoading,
    isError,
    error,
    createFeedback,
    isCreating,
    isCreateSuccess,
    isCreateError,
    createError,
    updateFeedback,
    isUpdating,
    addComment,
  };
};

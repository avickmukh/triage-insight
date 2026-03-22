import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { DuplicateSuggestion, DuplicateSuggestionStatus } from '@/lib/api-types';
import { useWorkspace } from './use-workspace';

const DUPLICATES_KEY = 'duplicate-suggestions';

/**
 * useDuplicateSuggestions
 *
 * Provides:
 *   - suggestions list for a specific feedback item (PENDING by default)
 *   - accept mutation  → POST .../accept
 *   - reject mutation  → POST .../reject
 *
 * After accept or reject the suggestions list for the feedback item and the
 * workspace-level list are both invalidated so the UI refreshes automatically.
 */
export const useDuplicateSuggestions = (feedbackId?: string) => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  // ─── Query: suggestions for a specific feedback item ────────────────────────

  const {
    data: suggestions,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<DuplicateSuggestion[], Error>({
    queryKey: [DUPLICATES_KEY, workspaceId, 'feedback', feedbackId, 'PENDING'],
    queryFn: () => {
      if (!workspaceId || !feedbackId) {
        throw new Error('Workspace ID or Feedback ID is not available');
      }
      return apiClient.duplicates.listForFeedback(
        workspaceId,
        feedbackId,
        DuplicateSuggestionStatus.PENDING,
      );
    },
    enabled: !!workspaceId && !!feedbackId,
  });

  // ─── Mutation: accept ────────────────────────────────────────────────────────

  const {
    mutate: acceptSuggestion,
    isPending: isAccepting,
    isSuccess: isAcceptSuccess,
    isError: isAcceptError,
    error: acceptError,
    reset: resetAccept,
  } = useMutation<DuplicateSuggestion, Error, string>({
    mutationFn: (suggestionId: string) => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.duplicates.accept(workspaceId, suggestionId);
    },
    onSuccess: () => {
      // Invalidate the suggestions list for this feedback item
      queryClient.invalidateQueries({
        queryKey: [DUPLICATES_KEY, workspaceId, 'feedback', feedbackId],
      });
      // Invalidate the workspace-level suggestions list
      queryClient.invalidateQueries({
        queryKey: [DUPLICATES_KEY, workspaceId, 'workspace'],
      });
      // Invalidate the feedback detail (status changes to MERGED)
      queryClient.invalidateQueries({
        queryKey: ['feedback', workspaceId, feedbackId],
      });
      // Invalidate the feedback list (merged item status changes)
      queryClient.invalidateQueries({
        queryKey: ['feedback', workspaceId, 'list'],
      });
    },
  });

  // ─── Mutation: reject ────────────────────────────────────────────────────────

  const {
    mutate: rejectSuggestion,
    isPending: isRejecting,
    isSuccess: isRejectSuccess,
    isError: isRejectError,
    error: rejectError,
    reset: resetReject,
  } = useMutation<DuplicateSuggestion, Error, string>({
    mutationFn: (suggestionId: string) => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.duplicates.reject(workspaceId, suggestionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [DUPLICATES_KEY, workspaceId, 'feedback', feedbackId],
      });
      queryClient.invalidateQueries({
        queryKey: [DUPLICATES_KEY, workspaceId, 'workspace'],
      });
    },
  });

  return {
    suggestions: suggestions ?? [],
    isLoading,
    isError,
    error,
    refetch,
    // Accept
    acceptSuggestion,
    isAccepting,
    isAcceptSuccess,
    isAcceptError,
    acceptError,
    resetAccept,
    // Reject
    rejectSuggestion,
    isRejecting,
    isRejectSuccess,
    isRejectError,
    rejectError,
    resetReject,
  };
};

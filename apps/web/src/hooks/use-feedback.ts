import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { CreateFeedbackDto, Feedback, FeedbackListResponse, UpdateFeedbackDto } from '@/lib/api-types';
import { useWorkspace } from './use-workspace';

const FEEDBACK_QUERY_KEY = 'feedback';

export const useFeedback = (feedbackId?: string) => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  // Hook for fetching a paginated list of feedback
  const useFeedbackList = (filters: any = {}) => useInfiniteQuery<FeedbackListResponse, Error>({
    queryKey: [FEEDBACK_QUERY_KEY, workspaceId, 'list', filters],
    queryFn: ({ pageParam = 1 }) => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.getFeedbackList(workspaceId, { ...filters, page: pageParam, limit: 20 });
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.meta.page < lastPage.meta.totalPages) {
        return lastPage.meta.page + 1;
      }
      return undefined;
    },
    enabled: !!workspaceId,
    initialPageParam: 1,
  });

  // Hook for fetching a single feedback item by ID
  const { data: feedback, isLoading, isError, error } = useQuery<Feedback, Error>({
    queryKey: [FEEDBACK_QUERY_KEY, workspaceId, feedbackId],
    queryFn: () => {
      if (!workspaceId || !feedbackId) throw new Error('Workspace or Feedback ID is not available');
      return apiClient.getFeedbackById(workspaceId, feedbackId);
    },
    enabled: !!workspaceId && !!feedbackId,
  });

  // Hook for creating a new feedback item
  const { mutate: createFeedback, isPending: isCreating } = useMutation<Feedback, Error, CreateFeedbackDto>({
    mutationFn: (data) => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.createFeedback(workspaceId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FEEDBACK_QUERY_KEY, workspaceId, 'list'] });
    },
  });

  // Hook for updating an existing feedback item
  const { mutate: updateFeedback, isPending: isUpdating } = useMutation<Feedback, Error, { feedbackId: string; data: UpdateFeedbackDto }>({
    mutationFn: ({ feedbackId, data }) => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.updateFeedback(workspaceId, feedbackId, data);
    },
    onSuccess: (updatedFeedback) => {
      queryClient.invalidateQueries({ queryKey: [FEEDBACK_QUERY_KEY, workspaceId, 'list'] });
      queryClient.setQueryData([FEEDBACK_QUERY_KEY, workspaceId, updatedFeedback.id], updatedFeedback);
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
    updateFeedback,
    isUpdating,
  };
};

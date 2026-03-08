import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { CreateRoadmapItemDto, RoadmapItem, RoadmapListResponse, UpdateRoadmapItemDto } from '@/lib/api-types';
import { useWorkspace } from './use-workspace';

const ROADMAP_QUERY_KEY = 'roadmap';
const THEME_QUERY_KEY = 'themes'; // For invalidation

export const useRoadmap = () => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  const { data: roadmap, isLoading, isError, error } = useQuery<RoadmapListResponse, Error>({
    queryKey: [ROADMAP_QUERY_KEY, workspaceId],
    queryFn: () => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.getRoadmap(workspaceId);
    },
    enabled: !!workspaceId,
  });

  const { mutate: createRoadmapItem, isPending: isCreating } = useMutation<
    RoadmapItem,
    Error,
    CreateRoadmapItemDto
  >({
    mutationFn: (data) => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.createRoadmapItem(workspaceId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ROADMAP_QUERY_KEY, workspaceId] });
    },
  });

  const { mutate: updateRoadmapItem, isPending: isUpdating } = useMutation<
    RoadmapItem,
    Error,
    { itemId: string; data: UpdateRoadmapItemDto }
  >({
    mutationFn: ({ itemId, data }) => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.updateRoadmapItem(workspaceId, itemId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ROADMAP_QUERY_KEY, workspaceId] });
    },
  });

  const { mutate: createFromTheme, isPending: isCreatingFromTheme } = useMutation<
    RoadmapItem,
    Error,
    { themeId: string }
  >({
    mutationFn: ({ themeId }) => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.createRoadmapItemFromTheme(workspaceId, themeId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ROADMAP_QUERY_KEY, workspaceId] });
      queryClient.invalidateQueries({ queryKey: [THEME_QUERY_KEY, workspaceId, 'list'] });
    },
  });

  return {
    roadmap,
    isLoading,
    isError,
    error,
    createRoadmapItem,
    isCreating,
    updateRoadmapItem,
    isUpdating,
    createFromTheme,
    isCreatingFromTheme,
  };
};

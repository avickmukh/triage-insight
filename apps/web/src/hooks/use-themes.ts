import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { CreateThemeDto, Theme, ThemeListResponse, UpdateThemeDto, AddFeedbackToThemeDto } from '@/lib/api-types';
import { useWorkspace } from './use-workspace';

const THEME_QUERY_KEY = 'themes';

export const useThemes = (themeId?: string) => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  // Hook for fetching a paginated list of themes
  const useThemeList = (filters: any = {}) => useInfiniteQuery<ThemeListResponse, Error>({
    queryKey: [THEME_QUERY_KEY, workspaceId, 'list', filters],
    queryFn: ({ pageParam = 1 }) => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.getThemeList(workspaceId, { ...filters, page: pageParam, limit: 20 });
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

  // Hook for fetching a single theme by ID
  const { data: theme, isLoading, isError, error } = useQuery<Theme, Error>({
    queryKey: [THEME_QUERY_KEY, workspaceId, themeId],
    queryFn: () => {
      if (!workspaceId || !themeId) throw new Error('Workspace or Theme ID is not available');
      return apiClient.getThemeById(workspaceId, themeId);
    },
    enabled: !!workspaceId && !!themeId,
  });

  // Hook for creating a new theme
  const { mutate: createTheme, isPending: isCreating } = useMutation<Theme, Error, CreateThemeDto>({
    mutationFn: (data) => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.createTheme(workspaceId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [THEME_QUERY_KEY, workspaceId, 'list'] });
    },
  });

  // Hook for updating an existing theme
  const { mutate: updateTheme, isPending: isUpdating } = useMutation<Theme, Error, { themeId: string; data: UpdateThemeDto }>({
    mutationFn: ({ themeId, data }) => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.updateTheme(workspaceId, themeId, data);
    },
    onSuccess: (updatedTheme) => {
      queryClient.invalidateQueries({ queryKey: [THEME_QUERY_KEY, workspaceId, 'list'] });
      queryClient.setQueryData([THEME_QUERY_KEY, workspaceId, updatedTheme.id], updatedTheme);
    },
  });

  // Hook for adding feedback to a theme
  const { mutate: addFeedbackToTheme, isPending: isAddingFeedback } = useMutation<void, Error, { themeId: string; data: AddFeedbackToThemeDto }>({
    mutationFn: ({ themeId, data }) => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.addFeedbackToTheme(workspaceId, themeId, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [THEME_QUERY_KEY, workspaceId, variables.themeId] });
      queryClient.invalidateQueries({ queryKey: [THEME_QUERY_KEY, workspaceId, 'list'] });
    },
  });

  return {
    useThemeList,
    theme,
    isLoading,
    isError,
    error,
    createTheme,
    isCreating,
    updateTheme,
    isUpdating,
    addFeedbackToTheme,
    isAddingFeedback,
  };
};

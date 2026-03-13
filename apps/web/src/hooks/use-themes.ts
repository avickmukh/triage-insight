import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import { CreateThemeDto, MoveFeedbackDto, Theme, ThemeListResponse, UpdateThemeDto } from "@/lib/api-types";
import { useWorkspace } from "./use-workspace";

const THEME_QUERY_KEY = "themes";

export const useThemes = (themeId?: string) => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  const useThemeList = (params: any = {}) => {
    return useInfiniteQuery<ThemeListResponse, Error>({
      queryKey: [THEME_QUERY_KEY, workspaceId, "list", params],
      queryFn: ({ pageParam = 1 }) => {
        if (!workspaceId) throw new Error("Workspace ID is not available");
        return apiClient.themes.list(workspaceId, { ...params, page: pageParam });
      },
      getNextPageParam: (lastPage) => {
        if (lastPage?.meta?.page < lastPage?.meta?.totalPages) {
          return lastPage?.meta?.page + 1;
        }
        return undefined;
      },
      enabled: !!workspaceId,
      initialPageParam: 1,
    });
  };

  const { data: theme, isLoading, isError, error } = useQuery<Theme, Error>({
    queryKey: [THEME_QUERY_KEY, workspaceId, themeId],
    queryFn: () => {
      if (!workspaceId || !themeId) throw new Error("Workspace or Theme ID is not available");
      return apiClient.themes.getById(workspaceId, themeId);
    },
    enabled: !!workspaceId && !!themeId,
  });

  const { mutate: createTheme, isPending: isCreating } = useMutation<
    Theme,
    Error,
    CreateThemeDto
  >({
    mutationFn: (data) => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.themes.create(workspaceId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [THEME_QUERY_KEY, workspaceId, "list"] });
    },
  });

  const { mutate: updateTheme, isPending: isUpdating } = useMutation<
    Theme,
    Error,
    { themeId: string; data: UpdateThemeDto }
  >({
    mutationFn: ({ themeId, data }) => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.themes.update(workspaceId, themeId, data);
    },
    onSuccess: (updatedTheme) => {
      queryClient.invalidateQueries({ queryKey: [THEME_QUERY_KEY, workspaceId, "list"] });
      queryClient.setQueryData([THEME_QUERY_KEY, workspaceId, updatedTheme.id], updatedTheme);
    },
  });

  const { mutate: moveFeedback, isPending: isMovingFeedback } = useMutation<
    void,
    Error,
    MoveFeedbackDto
  >({
    mutationFn: (data) => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.themes.moveFeedback(workspaceId, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [THEME_QUERY_KEY, workspaceId, "list"] });
      if (variables.sourceThemeId) {
        queryClient.invalidateQueries({ queryKey: [THEME_QUERY_KEY, workspaceId, variables.sourceThemeId] });
      }
      if (variables.targetThemeId) {
        queryClient.invalidateQueries({ queryKey: [THEME_QUERY_KEY, workspaceId, variables.targetThemeId] });
      }
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
    moveFeedback,
    isMovingFeedback,
  };
};

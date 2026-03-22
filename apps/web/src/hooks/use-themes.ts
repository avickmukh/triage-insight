import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import {
  CreateThemeDto,
  MoveFeedbackDto,
  Theme,
  ThemeListResponse,
  ThemeLinkedFeedbackResponse,
  ThemeStatus,
  UpdateThemeDto,
} from '@/lib/api-types';
import { useWorkspace } from './use-workspace';

const THEME_QUERY_KEY = 'themes';

// ─── Lightweight count hook ───────────────────────────────────────────────────
/**
 * Returns the total count of themes matching the given status filter.
 * Uses limit=1 so only one row is fetched; the backend still returns the
 * accurate `total` count in the response envelope.
 */
export const useThemeCount = (status?: ThemeStatus) => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useQuery<ThemeListResponse, Error, number>({
    queryKey: [THEME_QUERY_KEY, workspaceId, 'count', status],
    queryFn: () => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.themes.list(workspaceId, { status, limit: 1, page: 1 });
    },
    select: (res) => res.total,
    enabled: !!workspaceId,
    staleTime: 1000 * 30,
  });
};

// ─── Theme List ──────────────────────────────────────────────────────────────

export interface ThemeListParams {
  search?: string;
  status?: string;
  pinned?: boolean;
  limit?: number;
}

/**
 * Infinite-scroll hook for the themes list.
 * Backend returns flat { data, total, page, limit } — NOT a meta wrapper.
 */
export const useThemeList = (params: ThemeListParams = {}) => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useInfiniteQuery<ThemeListResponse, Error>({
    queryKey: [THEME_QUERY_KEY, workspaceId, 'list', params],
    queryFn: ({ pageParam = 1 }) => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.themes.list(workspaceId, {
        ...params,
        page: pageParam as number,
      });
    },
    // Flat pagination: advance when page < ceil(total / limit)
    getNextPageParam: (lastPage) => {
      const { page, limit, total } = lastPage;
      const totalPages = Math.ceil(total / (limit || 20));
      return page < totalPages ? page + 1 : undefined;
    },
    enabled: !!workspaceId,
    initialPageParam: 1,
  });
};

// ─── Theme Detail ────────────────────────────────────────────────────────────

/**
 * Fetch a single theme with linkedFeedback[] and aggregatedPriorityScore.
 */
export const useThemeDetail = (themeId: string | undefined) => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useQuery<Theme, Error>({
    queryKey: [THEME_QUERY_KEY, workspaceId, themeId],
    queryFn: () => {
      if (!workspaceId || !themeId)
        throw new Error('Workspace or Theme ID is not available');
      return apiClient.themes.getById(workspaceId, themeId);
    },
    enabled: !!workspaceId && !!themeId,
  });
};

// ─── Linked Feedback (paginated) ─────────────────────────────────────────────

export const useThemeLinkedFeedback = (
  themeId: string | undefined,
  params: { limit?: number } = {}
) => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useInfiniteQuery<ThemeLinkedFeedbackResponse, Error>({
    queryKey: [THEME_QUERY_KEY, workspaceId, themeId, 'feedback', params],
    queryFn: ({ pageParam = 1 }) => {
      if (!workspaceId || !themeId)
        throw new Error('Workspace or Theme ID is not available');
      return apiClient.themes.listLinkedFeedback(workspaceId, themeId, {
        page: pageParam as number,
        ...params,
      });
    },
    getNextPageParam: (lastPage) => {
      const { page, limit, total } = lastPage;
      const totalPages = Math.ceil(total / (limit || 50));
      return page < totalPages ? page + 1 : undefined;
    },
    enabled: !!workspaceId && !!themeId,
    initialPageParam: 1,
  });
};

// ─── Mutations ───────────────────────────────────────────────────────────────

export const useCreateTheme = () => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  const queryClient = useQueryClient();

  return useMutation<Theme, Error, CreateThemeDto>({
    mutationFn: (data) => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.themes.create(workspaceId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [THEME_QUERY_KEY, workspaceId, 'list'],
      });
    },
  });
};

export const useUpdateTheme = (themeId: string) => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  const queryClient = useQueryClient();

  return useMutation<Theme, Error, UpdateThemeDto>({
    mutationFn: (data) => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.themes.update(workspaceId, themeId, data);
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({
        queryKey: [THEME_QUERY_KEY, workspaceId, 'list'],
      });
      queryClient.setQueryData(
        [THEME_QUERY_KEY, workspaceId, updated.id],
        updated
      );
    },
  });
};

export const useRemoveFeedbackFromTheme = (themeId: string) => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (feedbackId) => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.themes.removeFeedback(workspaceId, themeId, feedbackId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [THEME_QUERY_KEY, workspaceId, themeId],
      });
      queryClient.invalidateQueries({
        queryKey: [THEME_QUERY_KEY, workspaceId, 'list'],
      });
    },
  });
};

export const useMoveFeedback = () => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  const queryClient = useQueryClient();

  return useMutation<void, Error, MoveFeedbackDto>({
    mutationFn: (data) => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.themes.moveFeedback(workspaceId, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [THEME_QUERY_KEY, workspaceId, 'list'],
      });
      if (variables.sourceThemeId) {
        queryClient.invalidateQueries({
          queryKey: [THEME_QUERY_KEY, workspaceId, variables.sourceThemeId],
        });
      }
      if (variables.targetThemeId) {
        queryClient.invalidateQueries({
          queryKey: [THEME_QUERY_KEY, workspaceId, variables.targetThemeId],
        });
      }
    },
  });
};

export const useTriggerRecluster = () => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  const queryClient = useQueryClient();

  return useMutation<{ message: string; jobId: string | number }, Error, void>({
    mutationFn: () => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.themes.triggerRecluster(workspaceId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [THEME_QUERY_KEY, workspaceId, 'list'],
      });
    },
  });
};

// ─── Legacy combined hook (kept for backward compatibility) ──────────────────
/**
 * @deprecated Use the individual hooks above instead.
 * Kept for any existing callers that import useThemes().
 */
export const useThemes = (themeId?: string) => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  const queryClient = useQueryClient();

  const useThemeListLegacy = (params: ThemeListParams = {}) =>
    useThemeList(params);

  const {
    data: theme,
    isLoading,
    isError,
    error,
  } = useQuery<Theme, Error>({
    queryKey: [THEME_QUERY_KEY, workspaceId, themeId],
    queryFn: () => {
      if (!workspaceId || !themeId)
        throw new Error('Workspace or Theme ID is not available');
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
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.themes.create(workspaceId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [THEME_QUERY_KEY, workspaceId, 'list'],
      });
    },
  });

  const { mutate: updateTheme, isPending: isUpdating } = useMutation<
    Theme,
    Error,
    { themeId: string; data: UpdateThemeDto }
  >({
    mutationFn: ({ themeId: tid, data }) => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.themes.update(workspaceId, tid, data);
    },
    onSuccess: (updatedTheme) => {
      queryClient.invalidateQueries({
        queryKey: [THEME_QUERY_KEY, workspaceId, 'list'],
      });
      queryClient.setQueryData(
        [THEME_QUERY_KEY, workspaceId, updatedTheme.id],
        updatedTheme
      );
    },
  });

  const { mutate: moveFeedback, isPending: isMovingFeedback } = useMutation<
    void,
    Error,
    MoveFeedbackDto
  >({
    mutationFn: (data) => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.themes.moveFeedback(workspaceId, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [THEME_QUERY_KEY, workspaceId, 'list'],
      });
      if (variables.sourceThemeId) {
        queryClient.invalidateQueries({
          queryKey: [THEME_QUERY_KEY, workspaceId, variables.sourceThemeId],
        });
      }
      if (variables.targetThemeId) {
        queryClient.invalidateQueries({
          queryKey: [THEME_QUERY_KEY, workspaceId, variables.targetThemeId],
        });
      }
    },
  });

  return {
    useThemeList: useThemeListLegacy,
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

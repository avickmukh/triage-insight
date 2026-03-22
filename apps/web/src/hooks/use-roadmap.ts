import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import {
  CreateRoadmapItemDto,
  RoadmapBoardResponse,
  RoadmapItem,
  UpdateRoadmapItemDto,
} from "@/lib/api-types";
import { useWorkspace } from "./use-workspace";

const ROADMAP_KEY = "roadmap";
const THEME_KEY = "themes";

// ─── Board (kanban-grouped) ────────────────────────────────────────────────────

export const useRoadmapBoard = (params?: { search?: string; isPublic?: boolean }) => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useQuery<RoadmapBoardResponse, Error>({
    queryKey: [ROADMAP_KEY, workspaceId, "board", params],
    queryFn: () => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.roadmap.list(workspaceId, params);
    },
    enabled: !!workspaceId,
  });
};

// ─── Single item ──────────────────────────────────────────────────────────────

export const useRoadmapItem = (itemId: string | null) => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useQuery<RoadmapItem, Error>({
    queryKey: [ROADMAP_KEY, workspaceId, "item", itemId],
    queryFn: () => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      if (!itemId) throw new Error("Item ID is not available");
      return apiClient.roadmap.getById(workspaceId, itemId);
    },
    enabled: !!workspaceId && !!itemId,
  });
};

// ─── Mutations ────────────────────────────────────────────────────────────────

export const useCreateRoadmapItem = () => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useMutation<RoadmapItem, Error, CreateRoadmapItemDto>({
    mutationFn: (data) => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.roadmap.create(workspaceId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ROADMAP_KEY, workspaceId] });
    },
  });
};

export const useUpdateRoadmapItem = () => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useMutation<RoadmapItem, Error, { itemId: string; data: UpdateRoadmapItemDto }>({
    mutationFn: ({ itemId, data }) => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.roadmap.update(workspaceId, itemId, data);
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: [ROADMAP_KEY, workspaceId] });
      queryClient.setQueryData([ROADMAP_KEY, workspaceId, "item", updated.id], updated);
    },
  });
};

export const useDeleteRoadmapItem = () => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useMutation<void, Error, string>({
    mutationFn: (itemId) => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.roadmap.remove(workspaceId, itemId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ROADMAP_KEY, workspaceId] });
    },
  });
};

export const useCreateRoadmapFromTheme = () => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useMutation<RoadmapItem, Error, { themeId: string }>({
    mutationFn: ({ themeId }) => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.roadmap.createFromTheme(workspaceId, themeId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ROADMAP_KEY, workspaceId] });
      queryClient.invalidateQueries({ queryKey: [THEME_KEY, workspaceId, "list"] });
    },
  });
};

// ─── Legacy composite hook (backward compat) ──────────────────────────────────

export const useRoadmap = () => {
  const board = useRoadmapBoard();
  const createMutation = useCreateRoadmapItem();
  const updateMutation = useUpdateRoadmapItem();
  const createFromThemeMutation = useCreateRoadmapFromTheme();

  return {
    roadmap: board.data,
    isLoading: board.isLoading,
    isError: board.isError,
    error: board.error,
    createRoadmapItem: createMutation.mutate,
    isCreating: createMutation.isPending,
    updateRoadmapItem: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    createFromTheme: createFromThemeMutation.mutate,
    isCreatingFromTheme: createFromThemeMutation.isPending,
  };
};

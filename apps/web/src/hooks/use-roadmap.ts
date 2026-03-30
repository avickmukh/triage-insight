import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import {
  AiRoadmapSuggestionsResponse,
  CiqScoreOutput,
  CreateRoadmapItemDto,
  RoadmapBoardResponse,
  RoadmapItem,
  RoadmapItemDetail,
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

// ─── Single item (full detail: linkedFeedback + signalSummary) ────────────────────

export const useRoadmapItem = (itemId: string | null) => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useQuery<RoadmapItemDetail, Error>({
    queryKey: [ROADMAP_KEY, workspaceId, "item", itemId],
    queryFn: () => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      if (!itemId) throw new Error("Item ID is not available");
      return apiClient.roadmap.getById(workspaceId, itemId);
    },
    enabled: !!workspaceId && !!itemId,
  });
};

// ─── CIQ explanation (full score breakdown) ───────────────────────────────────

/**
 * Fetch the full CIQ score explanation for a roadmap item.
 * Enabled only when itemId is provided.
 * Returns { priorityScore, confidenceScore, revenueImpactScore, scoreExplanation, ... }
 */
export const useRoadmapItemCiqExplanation = (itemId: string | null) => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useQuery<CiqScoreOutput, Error>({
    queryKey: [ROADMAP_KEY, workspaceId, "ciq", itemId],
    queryFn: () => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      if (!itemId) throw new Error("Item ID is not available");
      return apiClient.roadmap.getCiqExplanation(workspaceId, itemId);
    },
    enabled: !!workspaceId && !!itemId,
    staleTime: 5 * 60 * 1000, // 5 min — CIQ scores change only on queue events
  });
};

// ─── Refresh intelligence ─────────────────────────────────────────────────────

export const useRefreshIntelligence = () => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useMutation<RoadmapItem & { scoreExplanation?: CiqScoreOutput["scoreExplanation"] }, Error, string>({
    mutationFn: (itemId) => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.roadmap.refreshIntelligence(workspaceId, itemId);
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: [ROADMAP_KEY, workspaceId, "board"] });
      queryClient.invalidateQueries({ queryKey: [ROADMAP_KEY, workspaceId, "item", updated.id] });
      // Invalidate CIQ explanation cache so next fetch gets fresh data
      queryClient.invalidateQueries({ queryKey: [ROADMAP_KEY, workspaceId, "ciq", updated.id] });
    },
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

// ─── Prioritization Board (flat sorted list) ─────────────────────────────────

export type RoadmapSortField = 'priorityScore' | 'manualRank' | 'feedbackCount' | 'createdAt' | 'updatedAt';

export const useRoadmapPrioritizationBoard = (params?: {
  search?: string;
  sortBy?: RoadmapSortField;
  sortOrder?: 'asc' | 'desc';
  status?: string[];
}) => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useQuery<RoadmapItem[], Error>({
    queryKey: [ROADMAP_KEY, workspaceId, 'flat', params],
    queryFn: () => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.roadmap.listFlat(workspaceId, params);
    },
    enabled: !!workspaceId,
  });
};

/** Lightweight mutation to update only the manualRank of a roadmap item. */
export const useUpdateRoadmapRank = () => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useMutation<RoadmapItem, Error, { itemId: string; manualRank: number | null }>({
    mutationFn: ({ itemId, manualRank }) => {
      if (!workspaceId) throw new Error('Workspace ID is not available');
      return apiClient.roadmap.update(workspaceId, itemId, { manualRank });
    },
    onSuccess: () => {
      // Invalidate both board and flat list caches
      queryClient.invalidateQueries({ queryKey: [ROADMAP_KEY, workspaceId, 'flat'] });
      queryClient.invalidateQueries({ queryKey: [ROADMAP_KEY, workspaceId, 'board'] });
    },
  });
};

// ─── AI Roadmap Suggestions ────────────────────────────────────────────────────────────────

/***
 * Fetch AI-generated roadmap suggestions for all active themes.
 * Returns ADD_TO_ROADMAP | INCREASE_PRIORITY | DECREASE_PRIORITY | MONITOR | NO_ACTION
 * with reason, confidence, signal summary, and RPS breakdown per theme.
 */
export const useAiRoadmapSuggestions = (workspaceId: string, limit?: number) => {
  return useQuery<AiRoadmapSuggestionsResponse, Error>({
    queryKey: [ROADMAP_KEY, workspaceId, 'ai-suggestions', limit],
    queryFn: () => apiClient.roadmap.getAiSuggestions(workspaceId, limit),
    staleTime: 5 * 60 * 1000,
    enabled: !!workspaceId,
  });
};

// ─── Legacy composite hook (backward compat) ──────────────────────────────────────────────

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

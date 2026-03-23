/**
 * CIQ (Customer Intelligence Quotient) hooks
 *
 * Provides React Query hooks for consuming real CIQ score outputs
 * from the backend scoring engine.
 *
 * Usage:
 *   const { data: ciq } = useThemeCiqScore(themeId);
 *   const recalc = useRecalculateThemeCiq();
 *   recalc.mutate(themeId);
 *
 *   const recalcAll = useRecalculateAllThemes();
 *   recalcAll.mutate();
 *
 *   const { data: settings } = usePrioritizationSettings();
 *   const update = useUpdatePrioritizationSettings();
 *   update.mutate({ voteWeight: 0.2, recencyWeight: 0.1 });
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import { CiqScoreOutput, PrioritizationSettings, Theme } from "@/lib/api-types";
import { useWorkspace } from "./use-workspace";

const CIQ_KEY = "ciq";
const THEMES_KEY = "themes";

// ─── Theme CIQ score ──────────────────────────────────────────────────────────

/**
 * Fetch the real CIQ score for a theme.
 * Returns priorityScore, confidenceScore, revenueImpactScore, scoreExplanation, etc.
 * Stale after 5 minutes (re-fetched on queue-triggered invalidation).
 */
export const useThemeCiqScore = (themeId: string | null) => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useQuery<CiqScoreOutput, Error>({
    queryKey: [CIQ_KEY, workspaceId, "theme", themeId],
    queryFn: () => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      if (!themeId) throw new Error("Theme ID is not available");
      return apiClient.prioritization.getThemeCiq(workspaceId, themeId);
    },
    enabled: !!workspaceId && !!themeId,
    staleTime: 5 * 60 * 1000,
  });
};

// ─── Prioritized theme list ───────────────────────────────────────────────────

/**
 * Fetch all ACTIVE themes ordered by stored priorityScore (desc, nulls last).
 * Used by the Priority Intelligence view in the themes list.
 */
export const usePrioritizedThemes = (params?: { page?: number; limit?: number }) => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useQuery<{ data: Theme[]; total: number; page: number; limit: number }, Error>({
    queryKey: [CIQ_KEY, workspaceId, "prioritized-themes", params],
    queryFn: () => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.prioritization.getThemes(workspaceId, {
        ...params,
        sortBy: "priorityScore",
      });
    },
    enabled: !!workspaceId,
    staleTime: 2 * 60 * 1000,
  });
};

// ─── Recalculate single theme CIQ (ADMIN / EDITOR only) ──────────────────────

/**
 * Enqueue an async CIQ scoring job for a single theme.
 * Returns immediately with a job reference.
 * Invalidates the theme CIQ cache after a short delay to allow the job to complete.
 */
export const useRecalculateThemeCiq = () => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useMutation<{ jobId: string | number; message: string }, Error, string>({
    mutationFn: (themeId) => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.prioritization.recalculateThemeCiq(workspaceId, themeId);
    },
    onSuccess: (_data, themeId) => {
      // Invalidate after 3s to give the queue job time to complete
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: [CIQ_KEY, workspaceId, "theme", themeId] });
        queryClient.invalidateQueries({ queryKey: [THEMES_KEY, workspaceId] });
        queryClient.invalidateQueries({ queryKey: [CIQ_KEY, workspaceId, "prioritized-themes"] });
      }, 3000);
    },
  });
};

// ─── Recalculate ALL themes (ADMIN only) ─────────────────────────────────────

/**
 * Enqueue CIQ scoring jobs for ALL active themes in the workspace.
 * Used by the "Recalculate All" button in the AI settings panel.
 */
export const useRecalculateAllThemes = () => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useMutation<{ enqueued: number; message: string }, Error, void>({
    mutationFn: () => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.prioritization.recalculateAll(workspaceId);
    },
    onSuccess: () => {
      // Invalidate all theme and CIQ caches after 5s to allow jobs to complete
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: [THEMES_KEY, workspaceId] });
        queryClient.invalidateQueries({ queryKey: [CIQ_KEY, workspaceId] });
      }, 5000);
    },
  });
};

// ─── Prioritization settings ──────────────────────────────────────────────────

/**
 * Fetch the workspace prioritization settings (scoring weights).
 */
export const usePrioritizationSettings = () => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useQuery<PrioritizationSettings, Error>({
    queryKey: [CIQ_KEY, workspaceId, "settings"],
    queryFn: () => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.prioritization.getSettings(workspaceId);
    },
    enabled: !!workspaceId,
    staleTime: 10 * 60 * 1000,
  });
};

/**
 * Update workspace prioritization settings (ADMIN only).
 * Invalidates the settings cache on success.
 */
export const useUpdatePrioritizationSettings = () => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useMutation<PrioritizationSettings, Error, Partial<PrioritizationSettings>>({
    mutationFn: (data) => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.prioritization.updateSettings(workspaceId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CIQ_KEY, workspaceId, "settings"] });
    },
  });
};

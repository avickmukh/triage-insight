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
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import { CiqScoreOutput } from "@/lib/api-types";
import { useWorkspace } from "./use-workspace";

const CIQ_KEY = "ciq";

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

// ─── Recalculate theme CIQ (ADMIN / EDITOR only) ─────────────────────────────

/**
 * Synchronously recalculate the CIQ score for a theme.
 * Invalidates the theme CIQ cache on success.
 */
export const useRecalculateThemeCiq = () => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useMutation<CiqScoreOutput, Error, string>({
    mutationFn: (themeId) => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.prioritization.recalculateThemeCiq(workspaceId, themeId);
    },
    onSuccess: (_data, themeId) => {
      queryClient.invalidateQueries({ queryKey: [CIQ_KEY, workspaceId, "theme", themeId] });
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

  return useQuery<Record<string, number>, Error>({
    queryKey: [CIQ_KEY, workspaceId, "settings"],
    queryFn: () => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.prioritization.getSettings(workspaceId) as Promise<Record<string, number>>;
    },
    enabled: !!workspaceId,
  });
};

/**
 * Update workspace prioritization settings (ADMIN only).
 */
export const useUpdatePrioritizationSettings = () => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useMutation<unknown, Error, Record<string, number>>({
    mutationFn: (data) => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.prioritization.updateSettings(workspaceId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CIQ_KEY, workspaceId, "settings"] });
    },
  });
};

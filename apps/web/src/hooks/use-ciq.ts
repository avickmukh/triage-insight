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
import {
  CiqScoreOutput,
  PrioritizationSettings,
  Theme,
  ThemePriorityItem,
  ThemeRevenueIntelligence,
  FeatureRankingItem,
  ThemeRankingItem,
  CustomerRankingItem,
  StrategicSignalsOutput,
} from "@/lib/api-types";
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

  return useQuery<{ data: ThemePriorityItem[]; total: number; page: number; limit: number }, Error>({
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

// ─── Theme Revenue Intelligence ───────────────────────────────────────────────

const REVENUE_KEY = "theme-revenue";

/**
 * Fetch the full revenue intelligence for a theme:
 * deals, totalInfluence, openInfluence, topCustomers, totalCustomerARR.
 */
export const useThemeRevenueIntelligence = (themeId: string | null) => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useQuery<ThemeRevenueIntelligence, Error>({
    queryKey: [REVENUE_KEY, workspaceId, themeId],
    queryFn: () => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      if (!themeId) throw new Error("Theme ID is not available");
      return apiClient.themeRevenue.getByTheme(workspaceId, themeId);
    },
    enabled: !!workspaceId && !!themeId,
    staleTime: 2 * 60 * 1000,
  });
};

// ─── Link / unlink deal to theme ─────────────────────────────────────────────

export const useLinkDealToTheme = () => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useMutation<{ success: boolean }, Error, { themeId: string; dealId: string }>({
    mutationFn: ({ themeId, dealId }) => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.themeRevenue.linkDeal(workspaceId, themeId, dealId);
    },
    onSuccess: (_data, { themeId }) => {
      queryClient.invalidateQueries({ queryKey: [REVENUE_KEY, workspaceId, themeId] });
      queryClient.invalidateQueries({ queryKey: [CIQ_KEY, workspaceId, "theme", themeId] });
    },
  });
};

export const useUnlinkDealFromTheme = () => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useMutation<{ success: boolean }, Error, { themeId: string; dealId: string }>({
    mutationFn: ({ themeId, dealId }) => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.themeRevenue.unlinkDeal(workspaceId, themeId, dealId);
    },
    onSuccess: (_data, { themeId }) => {
      queryClient.invalidateQueries({ queryKey: [REVENUE_KEY, workspaceId, themeId] });
      queryClient.invalidateQueries({ queryKey: [CIQ_KEY, workspaceId, "theme", themeId] });
    },
  });
};

// ─── Link / unlink customer to theme ─────────────────────────────────────────

export const useLinkCustomerToTheme = () => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useMutation<{ success: boolean }, Error, { themeId: string; customerId: string }>({
    mutationFn: ({ themeId, customerId }) => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.themeRevenue.linkCustomer(workspaceId, themeId, customerId);
    },
    onSuccess: (_data, { themeId }) => {
      queryClient.invalidateQueries({ queryKey: [REVENUE_KEY, workspaceId, themeId] });
      queryClient.invalidateQueries({ queryKey: [CIQ_KEY, workspaceId, "theme", themeId] });
    },
  });
};

export const useUnlinkCustomerFromTheme = () => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  return useMutation<{ success: boolean }, Error, { themeId: string; customerId: string }>({
    mutationFn: ({ themeId, customerId }) => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.themeRevenue.unlinkCustomer(workspaceId, themeId, customerId);
    },
    onSuccess: (_data, { themeId }) => {
      queryClient.invalidateQueries({ queryKey: [REVENUE_KEY, workspaceId, themeId] });
      queryClient.invalidateQueries({ queryKey: [CIQ_KEY, workspaceId, "theme", themeId] });
    },
  });
};

// ─── CIQ Engine Hooks (Full Scoring Engine) ───────────────────────────────────

const CIQ_ENGINE_KEY = "ciq-engine";

/**
 * Fetch feedback items ranked by CIQ score (6-dimension composite).
 * Calls GET /workspaces/:id/ciq/feature-ranking
 */
export const useCiqFeatureRanking = (limit = 50) => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  return useQuery<FeatureRankingItem[], Error>({
    queryKey: [CIQ_ENGINE_KEY, workspaceId, "feature-ranking", limit],
    queryFn: () => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.ciqEngine.getFeatureRanking(workspaceId, limit);
    },
    enabled: !!workspaceId,
    staleTime: 2 * 60 * 1000,
  });
};

/**
 * Fetch ACTIVE themes ranked by CIQ score (voice + survey + support enriched).
 * Calls GET /workspaces/:id/ciq/theme-ranking
 */
export const useCiqThemeRanking = (limit = 50) => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  return useQuery<ThemeRankingItem[], Error>({
    queryKey: [CIQ_ENGINE_KEY, workspaceId, "theme-ranking", limit],
    queryFn: () => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.ciqEngine.getThemeRanking(workspaceId, limit);
    },
    enabled: !!workspaceId,
    staleTime: 2 * 60 * 1000,
  });
};

/**
 * Fetch customers ranked by CIQ influence score (ARR × segment weighted).
 * Calls GET /workspaces/:id/ciq/customer-ranking
 */
export const useCiqCustomerRanking = (limit = 50) => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  return useQuery<CustomerRankingItem[], Error>({
    queryKey: [CIQ_ENGINE_KEY, workspaceId, "customer-ranking", limit],
    queryFn: () => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.ciqEngine.getCustomerRanking(workspaceId, limit);
    },
    enabled: !!workspaceId,
    staleTime: 2 * 60 * 1000,
  });
};

/**
 * Fetch workspace-level strategic intelligence:
 * roadmap recommendations, voice/survey/support summaries, and signal feed.
 * Calls GET /workspaces/:id/ciq/strategic-signals
 */
export const useCiqStrategicSignals = () => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  return useQuery<StrategicSignalsOutput, Error>({
    queryKey: [CIQ_ENGINE_KEY, workspaceId, "strategic-signals"],
    queryFn: () => {
      if (!workspaceId) throw new Error("Workspace ID is not available");
      return apiClient.ciqEngine.getStrategicSignals(workspaceId);
    },
    enabled: !!workspaceId,
    staleTime: 3 * 60 * 1000,
  });
};

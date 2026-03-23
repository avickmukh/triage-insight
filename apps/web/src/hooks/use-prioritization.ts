'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

// ─── Query Keys ───────────────────────────────────────────────────────────────
export const prioritizationKeys = {
  all:           (workspaceId: string) => ['prioritization', workspaceId] as const,
  themes:        (workspaceId: string) => ['prioritization', workspaceId, 'themes'] as const,
  features:      (workspaceId: string) => ['prioritization', workspaceId, 'features'] as const,
  opportunities: (workspaceId: string) => ['prioritization', workspaceId, 'opportunities'] as const,
  roadmap:       (workspaceId: string) => ['prioritization', workspaceId, 'roadmap'] as const,
  settings:      (workspaceId: string) => ['prioritization', workspaceId, 'settings'] as const,
  themeExplain:  (workspaceId: string, themeId: string) => ['prioritization', workspaceId, 'themes', themeId, 'explanation'] as const,
  themeCiq:      (workspaceId: string, themeId: string) => ['prioritization', workspaceId, 'themes', themeId, 'ciq'] as const,
};

// ─── Theme Priority Ranking ───────────────────────────────────────────────────
export function usePrioritizedThemes(workspaceId: string, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: prioritizationKeys.themes(workspaceId),
    queryFn: () => apiClient.prioritization.getThemes(workspaceId, params),
    staleTime: 3 * 60 * 1000,
    enabled: !!workspaceId,
  });
}

// ─── Feature Priority Ranking ─────────────────────────────────────────────────
export function usePrioritizedFeatures(workspaceId: string, limit?: number) {
  return useQuery({
    queryKey: prioritizationKeys.features(workspaceId),
    queryFn: () => apiClient.prioritization.getFeatures(workspaceId, limit),
    staleTime: 5 * 60 * 1000,
    enabled: !!workspaceId,
  });
}

// ─── Revenue Opportunities ────────────────────────────────────────────────────
export function usePrioritizationOpportunities(workspaceId: string, limit?: number) {
  return useQuery({
    queryKey: prioritizationKeys.opportunities(workspaceId),
    queryFn: () => apiClient.prioritization.getOpportunities(workspaceId, limit),
    staleTime: 5 * 60 * 1000,
    enabled: !!workspaceId,
  });
}

// ─── Roadmap Recommendations ──────────────────────────────────────────────────
export function useRoadmapRecommendations(workspaceId: string, limit?: number) {
  return useQuery({
    queryKey: prioritizationKeys.roadmap(workspaceId),
    queryFn: () => apiClient.prioritization.getRoadmapRecommendations(workspaceId, limit),
    staleTime: 5 * 60 * 1000,
    enabled: !!workspaceId,
  });
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export function usePrioritizationSettings(workspaceId: string) {
  return useQuery({
    queryKey: prioritizationKeys.settings(workspaceId),
    queryFn: () => apiClient.prioritization.getSettings(workspaceId),
    staleTime: 10 * 60 * 1000,
    enabled: !!workspaceId,
  });
}

export function useUpdatePrioritizationSettings(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof apiClient.prioritization.updateSettings>[1]) =>
      apiClient.prioritization.updateSettings(workspaceId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: prioritizationKeys.settings(workspaceId) });
      qc.invalidateQueries({ queryKey: prioritizationKeys.all(workspaceId) });
    },
  });
}

// ─── Full Workspace Recompute ─────────────────────────────────────────────────
export function useRecompute(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.prioritization.recompute(workspaceId),
    onSuccess: () => {
      // Invalidate after a short delay to allow the worker to complete
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: prioritizationKeys.all(workspaceId) });
      }, 30_000);
    },
  });
}

// ─── Theme Score Explanation ──────────────────────────────────────────────────
export function useThemeScoreExplanation(workspaceId: string, themeId: string) {
  return useQuery({
    queryKey: prioritizationKeys.themeExplain(workspaceId, themeId),
    queryFn: () => apiClient.prioritization.getThemeCiq(workspaceId, themeId),
    staleTime: 5 * 60 * 1000,
    enabled: !!workspaceId && !!themeId,
  });
}

// ─── Manual Override ──────────────────────────────────────────────────────────
export function useSetThemeOverride(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ themeId, data }: { themeId: string; data: { manualOverrideScore: number | null; strategicTag?: string | null; overrideReason?: string | null } }) =>
      apiClient.prioritization.setThemeOverride(workspaceId, themeId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: prioritizationKeys.themes(workspaceId) });
    },
  });
}

// ─── Strategic Tag ────────────────────────────────────────────────────────────
export function useSetStrategicTag(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ themeId, strategicTag }: { themeId: string; strategicTag: string | null }) =>
      apiClient.prioritization.setStrategicTag(workspaceId, themeId, strategicTag),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: prioritizationKeys.themes(workspaceId) });
    },
  });
}

// ─── Theme Recalculate ────────────────────────────────────────────────────────
export function useRecalculateTheme(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (themeId: string) =>
      apiClient.prioritization.recalculateThemeCiq(workspaceId, themeId),
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries({ queryKey: prioritizationKeys.themes(workspaceId) }), 5000);
    },
  });
}

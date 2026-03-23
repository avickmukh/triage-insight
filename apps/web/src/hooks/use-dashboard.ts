'use client';
/**
 * use-dashboard.ts
 *
 * React Query hooks for the Executive Dashboard Intelligence Surface.
 * All hooks are workspace-scoped and use the dashboard API client namespace.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';

// ─── Query keys ───────────────────────────────────────────────────────────────
export const dashboardKeys = {
  all:          (workspaceId: string) => ['dashboard', workspaceId] as const,
  executive:    (workspaceId: string) => ['dashboard', workspaceId, 'executive'] as const,
  themes:       (workspaceId: string) => ['dashboard', workspaceId, 'themes'] as const,
  revenueRisk:  (workspaceId: string) => ['dashboard', workspaceId, 'revenue-risk'] as const,
  voiceSignals: (workspaceId: string) => ['dashboard', workspaceId, 'voice-signals'] as const,
  roadmapHealth:(workspaceId: string) => ['dashboard', workspaceId, 'roadmap-health'] as const,
};

// ─── Full executive dashboard (all 7 surfaces) ────────────────────────────────
export function useExecutiveDashboard() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';

  return useQuery({
    queryKey:  dashboardKeys.executive(workspaceId),
    queryFn:   () => apiClient.dashboard.getExecutive(workspaceId),
    enabled:   !!workspaceId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry:     2,
  });
}

// ─── Emerging theme radar ─────────────────────────────────────────────────────
export function useDashboardThemes() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';

  return useQuery({
    queryKey:  dashboardKeys.themes(workspaceId),
    queryFn:   () => apiClient.dashboard.getThemes(workspaceId),
    enabled:   !!workspaceId,
    staleTime: 5 * 60 * 1000,
    retry:     2,
  });
}

// ─── Revenue risk indicator ───────────────────────────────────────────────────
export function useDashboardRevenueRisk() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';

  return useQuery({
    queryKey:  dashboardKeys.revenueRisk(workspaceId),
    queryFn:   () => apiClient.dashboard.getRevenueRisk(workspaceId),
    enabled:   !!workspaceId,
    staleTime: 5 * 60 * 1000,
    retry:     2,
  });
}

// ─── Voice sentiment signal ───────────────────────────────────────────────────
export function useDashboardVoiceSignals() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';

  return useQuery({
    queryKey:  dashboardKeys.voiceSignals(workspaceId),
    queryFn:   () => apiClient.dashboard.getVoiceSignals(workspaceId),
    enabled:   !!workspaceId,
    staleTime: 5 * 60 * 1000,
    retry:     2,
  });
}

// ─── Roadmap health panel ─────────────────────────────────────────────────────
export function useDashboardRoadmapHealth() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';

  return useQuery({
    queryKey:  dashboardKeys.roadmapHealth(workspaceId),
    queryFn:   () => apiClient.dashboard.getRoadmapHealth(workspaceId),
    enabled:   !!workspaceId,
    staleTime: 5 * 60 * 1000,
    retry:     2,
  });
}

// ─── Trigger async refresh ────────────────────────────────────────────────────
export function useDashboardRefresh() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.dashboard.refresh(workspaceId),
    onSuccess: () => {
      // Invalidate all dashboard queries after refresh
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all(workspaceId) });
    },
  });
}

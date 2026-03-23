'use client';
/**
 * use-reports.ts
 *
 * React Query hooks for the Enterprise Reporting layer.
 * All hooks are workspace-scoped and use the reports API client namespace.
 */
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';

// ─── Query keys ───────────────────────────────────────────────────────────────

export const reportKeys = {
  all:                  (workspaceId: string) => ['reports', workspaceId] as const,
  themeTrends:          (workspaceId: string, from?: string, to?: string) =>
    ['reports', workspaceId, 'theme-trends', from, to] as const,
  priorityDistribution: (workspaceId: string, from?: string, to?: string) =>
    ['reports', workspaceId, 'priority-distribution', from, to] as const,
  revenueImpact:        (workspaceId: string, from?: string, to?: string) =>
    ['reports', workspaceId, 'revenue-impact', from, to] as const,
  roadmapProgress:      (workspaceId: string, from?: string, to?: string) =>
    ['reports', workspaceId, 'roadmap-progress', from, to] as const,
  feedbackVolume:       (workspaceId: string, from?: string, to?: string) =>
    ['reports', workspaceId, 'feedback-volume', from, to] as const,
};

// ─── Shared date filter type ──────────────────────────────────────────────────

export interface ReportDateFilter {
  from?: string;
  to?: string;
}

// ─── 1. Theme Trends ──────────────────────────────────────────────────────────

export function useThemeTrendsReport(filter?: ReportDateFilter, limit = 20) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  return useQuery({
    queryKey:  reportKeys.themeTrends(workspaceId, filter?.from, filter?.to),
    queryFn:   () => apiClient.reports.getThemeTrends(workspaceId, filter, limit),
    enabled:   !!workspaceId,
    staleTime: 5 * 60 * 1000,
    // retry handled globally in providers.tsx
  });
}

// ─── 2. Priority Distribution ─────────────────────────────────────────────────

export function usePriorityDistributionReport(filter?: ReportDateFilter) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  return useQuery({
    queryKey:  reportKeys.priorityDistribution(workspaceId, filter?.from, filter?.to),
    queryFn:   () => apiClient.reports.getPriorityDistribution(workspaceId, filter),
    enabled:   !!workspaceId,
    staleTime: 5 * 60 * 1000,
    // retry handled globally in providers.tsx
  });
}

// ─── 3. Revenue Impact ────────────────────────────────────────────────────────

export function useRevenueImpactReport(filter?: ReportDateFilter, limit = 10) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  return useQuery({
    queryKey:  reportKeys.revenueImpact(workspaceId, filter?.from, filter?.to),
    queryFn:   () => apiClient.reports.getRevenueImpact(workspaceId, filter, limit),
    enabled:   !!workspaceId,
    staleTime: 5 * 60 * 1000,
    // retry handled globally in providers.tsx
  });
}

// ─── 4. Roadmap Progress ──────────────────────────────────────────────────────

export function useRoadmapProgressReport(filter?: ReportDateFilter) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  return useQuery({
    queryKey:  reportKeys.roadmapProgress(workspaceId, filter?.from, filter?.to),
    queryFn:   () => apiClient.reports.getRoadmapProgress(workspaceId, filter),
    enabled:   !!workspaceId,
    staleTime: 5 * 60 * 1000,
    // retry handled globally in providers.tsx
  });
}

// ─── 5. Feedback Volume ───────────────────────────────────────────────────────

export function useFeedbackVolumeReport(filter?: ReportDateFilter) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  return useQuery({
    queryKey:  reportKeys.feedbackVolume(workspaceId, filter?.from, filter?.to),
    queryFn:   () => apiClient.reports.getFeedbackVolume(workspaceId, filter),
    enabled:   !!workspaceId,
    staleTime: 5 * 60 * 1000,
    // retry handled globally in providers.tsx
  });
}

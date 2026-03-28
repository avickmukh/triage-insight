'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const supportKeys = {
  all: (workspaceId: string) => ['support', workspaceId] as const,
  overview: (workspaceId: string) => ['support', workspaceId, 'overview'] as const,
  tickets: (workspaceId: string, params?: object) => ['support', workspaceId, 'tickets', params] as const,
  clusters: (workspaceId: string) => ['support', workspaceId, 'clusters'] as const,
  spikes: (workspaceId: string) => ['support', workspaceId, 'spikes'] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useSupportOverview() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  return useQuery({
    queryKey: supportKeys.overview(workspaceId),
    queryFn: () => apiClient.support.getOverview(workspaceId),
    enabled: !!workspaceId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

export function useSupportTickets(params?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  return useQuery({
    queryKey: supportKeys.tickets(workspaceId, params),
    queryFn: () => apiClient.support.listTickets(workspaceId, params),
    enabled: !!workspaceId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useSupportClusters(limit?: number) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  return useQuery({
    queryKey: supportKeys.clusters(workspaceId),
    queryFn: () => apiClient.support.getClusters(workspaceId, limit),
    enabled: !!workspaceId,
    staleTime: 3 * 60 * 1000,
  });
}

export function useSupportSpikes() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  return useQuery({
    queryKey: supportKeys.spikes(workspaceId),
    queryFn: () => apiClient.support.getSpikes(workspaceId),
    enabled: !!workspaceId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useTriggerSupportSync() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.support.triggerSync(workspaceId),
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: supportKeys.all(workspaceId) });
      }, 3000);
    },
  });
}

export function useTriggerRecluster() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.support.triggerRecluster(workspaceId),
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: supportKeys.clusters(workspaceId) });
      }, 3000);
    },
  });
}

export function useSupportNegativeTrends(limit?: number) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  return useQuery({
    queryKey: ['support', workspaceId, 'negative-trends', limit],
    queryFn: () => apiClient.support.getNegativeTrends(workspaceId, limit),
    enabled: !!workspaceId,
    staleTime: 3 * 60 * 1000,
  });
}

export function useSupportLinkedThemes() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  return useQuery({
    queryKey: ['support', workspaceId, 'linked-themes'],
    queryFn: () => apiClient.support.getLinkedThemes(workspaceId),
    enabled: !!workspaceId,
    staleTime: 3 * 60 * 1000,
  });
}

export function useSupportCorrelations() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  return useQuery({
    queryKey: ['support', workspaceId, 'correlations'],
    queryFn: () => apiClient.support.getCorrelations(workspaceId),
    enabled: !!workspaceId,
    staleTime: 3 * 60 * 1000,
  });
}

export function useTriggerSentimentScoring() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.support.triggerSentimentScoring(workspaceId),
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: supportKeys.all(workspaceId) });
        queryClient.invalidateQueries({ queryKey: ['support', workspaceId, 'negative-trends'] });
        queryClient.invalidateQueries({ queryKey: ['support', workspaceId, 'linked-themes'] });
      }, 3000);
    },
  });
}

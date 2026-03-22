'use client';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { WorkspaceLimitSummary } from '@/lib/api-types';

/**
 * useWorkspaceLimits
 *
 * Fetches the workspace's current usage vs plan limits from
 * GET /workspace/current/limits.
 *
 * Returns:
 *   limits          — WorkspaceLimitSummary or undefined while loading
 *   isLoading       — true on first fetch
 *   isError         — true if the fetch failed
 */
export const useWorkspaceLimits = () => {
  const {
    data: limits,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<WorkspaceLimitSummary, Error>({
    queryKey: ['workspace', 'limits'],
    queryFn: apiClient.workspace.getLimits,
    staleTime: 30_000, // 30s — usage counts change frequently
    retry: 1,
  });

  return { limits, isLoading, isError, error, refetch };
};

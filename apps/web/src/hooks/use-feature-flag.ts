import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

const FEATURE_FLAG_QUERY_KEY = 'featureFlags';

/**
 * Custom hook to check the status of a feature flag.
 * @param flagName The name of the feature flag to check.
 * @returns An object containing the flag's status, loading state, and error state.
 */
export const useFeatureFlag = (flagName: string) => {
  const { data, isLoading, isError, error } = useQuery<{ enabled: boolean }, Error>({
    queryKey: [FEATURE_FLAG_QUERY_KEY, flagName],
    queryFn: () => apiClient.getFeatureFlag(flagName),
    staleTime: 1000 * 60 * 15, // Flags are stable, so stale time can be longer (15 mins)
    refetchOnWindowFocus: false, // No need to refetch on window focus
  });

  return {
    isEnabled: data?.enabled ?? false,
    isLoading,
    isError,
    error,
  };
};

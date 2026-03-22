import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import type { DomainSettings, SetDomainDto } from '@/lib/api-types';

const DOMAIN_KEY = ['domain', 'settings'] as const;

/**
 * Fetches the current workspace domain settings.
 * Accessible to all authenticated members (ADMIN, EDITOR, VIEWER).
 */
export function useDomain() {
  return useQuery<DomainSettings>({
    queryKey: DOMAIN_KEY,
    queryFn: () => apiClient.domain.getSettings(),
    staleTime: 30_000,
  });
}

/**
 * Sets or replaces the custom domain. ADMIN only.
 * On success the cache is updated with the returned DomainSettings.
 */
export function useSetDomain() {
  const queryClient = useQueryClient();
  return useMutation<DomainSettings, Error, SetDomainDto>({
    mutationFn: (dto) => apiClient.domain.setDomain(dto),
    onSuccess: (data) => {
      queryClient.setQueryData<DomainSettings>(DOMAIN_KEY, data);
    },
  });
}

/**
 * Triggers a DNS verification check. ADMIN only.
 * On success the cache is updated with the returned DomainSettings.
 */
export function useVerifyDomain() {
  const queryClient = useQueryClient();
  return useMutation<DomainSettings, Error, void>({
    mutationFn: () => apiClient.domain.verify(),
    onSuccess: (data) => {
      queryClient.setQueryData<DomainSettings>(DOMAIN_KEY, data);
    },
  });
}

/**
 * Removes the custom domain. ADMIN only.
 * On success the cache is updated with the returned (cleared) DomainSettings.
 */
export function useRemoveDomain() {
  const queryClient = useQueryClient();
  return useMutation<DomainSettings, Error, void>({
    mutationFn: () => apiClient.domain.remove(),
    onSuccess: (data) => {
      queryClient.setQueryData<DomainSettings>(DOMAIN_KEY, data);
    },
  });
}

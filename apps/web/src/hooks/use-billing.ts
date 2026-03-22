'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { BillingStatusResponse, UpdateBillingEmailDto } from '@/lib/api-types';

const BILLING_KEY = 'billing';

/**
 * useBilling
 *
 * Fetches the workspace billing snapshot from GET /billing/status.
 * Accessible to all authenticated workspace members (ADMIN, EDITOR, VIEWER).
 *
 * Returns:
 *   billing          — BillingStatusResponse or undefined while loading
 *   isLoading        — true on first fetch
 *   isError          — true if the fetch failed
 *   error            — the Error object
 *   refetch          — manual refetch trigger
 */
export const useBilling = () => {
  const {
    data: billing,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<BillingStatusResponse, Error>({
    queryKey: [BILLING_KEY, 'status'],
    queryFn: apiClient.billing.getStatus,
    staleTime: 60_000, // 1 min — billing state changes infrequently
    retry: 1,
  });

  return { billing, isLoading, isError, error, refetch };
};

/**
 * useUpdateBillingEmail
 *
 * Mutation to update the billing contact email. ADMIN only.
 * Invalidates the billing status cache on success.
 */
export const useUpdateBillingEmail = () => {
  const queryClient = useQueryClient();

  return useMutation<{ billingEmail: string | null }, Error, UpdateBillingEmailDto>({
    mutationFn: (data) => apiClient.billing.updateEmail(data),
    onSuccess: (data) => {
      // Patch the cached billing status with the new email
      queryClient.setQueryData<BillingStatusResponse>(
        [BILLING_KEY, 'status'],
        (prev) => (prev ? { ...prev, billingEmail: data.billingEmail } : prev),
      );
    },
  });
};

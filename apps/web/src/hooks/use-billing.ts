'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import {
  BillingStatusResponse,
  PlanConfig,
  RequestPlanChangeDto,
  RequestPlanChangeResponse,
  UpdateBillingEmailDto,
} from '@/lib/api-types';

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
 * usePlans
 *
 * Fetches all active plan config rows from GET /billing/plans.
 * Used by the billing page to render the feature comparison table
 * and upgrade CTAs. Accessible to all authenticated members.
 */
export const usePlans = () => {
  const {
    data: plans,
    isLoading,
    isError,
    error,
  } = useQuery<PlanConfig[], Error>({
    queryKey: [BILLING_KEY, 'plans'],
    queryFn: apiClient.billing.listPlans,
    staleTime: 5 * 60_000, // 5 min — plan config changes rarely
    retry: 1,
  });

  return { plans: plans ?? [], isLoading, isError, error };
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

/**
 * useRequestPlanChange
 *
 * Mutation to request a plan change. ADMIN only.
 * MVP: records the intent and returns a confirmation message.
 * Production: will redirect to a Stripe Checkout Session URL.
 */
export const useRequestPlanChange = () => {
  const queryClient = useQueryClient();

  return useMutation<RequestPlanChangeResponse, Error, RequestPlanChangeDto>({
    mutationFn: (data) => apiClient.billing.requestPlanChange(data),
    onSuccess: () => {
      // Refetch billing status in case the plan changed
      queryClient.invalidateQueries({ queryKey: [BILLING_KEY, 'status'] });
    },
  });
};

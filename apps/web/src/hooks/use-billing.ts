'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import {
  BillingStatusResponse,
  InvoiceRecord,
  PlanConfig,
  UpdateBillingEmailDto,
} from '@/lib/api-types';

const BILLING_KEY = 'billing';

/**
 * useBilling
 *
 * Fetches the workspace billing snapshot from GET /billing/status.
 * Accessible to all authenticated workspace members.
 */
export const useBilling = () => {
  const { data: billing, isLoading, isError, error, refetch } = useQuery<
    BillingStatusResponse,
    Error
  >({
    queryKey: [BILLING_KEY, 'status'],
    queryFn: apiClient.billing.getStatus,
    staleTime: 60_000,
  });
  return { billing, isLoading, isError, error, refetch };
};

/**
 * usePlans
 *
 * Fetches all active plan config rows from GET /billing/plans.
 */
export const usePlans = () => {
  const { data: plans, isLoading, isError, error } = useQuery<PlanConfig[], Error>({
    queryKey: [BILLING_KEY, 'plans'],
    queryFn: apiClient.billing.listPlans,
    staleTime: 5 * 60_000,
  });
  return { plans: plans ?? [], isLoading, isError, error };
};

/**
 * useInvoices
 *
 * Fetches cached invoices from GET /billing/invoices. ADMIN only.
 */
export const useInvoices = () => {
  const { data: invoices, isLoading, isError, error } = useQuery<InvoiceRecord[], Error>({
    queryKey: [BILLING_KEY, 'invoices'],
    queryFn: apiClient.billing.listInvoices,
    staleTime: 2 * 60_000,
  });
  return { invoices: invoices ?? [], isLoading, isError, error };
};

/**
 * useUpdateBillingEmail
 *
 * Mutation to update the billing contact email. ADMIN only.
 */
export const useUpdateBillingEmail = () => {
  const queryClient = useQueryClient();
  return useMutation<{ billingEmail: string | null }, Error, UpdateBillingEmailDto>({
    mutationFn: (data) => apiClient.billing.updateEmail(data),
    onSuccess: (data) => {
      queryClient.setQueryData<BillingStatusResponse>(
        [BILLING_KEY, 'status'],
        (prev) => (prev ? { ...prev, billingEmail: data.billingEmail } : prev),
      );
    },
  });
};

/**
 * useCreateCheckoutSession
 *
 * Mutation to create a Stripe Checkout Session for plan upgrade/downgrade.
 * On success, redirects the user to the Stripe-hosted checkout page.
 * ADMIN only.
 */
export const useCreateCheckoutSession = () => {
  return useMutation<
    { url: string; mode: string },
    Error,
    { targetPlan: string; successUrl: string; cancelUrl: string }
  >({
    mutationFn: (data) => apiClient.billing.createCheckoutSession(data),
    onSuccess: (data) => {
      // Redirect to Stripe Checkout
      window.location.href = data.url;
    },
  });
};

/**
 * useCreatePortalSession
 *
 * Mutation to create a Stripe Customer Portal session.
 * On success, redirects the user to the Stripe-hosted portal.
 * ADMIN only.
 */
export const useCreatePortalSession = () => {
  return useMutation<{ url: string }, Error, { returnUrl: string }>({
    mutationFn: (data) => apiClient.billing.createPortalSession(data),
    onSuccess: (data) => {
      // Redirect to Stripe Customer Portal
      window.location.href = data.url;
    },
  });
};

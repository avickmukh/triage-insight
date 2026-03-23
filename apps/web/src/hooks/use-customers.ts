import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';
import {
  CreateCustomerPayload,
  UpdateCustomerPayload,
  CustomerSegment,
  CustomerLifecycleStage,
  AccountPriority,
} from '@/lib/api-types';

// ─── Query Keys ───────────────────────────────────────────────────────────────
const CUSTOMER_KEYS = {
  all: (workspaceId: string) => ['customers', workspaceId] as const,
  list: (workspaceId: string, params?: object) => ['customers', workspaceId, 'list', params] as const,
  detail: (workspaceId: string, id: string) => ['customers', workspaceId, 'detail', id] as const,
  revenueSummary: (workspaceId: string) => ['customers', workspaceId, 'revenue-summary'] as const,
  analytics: (workspaceId: string) => ['customers', workspaceId, 'analytics'] as const,
  signals: (workspaceId: string, customerId: string) => ['customers', workspaceId, 'signals', customerId] as const,
};

// ─── Revenue Summary ──────────────────────────────────────────────────────────
export function useRevenueSummary(_orgSlug?: string) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  return useQuery({
    queryKey: CUSTOMER_KEYS.revenueSummary(workspaceId ?? ''),
    queryFn: () => apiClient.customers.getRevenueSummary(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 2 * 60 * 1000,
  });
}

// ─── Customer List ────────────────────────────────────────────────────────────
export function useCustomerList(
  _orgSlug: string,
  params?: {
    search?: string;
    segment?: CustomerSegment;
    accountPriority?: AccountPriority;
    lifecycleStage?: CustomerLifecycleStage;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  },
) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  return useQuery({
    queryKey: CUSTOMER_KEYS.list(workspaceId ?? '', params),
    queryFn: () => apiClient.customers.list(workspaceId!, params),
    enabled: !!workspaceId,
    staleTime: 60 * 1000,
  });
}

// ─── Customer Detail ──────────────────────────────────────────────────────────
export function useCustomerDetail(_orgSlug: string, customerId: string) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  return useQuery({
    queryKey: CUSTOMER_KEYS.detail(workspaceId ?? '', customerId),
    queryFn: () => apiClient.customers.getById(workspaceId!, customerId),
    enabled: !!workspaceId && !!customerId,
    staleTime: 60 * 1000,
  });
}

// ─── Customer Analytics ───────────────────────────────────────────────────────
export function useCustomerAnalytics() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  return useQuery({
    queryKey: CUSTOMER_KEYS.analytics(workspaceId ?? ''),
    queryFn: () => apiClient.customers.getAnalytics(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 2 * 60 * 1000,
  });
}

// ─── Customer Signals ─────────────────────────────────────────────────────────
export function useCustomerSignals(customerId: string) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  return useQuery({
    queryKey: CUSTOMER_KEYS.signals(workspaceId ?? '', customerId),
    queryFn: () => apiClient.customers.getSignals(workspaceId!, customerId),
    enabled: !!workspaceId && !!customerId,
    staleTime: 60 * 1000,
  });
}

// ─── Create Customer ──────────────────────────────────────────────────────────
export function useCreateCustomer() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCustomerPayload) =>
      apiClient.customers.create(workspaceId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers', workspaceId] });
    },
  });
}

// ─── Update Customer ──────────────────────────────────────────────────────────
export function useUpdateCustomer(_orgSlug: string, customerId: string) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateCustomerPayload) =>
      apiClient.customers.update(workspaceId!, customerId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CUSTOMER_KEYS.detail(workspaceId ?? '', customerId) });
      qc.invalidateQueries({ queryKey: ['customers', workspaceId] });
    },
  });
}

// ─── Delete Customer ──────────────────────────────────────────────────────────
export function useDeleteCustomer(_orgSlug?: string) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (customerId: string) =>
      apiClient.customers.remove(workspaceId!, customerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers', workspaceId] });
    },
  });
}

// ─── Rescore Customer ─────────────────────────────────────────────────────────
export function useRescoreCustomer() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (customerId: string) =>
      apiClient.customers.rescore(workspaceId!, customerId),
    onSuccess: (_data, customerId) => {
      qc.invalidateQueries({ queryKey: CUSTOMER_KEYS.detail(workspaceId ?? '', customerId) });
      qc.invalidateQueries({ queryKey: CUSTOMER_KEYS.signals(workspaceId ?? '', customerId) });
    },
  });
}

// ─── Rescore All Customers ────────────────────────────────────────────────────
export function useRescoreAllCustomers() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.customers.rescoreAll(workspaceId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers', workspaceId] });
    },
  });
}

// ─── Deal hooks ───────────────────────────────────────────────────────────────
export function useDealList(
  _orgSlug?: string,
  params?: {
    search?: string;
    stage?: string;
    status?: string;
    customerId?: string;
    page?: number;
    limit?: number;
  },
) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  return useQuery({
    queryKey: ['deals', workspaceId, params],
    queryFn: () => apiClient.deals.list(workspaceId!, params),
    enabled: !!workspaceId,
    staleTime: 60 * 1000,
  });
}

export function useCreateDeal() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: import('@/lib/api-types').CreateDealPayload) =>
      apiClient.deals.create(workspaceId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals', workspaceId] });
      qc.invalidateQueries({ queryKey: ['customers', workspaceId] });
    },
  });
}

export function useThemeRevenueIntelligence(themeId: string) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  return useQuery({
    queryKey: ['theme-revenue', workspaceId, themeId],
    queryFn: () => apiClient.themeRevenue.getByTheme(workspaceId!, themeId),
    enabled: !!workspaceId && !!themeId,
    staleTime: 2 * 60 * 1000,
  });
}

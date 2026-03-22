'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';
import {
  ConnectIntercomDto,
  ConnectSlackDto,
  ConnectZendeskDto,
  IntegrationProvider,
  IntegrationStatus,
} from '@/lib/api-types';

const INTEGRATIONS_KEY = 'integrations';

/**
 * useIntegrations
 *
 * Fetches the full integration status list for the current workspace.
 * Every known provider is always present in the returned array regardless
 * of whether it is connected.
 *
 * Requires the workspace to be resolved first (uses useWorkspace internally).
 */
export const useIntegrations = () => {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  const {
    data: integrations,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<IntegrationStatus[], Error>({
    queryKey: [INTEGRATIONS_KEY, workspaceId],
    queryFn: () => {
      if (!workspaceId) throw new Error('Workspace ID not available');
      return apiClient.integrations.list(workspaceId);
    },
    enabled: !!workspaceId,
    staleTime: 30_000, // 30 s — connection state changes infrequently
  });

  return { integrations: integrations ?? [], isLoading, isError, error, refetch };
};

/**
 * useConnectSlack
 *
 * Mutation to connect (or re-connect) the Slack integration.
 * Invalidates the integrations list on success.
 */
export const useConnectSlack = () => {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();

  return useMutation<IntegrationStatus, Error, ConnectSlackDto>({
    mutationFn: (data) => {
      if (!workspace?.id) throw new Error('Workspace ID not available');
      return apiClient.integrations.connectSlack(workspace.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [INTEGRATIONS_KEY, workspace?.id] });
    },
  });
};

/**
 * useConnectZendesk
 *
 * Mutation to connect (or re-connect) the Zendesk integration.
 */
export const useConnectZendesk = () => {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();

  return useMutation<IntegrationStatus, Error, ConnectZendeskDto>({
    mutationFn: (data) => {
      if (!workspace?.id) throw new Error('Workspace ID not available');
      return apiClient.integrations.connectZendesk(workspace.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [INTEGRATIONS_KEY, workspace?.id] });
    },
  });
};

/**
 * useConnectIntercom
 *
 * Mutation to connect (or re-connect) the Intercom integration.
 */
export const useConnectIntercom = () => {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();

  return useMutation<IntegrationStatus, Error, ConnectIntercomDto>({
    mutationFn: (data) => {
      if (!workspace?.id) throw new Error('Workspace ID not available');
      return apiClient.integrations.connectIntercom(workspace.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [INTEGRATIONS_KEY, workspace?.id] });
    },
  });
};

/**
 * useDisconnectIntegration
 *
 * Mutation to disconnect any provider.
 * Optimistically removes the connection from the cached list.
 */
export const useDisconnectIntegration = () => {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();

  return useMutation<void, Error, IntegrationProvider>({
    mutationFn: (provider) => {
      if (!workspace?.id) throw new Error('Workspace ID not available');
      return apiClient.integrations.disconnect(workspace.id, provider);
    },
    onSuccess: (_data, provider) => {
      // Optimistically mark the provider as disconnected in the cache
      queryClient.setQueryData<IntegrationStatus[]>(
        [INTEGRATIONS_KEY, workspace?.id],
        (prev) =>
          prev?.map((s) =>
            s.provider === provider
              ? { ...s, connected: false, lastSyncedAt: null, metadata: null, createdAt: null }
              : s,
          ) ?? [],
      );
    },
  });
};

/**
 * useSyncIntegrations
 *
 * Mutation to trigger a background sync for all connected integrations.
 */
export const useSyncIntegrations = () => {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();

  return useMutation<{ message: string }, Error, void>({
    mutationFn: () => {
      if (!workspace?.id) throw new Error('Workspace ID not available');
      return apiClient.integrations.sync(workspace.id);
    },
    onSuccess: () => {
      // Refresh the list after sync so lastSyncedAt updates
      queryClient.invalidateQueries({ queryKey: [INTEGRATIONS_KEY, workspace?.id] });
    },
  });
};

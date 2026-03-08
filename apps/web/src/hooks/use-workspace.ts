import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { UpdateWorkspaceDto, Workspace, WorkspaceMember } from '@/lib/api-types';

const WORKSPACE_QUERY_KEY = 'workspace';

export const useWorkspace = () => {
  const queryClient = useQueryClient();

  const { data: workspace, isLoading, isError, error } = useQuery<Workspace, Error>({
    queryKey: [WORKSPACE_QUERY_KEY, 'current'],
    queryFn: apiClient.getCurrentWorkspace,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const { mutate: updateWorkspace, isPending: isUpdating } = useMutation<Workspace, Error, UpdateWorkspaceDto>({
    mutationFn: (data) => apiClient.updateCurrentWorkspace(data),
    onSuccess: (updatedWorkspace) => {
      queryClient.setQueryData([WORKSPACE_QUERY_KEY, 'current'], updatedWorkspace);
    },
  });

  const { data: members, isLoading: isLoadingMembers } = useQuery<WorkspaceMember[], Error>({
    queryKey: [WORKSPACE_QUERY_KEY, workspace?.id, 'members'],
    queryFn: () => {
      if (!workspace?.id) throw new Error('Workspace ID is not available');
      return apiClient.getWorkspaceMembers(workspace.id);
    },
    enabled: !!workspace?.id, // Only run this query if workspace.id is available
  });

  return {
    workspace,
    isLoading,
    isError,
    error,
    updateWorkspace,
    isUpdating,
    members,
    isLoadingMembers,
  };
};

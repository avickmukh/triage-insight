import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import { UpdateWorkspaceDto, Workspace, WorkspaceMember } from "@/lib/api-types";

const WORKSPACE_QUERY_KEY = "workspace";

export const useWorkspace = () => {
  const queryClient = useQueryClient();

  const { data: workspace, isLoading, isError, error } = useQuery<Workspace, Error>({
    queryKey: [WORKSPACE_QUERY_KEY, "current"],
    queryFn: apiClient.workspace.getCurrent,
  });

  const { mutate: updateWorkspace, isPending: isUpdating } = useMutation<
    Workspace,
    Error,
    UpdateWorkspaceDto
  >({
    mutationFn: (data) => apiClient.workspace.updateCurrent(data),
    onSuccess: (updatedWorkspace) => {
      queryClient.setQueryData([WORKSPACE_QUERY_KEY, "current"], updatedWorkspace);
    },
  });

  const useWorkspaceMembers = () => {
    const workspaceId = workspace?.id;
    return useQuery<WorkspaceMember[], Error>({
      queryKey: [WORKSPACE_QUERY_KEY, workspaceId, "members"],
      queryFn: () => {
        if (!workspaceId) throw new Error("Workspace ID is not available");
        return apiClient.workspace.getMembers(workspaceId);
      },
      enabled: !!workspaceId,
    });
  };

  return {
    workspace,
    isLoading,
    isError,
    error,
    updateWorkspace,
    isUpdating,
    useWorkspaceMembers,
  };
};

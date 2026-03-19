import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import { UpdateWorkspaceDto, Workspace, WorkspaceMember, WorkspaceRole } from "@/lib/api-types";

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

/**
 * Resolves the WorkspaceRole of the currently authenticated user.
 *
 * Strategy (no backend changes required):
 *   1. Fetch GET /workspace/current  → get workspaceId
 *   2. Fetch GET /auth/me            → get the calling user's id
 *   3. Fetch GET /workspace/:id/members → filter by userId to get role
 *
 * Returns:
 *   role       – the resolved WorkspaceRole, or undefined while loading
 *   isLoading  – true while any of the three queries are in-flight
 *   isError    – true if any query failed
 */
export const useCurrentMemberRole = () => {
  // 1. Workspace (provides workspaceId)
  const { data: workspace, isLoading: wsLoading, isError: wsError } = useQuery<Workspace, Error>({
    queryKey: [WORKSPACE_QUERY_KEY, "current"],
    queryFn: apiClient.workspace.getCurrent,
    staleTime: 1000 * 60 * 5,
  });

  // 2. Current user (provides userId)
  const { data: me, isLoading: meLoading, isError: meError } = useQuery({
    queryKey: ["user", "me"],
    queryFn: apiClient.auth.getMe,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  // 3. Members list – only enabled once we have both ids
  const {
    data: members,
    isLoading: membersLoading,
    isError: membersError,
  } = useQuery<WorkspaceMember[], Error>({
    queryKey: [WORKSPACE_QUERY_KEY, workspace?.id, "members"],
    queryFn: () => {
      if (!workspace?.id) throw new Error("Workspace ID not available");
      return apiClient.workspace.getMembers(workspace.id);
    },
    enabled: !!workspace?.id && !!me?.id,
    staleTime: 1000 * 60 * 5,
  });

  // Match the calling user in the member list
  const role: WorkspaceRole | undefined = members?.find(
    (m) => m.userId === me?.id
  )?.role;

  return {
    role,
    isLoading: wsLoading || meLoading || membersLoading,
    isError: wsError || meError || membersError,
  };
};

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import { LoginRequest, PlatformRole, SignUpDto, User, WorkspaceRole } from "@/lib/api-types";
import { useWorkspace } from "@/hooks/use-workspace";
import { useRouter } from "next/router";

const USER_QUERY_KEY = "user";

export const useAuth = () => {
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: user, isLoading, isError } = useQuery<User, Error>({
    queryKey: [USER_QUERY_KEY, "me"],
    queryFn: apiClient.auth.getMe,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1, // Don't retry endlessly if unauthenticated
  });

  const { mutate: signUp } = useMutation({
    mutationFn: (data: SignUpDto) => apiClient.auth.signUp(data),
    onSuccess: (data) => {
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      queryClient.invalidateQueries({ queryKey: [USER_QUERY_KEY] });
      router.push("/");
    },
  });

  const { mutate: login } = useMutation({
    mutationFn: (data: LoginRequest) => apiClient.auth.login(data),
    onSuccess: (data) => {
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      queryClient.invalidateQueries({ queryKey: [USER_QUERY_KEY] });
      router.push("/");
    },
  });

  const logout = () => {
    apiClient.auth.logout();
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    queryClient.setQueryData([USER_QUERY_KEY, "me"], null);
    router.push("/login");
  };

  return { user, isLoading, isError, signUp, login, logout };
};

export const usePermissions = () => {
  const { user } = useAuth();
  const { workspace, useWorkspaceMembers } = useWorkspace();
  const { data: members } = useWorkspaceMembers();

  if (!user || !workspace || !members) {
    return {
      isSuperAdmin: false,
      isWorkspaceAdmin: false,
      isWorkspaceEditor: false,
      isWorkspaceViewer: false,
    };
  }

  const isSuperAdmin = user.platformRole === PlatformRole.SUPER_ADMIN;

  const currentUserMembership = members.find((m) => m.userId === user.id);
  const workspaceRole = currentUserMembership?.role;

  return {
    isSuperAdmin,
    isWorkspaceAdmin: workspaceRole === WorkspaceRole.ADMIN || isSuperAdmin,
    isWorkspaceEditor: workspaceRole === WorkspaceRole.EDITOR,
    isWorkspaceViewer: workspaceRole === WorkspaceRole.VIEWER,
  };
};

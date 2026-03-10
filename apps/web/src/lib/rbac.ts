import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { PlatformRole, WorkspaceRole } from "@/lib/api-types";

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

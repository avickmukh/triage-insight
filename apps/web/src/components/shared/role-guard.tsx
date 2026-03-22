"use client";

/**
 * <RoleGuard allowedRoles={["ADMIN"]}>
 *   <AdminOnlyButton />
 * </RoleGuard>
 *
 * Renders children only when the current workspace member's role is in
 * `allowedRoles`. Renders `fallback` (default: null) otherwise.
 *
 * Uses the `useCurrentMemberRole` hook from use-workspace.ts which resolves
 * the role from the existing React Query cache with zero extra network calls
 * when the workspace and member list are already loaded.
 */

import { ReactNode } from "react";
import { WorkspaceRole } from "@/lib/api-types";
import { useCurrentMemberRole } from "@/hooks/use-workspace";

interface RoleGuardProps {
  allowedRoles: WorkspaceRole[];
  children: ReactNode;
  /** Rendered when role is not in allowedRoles. Defaults to null. */
  fallback?: ReactNode;
}

export function RoleGuard({ allowedRoles, children, fallback = null }: RoleGuardProps) {
  const { role, isLoading } = useCurrentMemberRole();

  // While resolving, render nothing to avoid flicker
  if (isLoading || !role) return null;

  if (!allowedRoles.includes(role)) return <>{fallback}</>;

  return <>{children}</>;
}

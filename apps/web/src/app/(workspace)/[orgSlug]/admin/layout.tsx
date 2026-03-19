'use client';

/**
 * /:orgSlug/admin/* — Org-admin role guard
 *
 * Only users with WorkspaceRole.ADMIN may access these pages.
 * EDITOR and VIEWER are redirected to /:orgSlug/app (the staff dashboard).
 * Unauthenticated users are redirected to /:orgSlug/login.
 *
 * The middleware already blocks unauthenticated requests at the edge, but
 * this layout adds the role check that middleware cannot perform (it has no
 * access to the API response body).
 */

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCurrentMemberRole } from "@/hooks/use-workspace";
import { WorkspaceRole } from "@/lib/api-types";
import { appRoutes, workspaceAuthRoutes } from "@/lib/routes";
import { LoadingSpinner } from "@/components/shared/common/loading-spinner";

export default function OrgAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const router = useRouter();
  const slug =
    (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? "";

  const { role, isLoading, isError } = useCurrentMemberRole();

  useEffect(() => {
    if (isLoading) return; // wait for resolution

    if (isError) {
      // Could not determine role — treat as unauthenticated
      router.replace(workspaceAuthRoutes(slug).login);
      return;
    }

    if (role === undefined) {
      // No membership found for this user in this workspace
      router.replace(workspaceAuthRoutes(slug).login);
      return;
    }

    if (role !== WorkspaceRole.ADMIN) {
      // Authenticated but insufficient role — send to staff dashboard
      router.replace(appRoutes(slug).dashboard);
    }
  }, [role, isLoading, isError, router, slug]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner className="h-8 w-8" />
      </div>
    );
  }

  // ── Access denied (non-admin) ──────────────────────────────────────────────
  // Render nothing while the redirect is in-flight to avoid a flash of content
  if (isError || role !== WorkspaceRole.ADMIN) {
    return null;
  }

  // ── Authorised ────────────────────────────────────────────────────────────
  return <>{children}</>;
}

'use client';
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { TrialBanner } from "./trial-banner";
import { useCurrentMemberRole } from "@/hooks/use-workspace";
import { WorkspaceRole } from "@/lib/api-types";

export function AppShell({ children, orgSlug }: { children: React.ReactNode; orgSlug?: string }) {
  const { role } = useCurrentMemberRole();
  const isAdmin = role === WorkspaceRole.ADMIN;

  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
      <Sidebar orgSlug={orgSlug} />
      <div className="flex flex-col sm:gap-4 sm:py-4 sm:pl-56">
        <Topbar orgSlug={orgSlug} />
        {orgSlug && <TrialBanner orgSlug={orgSlug} isAdmin={isAdmin} />}
        <main className="grid flex-1 items-start gap-4 p-4 sm:px-6 sm:py-0 md:gap-8">
          {children}
        </main>
      </div>
    </div>
  );
}

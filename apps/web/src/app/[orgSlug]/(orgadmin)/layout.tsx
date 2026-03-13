'use client';
import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useWorkspace } from '@/hooks/use-workspace';
import { useRouter } from 'next/navigation';
import { WorkspaceStatus } from '@/lib/api-types';
import { AppShell } from '@/components/shared/shell/app-shell';
import { LoadingSpinner } from '@/components/shared/common/loading-spinner';

export default function OrgAdminLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const orgSlug = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';
  const { workspace, isLoading, isError } = useWorkspace();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isError && workspace && workspace.status !== WorkspaceStatus.ACTIVE) {
      router.push('/activation');
    }
  }, [workspace, isLoading, isError, router]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen"><LoadingSpinner /></div>;
  }
  if (isError || !workspace) {
    return <div className="flex items-center justify-center h-screen">Error loading workspace.</div>;
  }
  if (workspace.status !== WorkspaceStatus.ACTIVE) {
    return <div className="flex items-center justify-center h-screen"><LoadingSpinner /></div>;
  }

  return <AppShell orgSlug={orgSlug}>{children}</AppShell>;
}

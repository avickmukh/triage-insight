
'use client';

import { useEffect } from 'react';
import { useWorkspace } from '@/hooks/use-workspace';
import { useRouter } from 'next/navigation';
import { WorkspaceStatus } from '@/lib/api-types';
import { AppShell } from '@/components/shared/shell/app-shell';
import { LoadingSpinner } from '@/components/shared/common/loading-spinner';

export default function AppLayout({ children }: { children: React.ReactNode }) {
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
    // This could be a redirect to an error page or a more robust error component
    return <div className="flex items-center justify-center h-screen">Error loading workspace.</div>;
  }

  if (workspace.status !== WorkspaceStatus.ACTIVE) {
    // Render a loading state or null while redirecting
    return <div className="flex items-center justify-center h-screen"><LoadingSpinner /></div>;
  }

  return <AppShell>{children}</AppShell>;
}

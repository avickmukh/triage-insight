'use client';
import { useWorkspace } from '@/hooks/use-workspace';
import { WorkspaceStatus } from '@/lib/api-types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shared/ui/card";
import { Button } from '@/components/shared/ui/button';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LoadingSpinner } from '@/components/shared/common/loading-spinner';
import { appRoutes } from '@/lib/routes';

export default function ActivationPage() {
  const { workspace, isLoading, isError } = useWorkspace();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && workspace?.status === WorkspaceStatus.ACTIVE && workspace?.slug) {
      router.push(appRoutes(workspace.slug).dashboard);
    }
  }, [workspace, isLoading, router]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen"><LoadingSpinner /></div>;
  }
  if (isError || !workspace) {
    return <div className="flex items-center justify-center h-screen">Error loading workspace information.</div>;
  }

  const getStatusMessage = () => {
    switch (workspace.status) {
      case WorkspaceStatus.PENDING:
        return 'Your workspace is pending activation. Please check your email for a verification link.';
      case WorkspaceStatus.SUSPENDED:
        return 'Your workspace has been suspended. Please contact support for assistance.';
      case WorkspaceStatus.DISABLED:
        return 'Your workspace has been disabled. Please contact support for assistance.';
      default:
        return 'Your workspace is not currently active.';
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <Card className="mx-auto max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-2xl">Workspace Activation</CardTitle>
          <CardDescription>{getStatusMessage()}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-4">
            If you believe this is an error, please reach out to our support team.
          </p>
          <Button onClick={() => window.location.href = 'mailto:support@triageinsight.com'}>
            Contact Support
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

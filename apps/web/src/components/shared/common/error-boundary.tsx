'use client';

import React from 'react';
import { Button } from '@/components/shared/ui/button';

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<{
  children: React.ReactNode;
  fallback: React.ReactNode;
}, ErrorBoundaryState> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

export function DefaultErrorBoundaryFallback() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <h2 className="text-2xl font-bold text-destructive">Something went wrong.</h2>
      <p className="text-muted-foreground mt-2">We've been notified and are looking into it.</p>
      <Button onClick={() => window.location.reload()} className="mt-4">Reload Page</Button>
    </div>
  );
}

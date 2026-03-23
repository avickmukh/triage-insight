'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { PlatformRole } from '@/lib/api-types';
import { LoadingSpinner } from '@/components/shared/common/loading-spinner';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Building2, CreditCard, Tag, ToggleLeft, Activity, ScrollText, Shield, ChevronRight } from 'lucide-react';

const NAV = [
  { label: 'Dashboard',      href: '/admin',           icon: LayoutDashboard },
  { label: 'Workspaces',     href: '/admin/workspaces',icon: Building2 },
  { label: 'Billing Health', href: '/admin/billing',   icon: CreditCard },
  { label: 'Pricing Config', href: '/admin/pricing',   icon: Tag },
  { label: 'Feature Flags',  href: '/admin/flags',     icon: ToggleLeft },
  { label: 'System Health',  href: '/admin/health',    icon: Activity },
  { label: 'Audit Log',      href: '/admin/audit-log', icon: ScrollText },
];

export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: me, isLoading, isError } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiClient.auth.getMe(),
    retry: 1,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (isLoading) return;
    if (isError || !me) { router.replace('/login'); return; }
    const role = (me as any).platformRole;
    if (role !== PlatformRole.SUPER_ADMIN && role !== PlatformRole.ADMIN) router.replace('/login');
  }, [me, isLoading, isError, router]);

  if (isLoading) return (
    <div className="flex h-screen items-center justify-center bg-gray-950">
      <LoadingSpinner className="h-8 w-8 text-white" />
    </div>
  );

  const role = (me as any)?.platformRole;
  if (!me || (role !== PlatformRole.SUPER_ADMIN && role !== PlatformRole.ADMIN)) return null;

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <aside className="w-60 flex-shrink-0 border-r border-gray-800 flex flex-col">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-800">
          <Shield className="h-5 w-5 text-violet-400" />
          <span className="font-semibold text-sm text-white">Platform Admin</span>
        </div>
        <nav className="flex-1 py-4 space-y-0.5 px-2 overflow-y-auto">
          {NAV.map(({ label, href, icon: Icon }) => {
            const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                active ? 'bg-violet-600/20 text-violet-300 font-medium' : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800',
              )}>
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
                {active && <ChevronRight className="h-3 w-3 ml-auto" />}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-3 border-t border-gray-800 text-xs text-gray-500">
          <p className="font-medium text-gray-400">{(me as any)?.name ?? 'Admin'}</p>
          <p className="truncate">{(me as any)?.email}</p>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

'use client';
import { useEffect } from 'react';
import { usePathname, useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useWorkspace, useCurrentMemberRole } from '@/hooks/use-workspace';
import { useAuth } from '@/lib/auth';
import { WorkspaceStatus, WorkspaceRole } from '@/lib/api-types';
import { appRoutes, orgAdminRoutes } from '@/lib/routes';

/**
 * /:orgSlug/* — Root workspace layout
 *
 * Renders the workspace top-nav for all authenticated workspace pages.
 *
 * Auth pages (login, signup, etc.) are nested under /:orgSlug/(auth)/ which
 * has its own layout — so this header is only shown for authenticated app and
 * admin pages.
 *
 * Portal pages (/:orgSlug/portal/*) have their own layout under the /portal
 * segment and must NOT trigger any authenticated API calls here.
 *
 * Role-aware nav:
 *   ADMIN  → Inbox · Themes · Roadmap · Dashboard | Members · Billing · Settings · Logout
 *   EDITOR/VIEWER → Inbox · Themes · Roadmap · Dashboard | Profile · Logout
 */
export default function OrgSlugLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useParams();
  const slug =
    (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';

  // ── Auth route detection ─────────────────────────────────────────────────
  const isAuthRoute =
    pathname.endsWith('/login') ||
    pathname.endsWith('/signup') ||
    pathname.includes('/reset-password') ||
    pathname.includes('/verify');

  // ── Portal route detection ───────────────────────────────────────────────
  // Portal pages live under /:orgSlug/portal/* (e.g. /avickteam/portal/feedback)
  // The old public routes were /:orgSlug/feedback and /:orgSlug/roadmap (no /portal prefix).
  // Match both patterns so neither triggers authenticated API calls.
  const isPortalRoute =
    pathname.includes('/portal/') ||
    // Legacy public portal routes: exactly /:slug/feedback* or /:slug/roadmap (no /app/ segment)
    (pathname.includes('/feedback') && !pathname.includes('/app/')) ||
    (pathname === `/${slug}/roadmap`);

  // ── Suppress header + auth hooks for portal / auth routes ───────────────
  // IMPORTANT: hooks that call authenticated APIs (useWorkspace, useCurrentMemberRole)
  // must NOT run on portal pages. We achieve this by rendering a separate
  // AuthenticatedShell component only for non-portal, non-auth routes.
  if (isAuthRoute || isPortalRoute) {
    return <>{children}</>;
  }

  return <AuthenticatedShell slug={slug} pathname={pathname}>{children}</AuthenticatedShell>;
}

/**
 * Inner shell rendered only for authenticated staff pages.
 * All authenticated API hooks live here so they never fire on portal pages.
 */
function AuthenticatedShell({
  slug,
  pathname,
  children,
}: {
  slug: string;
  pathname: string;
  children: React.ReactNode;
}) {
  const { workspace, isLoading: wsLoading } = useWorkspace();
  const { role, isLoading: roleLoading } = useCurrentMemberRole();
  const { logout } = useAuth();
  const router = useRouter();

  const r = appRoutes(slug);
  const ra = orgAdminRoutes(slug);

  // ── Workspace status redirect ────────────────────────────────────────────
  useEffect(() => {
    if (!wsLoading && workspace && workspace.status !== WorkspaceStatus.ACTIVE) {
      router.push('/activation');
    }
  }, [workspace, wsLoading, router]);

  // ── Loading state ────────────────────────────────────────────────────────
  if (wsLoading || roleLoading) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif",
          color: '#6C757D',
        }}
      >
        Loading…
      </div>
    );
  }

  const isAdmin = role === WorkspaceRole.ADMIN;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F8F9FA',
        fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif",
        color: '#0A2540',
      }}
    >
      {/* ── Top Navigation ──────────────────────────────────────────────── */}
      <header
        style={{
          background: '#0A2540',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '0 1.5rem',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Logo */}
          <Link
            href={r.dashboard}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              textDecoration: 'none',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                background: 'linear-gradient(135deg, #20A4A4 0%, #1a8f8f 100%)',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 4h10M3 8h7M3 12h5"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <span
              style={{
                color: '#fff',
                fontWeight: 700,
                fontSize: '1rem',
                letterSpacing: '-0.01em',
              }}
            >
              Triage<span style={{ color: '#20A4A4' }}>Insight</span>
            </span>
          </Link>

          {/* ── Navigation links ──────────────────────────────────────── */}
          <nav
            style={{
              display: 'flex',
              gap: '0.25rem',
              alignItems: 'center',
            }}
          >
            {/* App nav (all roles) */}
            <NavLink href={r.inbox} pathname={pathname}>Inbox</NavLink>
            <NavLink href={r.themes} pathname={pathname}>Themes</NavLink>
            <NavLink href={r.roadmap} pathname={pathname}>Roadmap</NavLink>
            <NavLink href={r.customers} pathname={pathname}>Customers</NavLink>
            <NavLink href={r.dashboard} pathname={pathname}>Dashboard</NavLink>

            {/* Admin-only separator + links */}
            {isAdmin && (
              <>
                <Divider />
                <NavLink href={ra.members} pathname={pathname}>Members</NavLink>
                <NavLink href={ra.billing} pathname={pathname}>Billing</NavLink>
                <NavLink href={ra.settings} pathname={pathname}>Settings</NavLink>
              </>
            )}

            {/* Non-admin: profile link */}
            {!isAdmin && role !== undefined && (
              <>
                <Divider />
                <NavLink href={r.profile} pathname={pathname}>Profile</NavLink>
              </>
            )}

            {/* Logout */}
            <button
              onClick={logout}
              style={{
                background: '#20A4A4',
                border: 'none',
                color: '#fff',
                padding: '6px 14px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
                marginLeft: '0.75rem',
              }}
            >
              Logout
            </button>
          </nav>
        </div>
      </header>

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <main
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '2rem 1.5rem',
        }}
      >
        {children}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: '1px solid #e9ecef',
          padding: '1.25rem 1.5rem',
          textAlign: 'center',
          color: '#adb5bd',
          fontSize: '0.78rem',
          background: '#fff',
          marginTop: '2rem',
        }}
      >
        <span>
          Powered by{' '}
          <a href="/" style={{ color: '#20A4A4', fontWeight: 600, textDecoration: 'none' }}>
            TriageInsight
          </a>
          {' '}· {new Date().getFullYear()}
        </span>
      </footer>
    </div>
  );
}

/** Active-aware nav link */
function NavLink({
  href,
  pathname,
  children,
}: {
  href: string;
  pathname: string;
  children: React.ReactNode;
}) {
  const isActive = pathname === href || pathname.startsWith(href + '/');
  return (
    <Link
      href={href}
      style={{
        color: isActive ? '#fff' : 'rgba(255,255,255,0.65)',
        textDecoration: 'none',
        fontSize: '0.875rem',
        fontWeight: isActive ? 600 : 500,
        padding: '6px 10px',
        borderRadius: 6,
        background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
      }}
    >
      {children}
    </Link>
  );
}

/** Visual separator between nav groups */
function Divider() {
  return (
    <div
      style={{
        width: 1,
        height: 20,
        background: 'rgba(255,255,255,0.15)',
        margin: '0 0.5rem',
      }}
    />
  );
}

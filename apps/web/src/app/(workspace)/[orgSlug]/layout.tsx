'use client';
/**
 * /:orgSlug/* — Root workspace layout
 *
 * Enterprise sidebar layout. Replaces the overcrowded top-nav bar with a
 * collapsible left sidebar that groups navigation by domain, plus a slim
 * top bar for workspace context and user actions.
 *
 * Auth pages (/:orgSlug/(auth)/) and portal pages (/:orgSlug/portal/*) bypass
 * this layout entirely — they have their own layouts.
 *
 * Design tokens preserved from existing system:
 *   Navy  #0A2540  |  Teal  #20A4A4  |  BG  #F8F9FA  |  Border  #e9ecef
 */
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useWorkspace, useCurrentMemberRole } from '@/hooks/use-workspace';
import { useAuth } from '@/lib/auth';
import { WorkspaceStatus, WorkspaceRole } from '@/lib/api-types';
import { appRoutes, orgAdminRoutes } from '@/lib/routes';

// ─── Design tokens ────────────────────────────────────────────────────────────
const NAVY     = '#0A2540';
const TEAL     = '#20A4A4';
const SIDEBAR_W = 220;

// ─── Root layout ─────────────────────────────────────────────────────────────
export default function OrgSlugLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useParams();
  const slug = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';

  const isAuthRoute =
    pathname.endsWith('/login') ||
    pathname.endsWith('/signup') ||
    pathname.includes('/reset-password') ||
    pathname.includes('/verify');

  const isPortalRoute =
    pathname.includes('/portal/') ||
    (pathname.includes('/feedback') && !pathname.includes('/app/')) ||
    pathname === `/${slug}/roadmap`;

  if (isAuthRoute || isPortalRoute) {
    return <>{children}</>;
  }

  return <AuthenticatedShell slug={slug} pathname={pathname}>{children}</AuthenticatedShell>;
}

// ─── Authenticated shell ──────────────────────────────────────────────────────
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
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const r  = appRoutes(slug);
  const ra = orgAdminRoutes(slug);

  useEffect(() => {
    if (!wsLoading && workspace && workspace.status !== WorkspaceStatus.ACTIVE) {
      router.push('/activation');
    }
  }, [workspace, wsLoading, router]);

  if (wsLoading || roleLoading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif",
        background: '#F8F9FA',
        color: '#6C757D',
        fontSize: '0.875rem',
        gap: '0.6rem',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
        Loading workspace…
      </div>
    );
  }

  const isAdmin = role === WorkspaceRole.ADMIN;
  const sidebarW = sidebarOpen ? SIDEBAR_W : 56;

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif",
      background: '#F8F9FA',
      color: NAVY,
    }}>
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside style={{
        width: sidebarW,
        minHeight: '100vh',
        background: NAVY,
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 200,
        transition: 'width 0.2s ease',
        overflow: 'hidden',
      }}>
        {/* Logo + collapse toggle */}
        <div style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: sidebarOpen ? '0 1rem' : '0 0.75rem',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}>
          {sidebarOpen && (
            <Link href={r.dashboard} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
              <div style={{
                width: 26, height: 26,
                background: `linear-gradient(135deg, ${TEAL} 0%, #1a8f8f 100%)`,
                borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M3 4h10M3 8h7M3 12h5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
                Triage<span style={{ color: TEAL }}>Insight</span>
              </span>
            </Link>
          )}
          {!sidebarOpen && (
            <Link href={r.dashboard} style={{ textDecoration: 'none' }}>
              <div style={{
                width: 26, height: 26,
                background: `linear-gradient(135deg, ${TEAL} 0%, #1a8f8f 100%)`,
                borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M3 4h10M3 8h7M3 12h5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
            </Link>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.5)', padding: '4px', borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {sidebarOpen
                ? <path d="M15 18l-6-6 6-6"/>
                : <path d="M9 18l6-6-6-6"/>
              }
            </svg>
          </button>
        </div>

        {/* Nav groups */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0.75rem 0', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Product Intelligence group */}
          <NavGroup label="Product" open={sidebarOpen}>
            <SideNavItem href={r.dashboard}  pathname={pathname} open={sidebarOpen} icon={<IconGrid/>}>Dashboard</SideNavItem>
            <SideNavItem href={r.inbox}      pathname={pathname} open={sidebarOpen} icon={<IconInbox/>}>Inbox</SideNavItem>
            <SideNavItem href={r.themes}     pathname={pathname} open={sidebarOpen} icon={<IconTheme/>}>Themes</SideNavItem>
            <SideNavItem href={r.roadmap}    pathname={pathname} open={sidebarOpen} icon={<IconRoadmap/>}>Roadmap</SideNavItem>
          </NavGroup>

          {/* Customer & Revenue group */}
          <NavGroup label="Revenue" open={sidebarOpen}>
            <SideNavItem href={r.customers}  pathname={pathname} open={sidebarOpen} icon={<IconCustomers/>}>Customers</SideNavItem>
            <SideNavItem href={r.reports}    pathname={pathname} open={sidebarOpen} icon={<IconReports/>}>Reports</SideNavItem>
          </NavGroup>

          {/* Signals group */}
          <NavGroup label="Signals" open={sidebarOpen}>
            <SideNavItem href={r.voice}      pathname={pathname} open={sidebarOpen} icon={<IconVoice/>}>Voice</SideNavItem>
            <SideNavItem href={r.surveys}    pathname={pathname} open={sidebarOpen} icon={<IconSurveys/>}>Surveys</SideNavItem>
            <SideNavItem href={r.support.overview} pathname={pathname} open={sidebarOpen} icon={<IconSupport/>}>Support</SideNavItem>
          </NavGroup>

          {/* Admin group */}
          {isAdmin && (
            <NavGroup label="Admin" open={sidebarOpen}>
              <SideNavItem href={ra.members}      pathname={pathname} open={sidebarOpen} icon={<IconMembers/>}>Members</SideNavItem>
              <SideNavItem href={ra.billing}      pathname={pathname} open={sidebarOpen} icon={<IconBilling/>}>Billing</SideNavItem>
              <SideNavItem href={ra.integrations} pathname={pathname} open={sidebarOpen} icon={<IconIntegrations/>}>Integrations</SideNavItem>
              <SideNavItem href={ra.settings}     pathname={pathname} open={sidebarOpen} icon={<IconSettings/>}>Settings</SideNavItem>
            </NavGroup>
          )}
        </nav>

        {/* Bottom: workspace name + user actions */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          padding: sidebarOpen ? '0.75rem 1rem' : '0.75rem 0.6rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem',
          flexShrink: 0,
        }}>
          {sidebarOpen && workspace && (
            <div style={{
              fontSize: '0.72rem',
              color: 'rgba(255,255,255,0.45)',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '0.2rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {workspace.name}
            </div>
          )}
          <Link
            href={r.profile}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              textDecoration: 'none', padding: '0.35rem 0.4rem', borderRadius: 6,
              color: 'rgba(255,255,255,0.65)',
              fontSize: '0.82rem', fontWeight: 500,
            }}
          >
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: 'rgba(32,164,164,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
              </svg>
            </div>
            {sidebarOpen && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Profile</span>}
          </Link>
          <button
            onClick={logout}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.5)', fontSize: '0.82rem', fontWeight: 500,
              padding: '0.35rem 0.4rem', borderRadius: 6, textAlign: 'left', width: '100%',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            {sidebarOpen && 'Sign out'}
          </button>
        </div>
      </aside>

      {/* ── Content area ────────────────────────────────────────────────── */}
      <div style={{
        marginLeft: sidebarW,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        transition: 'margin-left 0.2s ease',
      }}>
        {/* Top bar */}
        <header style={{
          height: 56,
          background: '#fff',
          borderBottom: '1px solid #e9ecef',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1.5rem',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 1px 3px rgba(10,37,64,0.04)',
        }}>
          {/* Breadcrumb / page title area */}
          <PageTitle pathname={pathname} slug={slug} />

          {/* Right: workspace badge + role */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {role && (
              <span style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                color: TEAL,
                background: '#e8f7f7',
                padding: '0.2rem 0.55rem',
                borderRadius: '999px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                {role}
              </span>
            )}
            {workspace && (
              <span style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#6C757D',
                maxWidth: 160,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {workspace.name}
              </span>
            )}
          </div>
        </header>

        {/* Main content */}
        <main style={{
          flex: 1,
          padding: '2rem',
          maxWidth: 1280,
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box',
        }}>
          {children}
        </main>
      </div>
    </div>
  );
}

// ─── Nav group label ──────────────────────────────────────────────────────────
function NavGroup({ label, open, children }: { label: string; open: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.25rem' }}>
      {open && (
        <div style={{
          fontSize: '0.65rem',
          fontWeight: 700,
          color: 'rgba(255,255,255,0.3)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          padding: '0.6rem 1rem 0.3rem',
        }}>
          {label}
        </div>
      )}
      {!open && <div style={{ height: 8 }} />}
      {children}
    </div>
  );
}

// ─── Sidebar nav item ─────────────────────────────────────────────────────────
function SideNavItem({
  href,
  pathname,
  open,
  icon,
  children,
}: {
  href: string;
  pathname: string;
  open: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const isActive = pathname === href || pathname.startsWith(href + '/');
  return (
    <Link
      href={href}
      title={!open ? String(children) : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: open ? '0.45rem 1rem' : '0.45rem 0.75rem',
        margin: '0 0.4rem',
        borderRadius: 6,
        textDecoration: 'none',
        color: isActive ? '#fff' : 'rgba(255,255,255,0.6)',
        background: isActive ? 'rgba(32,164,164,0.18)' : 'transparent',
        fontSize: '0.85rem',
        fontWeight: isActive ? 600 : 400,
        transition: 'background 0.15s, color 0.15s',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
    >
      <span style={{
        flexShrink: 0,
        color: isActive ? TEAL : 'rgba(255,255,255,0.45)',
        display: 'flex', alignItems: 'center',
      }}>
        {icon}
      </span>
      {open && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>}
      {isActive && open && (
        <span style={{
          marginLeft: 'auto',
          width: 4, height: 4,
          borderRadius: '50%',
          background: TEAL,
          flexShrink: 0,
        }}/>
      )}
    </Link>
  );
}

// ─── Page title breadcrumb ────────────────────────────────────────────────────
function PageTitle({ pathname, slug }: { pathname: string; children?: never; slug: string }) {
  const segments = pathname.replace(`/${slug}`, '').split('/').filter(Boolean);
  const last = segments[segments.length - 1] ?? 'dashboard';
  const titles: Record<string, string> = {
    app: 'Dashboard',
    inbox: 'Feedback Inbox',
    themes: 'Themes',
    roadmap: 'Roadmap',
    customers: 'Customers',
    reports: 'Reports',
    voice: 'Voice',
    surveys: 'Surveys',
    support: 'Support',
    intelligence: 'Intelligence',
    prioritization: 'Prioritization',
    digest: 'Weekly Digest',
    risk: 'Risk',
    members: 'Members',
    billing: 'Billing',
    integrations: 'Integrations',
    settings: 'Settings',
    profile: 'Profile',
    'ai-settings': 'AI Settings',
  };
  const title = titles[last] ?? (last.charAt(0).toUpperCase() + last.slice(1));
  return (
    <h1 style={{
      fontSize: '0.95rem',
      fontWeight: 700,
      color: NAVY,
      margin: 0,
      letterSpacing: '-0.01em',
    }}>
      {title}
    </h1>
  );
}

// ─── SVG icons (16×16, stroke-based) ─────────────────────────────────────────
const iconProps = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function IconGrid()         { return <svg {...iconProps}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>; }
function IconInbox()        { return <svg {...iconProps}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>; }
function IconTheme()        { return <svg {...iconProps}><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>; }
function IconRoadmap()      { return <svg {...iconProps}><line x1="3" y1="12" x2="21" y2="12"/><polyline points="8 8 3 12 8 16"/><polyline points="16 8 21 12 16 16"/></svg>; }
function IconCustomers()    { return <svg {...iconProps}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function IconReports()      { return <svg {...iconProps}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>; }
function IconVoice()        { return <svg {...iconProps}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>; }
function IconSurveys()      { return <svg {...iconProps}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>; }
function IconSupport()      { return <svg {...iconProps}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>; }
function IconMembers()      { return <svg {...iconProps}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function IconBilling()      { return <svg {...iconProps}><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>; }
function IconIntegrations() { return <svg {...iconProps}><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>; }
function IconSettings()     { return <svg {...iconProps}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }

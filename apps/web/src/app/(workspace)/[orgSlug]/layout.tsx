'use client';
/**
 * /:orgSlug/* — Root workspace layout (mobile-first)
 *
 * Navigation structure (redesigned):
 *   Workspace   → Home, Inbox, Themes, Roadmap
 *   Intelligence Hub  → CIQ Overview, Theme Ranking, Feature Ranking, Customer Ranking
 *   Prioritization    → Engine, Feature Priority Ranking, Revenue Opportunities, Roadmap Fit
 *   Customers   → Customers, Reports
 *   Signals     → Voice, Surveys, Support
 *   Admin       → Members, Billing, Integrations, Settings  (admin only)
 *
 * Breakpoints:
 *   < 768px  → bottom tab bar (5 primary items) + hamburger drawer for full nav
 *   ≥ 768px  → collapsible left sidebar (232px expanded / 56px collapsed)
 *
 * Design tokens: Navy #0A2540 | Teal #20A4A4 | BG #F8F9FA | Border #e9ecef
 */
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useWorkspace, useCurrentMemberRole } from '@/hooks/use-workspace';
import { useAuth } from '@/lib/auth';
import { WorkspaceStatus, WorkspaceRole } from '@/lib/api-types';
import { appRoutes, orgAdminRoutes } from '@/lib/routes';

const NAVY      = '#0A2540';
const TEAL      = '#20A4A4';
const SIDEBAR_W = 232;
const SIDEBAR_C = 56;

export default function OrgSlugLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params   = useParams();
  const slug     = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';

  const isAuthRoute =
    pathname.endsWith('/login') ||
    pathname.endsWith('/signup') ||
    pathname.includes('/reset-password') ||
    pathname.includes('/verify');

  const isPortalRoute =
    pathname.includes('/portal/') ||
    (pathname.includes('/feedback') && !pathname.includes('/app/')) ||
    pathname === `/${slug}/roadmap`;

  if (isAuthRoute || isPortalRoute) return <>{children}</>;
  return <AuthenticatedShell slug={slug} pathname={pathname}>{children}</AuthenticatedShell>;
}

function AuthenticatedShell({ slug, pathname, children }: { slug: string; pathname: string; children: React.ReactNode }) {
  const { workspace, isLoading: wsLoading } = useWorkspace();
  const { role, isLoading: roleLoading }    = useCurrentMemberRole();
  const { logout }                          = useAuth();
  const router                              = useRouter();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawerOpen,  setDrawerOpen]  = useState(false);
  const [isMobile,    setIsMobile]    = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  useEffect(() => {
    if (!wsLoading && workspace && workspace.status !== WorkspaceStatus.ACTIVE) {
      router.push('/activation');
    }
  }, [workspace, wsLoading, router]);

  if (wsLoading || roleLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif", background: '#F8F9FA',
        color: '#6C757D', fontSize: '0.875rem', gap: '0.6rem' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
        Loading workspace…
      </div>
    );
  }

  const workspaceId = workspace?.id ?? '';

  const isAdmin  = role === WorkspaceRole.ADMIN;
  const r        = appRoutes(slug);
  const ra       = orgAdminRoutes(slug);
  const sidebarW = sidebarOpen ? SIDEBAR_W : SIDEBAR_C;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif", background: '#F8F9FA', color: NAVY }}>

      {/* ── Desktop Sidebar ────────────────────────────────────────────────────── */}
      {!isMobile && (
        <aside style={{ width: sidebarW, minHeight: '100vh', background: NAVY, display: 'flex', flexDirection: 'column',
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 200, transition: 'width 0.2s ease', overflow: 'hidden' }}>

          {/* Logo row */}
          <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: sidebarOpen ? '0 1rem' : '0 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
            {sidebarOpen ? (
              <Link href={r.dashboard} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
                <LogoMark />
                <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
                  Triage<span style={{ color: TEAL }}>Insight</span>
                </span>
              </Link>
            ) : (
              <Link href={r.dashboard} style={{ textDecoration: 'none' }}><LogoMark /></Link>
            )}
            <button onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)',
                padding: '4px', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {sidebarOpen ? <path d="M15 18l-6-6 6-6"/> : <path d="M9 18l6-6-6-6"/>}
              </svg>
            </button>
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0.75rem 0' }}>

            {/* Home */}
            <NavGroup label="" open={sidebarOpen}>
              <SideNavItem href={r.dashboard} pathname={pathname} open={sidebarOpen} icon={<IconGrid/>}>Home</SideNavItem>
            </NavGroup>

            {/* SIGNALS */}
            <NavGroup label="Signals" open={sidebarOpen}>
              <SideNavItem href={r.inbox}            pathname={pathname} open={sidebarOpen} icon={<IconInbox/>}>Inbox</SideNavItem>
              <SideNavItem href={r.feedbackSource}   pathname={pathname} open={sidebarOpen} icon={<IconFeedback/>}>Feedback</SideNavItem>
              <SideNavItem href={r.voice}            pathname={pathname} open={sidebarOpen} icon={<IconVoice/>}>Voice</SideNavItem>
              <SideNavItem href={r.surveys}          pathname={pathname} open={sidebarOpen} icon={<IconSurveys/>}>Surveys</SideNavItem>
              <SideNavItem href={r.support.overview} pathname={pathname} open={sidebarOpen} icon={<IconSupport/>}>Support</SideNavItem>
            </NavGroup>

            {/* THEMES */}
            <NavGroup label="Themes" open={sidebarOpen}>
              <SideNavItem href={r.themes}               pathname={pathname} open={sidebarOpen} icon={<IconTheme/>}>All Themes</SideNavItem>
              {/* Customers and Customer Ranking temporarily hidden */}
              {/* <SideNavItem href={r.customers}            pathname={pathname} open={sidebarOpen} icon={<IconCustomers/>}>Customers</SideNavItem> */}
              {/* <SideNavItem href={r.intelligenceCustomers} pathname={pathname} open={sidebarOpen} icon={<IconCustomerIQ/>}>Customer Ranking</SideNavItem> */}
            </NavGroup>

            {/* PRIORITIZATION */}
            <NavGroup label="Prioritization" open={sidebarOpen}>
              <SideNavItem href={r.ciq}                        pathname={pathname} open={sidebarOpen} icon={<IconIntelligence/>}>CIQ Scoring</SideNavItem>
              <SideNavItem href={r.intelligenceThemes}         pathname={pathname} open={sidebarOpen} icon={<IconThemeRank/>}>Theme Ranking</SideNavItem>
              {/* M3+M4 fix: these pages rank feedback items, not features — renamed to reflect actual entity */}
              <SideNavItem href={r.intelligenceFeatures}       pathname={pathname} open={sidebarOpen} icon={<IconFeatureRank/>}>Feedback CIQ Ranking</SideNavItem>
              <SideNavItem href={r.prioritizationFeatures}     pathname={pathname} open={sidebarOpen} icon={<IconFeaturePriority/>}>Feedback Priority</SideNavItem>
              <SideNavItem href={r.prioritizationOpportunities} pathname={pathname} open={sidebarOpen} icon={<IconOpportunity/>}>Revenue Opps</SideNavItem>
            </NavGroup>

            {/* DECISIONS */}
            <NavGroup label="Decisions" open={sidebarOpen}>
              <SideNavItem href={r.roadmap}               pathname={pathname} open={sidebarOpen} icon={<IconRoadmap/>}>Roadmap</SideNavItem>
              <SideNavItem href={r.prioritizationRoadmap} pathname={pathname} open={sidebarOpen} icon={<IconRoadmapAlign/>}>Roadmap Recs</SideNavItem>
              <SideNavItem href={r.roadmapAiSuggestions}  pathname={pathname} open={sidebarOpen} icon={<IconBrain/>}>AI Suggestions</SideNavItem>
              <SideNavItem href={r.actionPlan}            pathname={pathname} open={sidebarOpen} icon={<IconCalendar/>}>Action Plan</SideNavItem>
            </NavGroup>

            {/* REPORTS */}
            <NavGroup label="Reports" open={sidebarOpen}>
              <SideNavItem href={r.executiveDashboard} pathname={pathname} open={sidebarOpen} icon={<IconDashboard/>}>Exec Dashboard</SideNavItem>
              <SideNavItem href={r.digest}             pathname={pathname} open={sidebarOpen} icon={<IconBook/>}>Digest</SideNavItem>
              <SideNavItem href={r.reports}            pathname={pathname} open={sidebarOpen} icon={<IconReports/>}>Reports</SideNavItem>
            </NavGroup>

            {/* Admin */}
            {isAdmin && (
              <NavGroup label="Admin" open={sidebarOpen}>
                <SideNavItem href={ra.members}      pathname={pathname} open={sidebarOpen} icon={<IconMembers/>}>Members</SideNavItem>
                <SideNavItem href={ra.billing}      pathname={pathname} open={sidebarOpen} icon={<IconBilling/>}>Billing</SideNavItem>
                <SideNavItem href={ra.integrations} pathname={pathname} open={sidebarOpen} icon={<IconIntegrations/>}>Integrations</SideNavItem>
                <SideNavItem href={ra.settings}     pathname={pathname} open={sidebarOpen} icon={<IconSettings/>}>Settings</SideNavItem>
                <SideNavItem href={ra.auditLog}     pathname={pathname} open={sidebarOpen} icon={<IconAuditLog/>}>Audit Log</SideNavItem>
              </NavGroup>
            )}
          </nav>

          <SidebarBottom workspace={workspace} sidebarOpen={sidebarOpen} r={r} logout={logout} />
        </aside>
      )}

      {/* ── Mobile Drawer ──────────────────────────────────────────────────────── */}
      {isMobile && drawerOpen && (
        <>
          <div onClick={() => setDrawerOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 299, backdropFilter: 'blur(2px)' }} />
          <aside style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: 268, background: NAVY,
            display: 'flex', flexDirection: 'column', zIndex: 300, overflowY: 'auto',
            boxShadow: '4px 0 24px rgba(0,0,0,0.25)' }}>
            <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
              <Link href={r.dashboard} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
                <LogoMark />
                <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', letterSpacing: '-0.01em' }}>
                  Triage<span style={{ color: TEAL }}>Insight</span>
                </span>
              </Link>
              <button onClick={() => setDrawerOpen(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', padding: '4px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <nav style={{ flex: 1, padding: '0.75rem 0' }}>
              <NavGroupDrawer label="">
                <DrawerNavItem href={r.dashboard} pathname={pathname} icon={<IconGrid/>}>Home</DrawerNavItem>
              </NavGroupDrawer>
              <NavGroupDrawer label="Signals">
                <DrawerNavItem href={r.inbox}            pathname={pathname} icon={<IconInbox/>}>Inbox</DrawerNavItem>
                <DrawerNavItem href={r.feedbackSource}   pathname={pathname} icon={<IconFeedback/>}>Feedback</DrawerNavItem>
                <DrawerNavItem href={r.voice}            pathname={pathname} icon={<IconVoice/>}>Voice</DrawerNavItem>
                <DrawerNavItem href={r.surveys}          pathname={pathname} icon={<IconSurveys/>}>Surveys</DrawerNavItem>
                <DrawerNavItem href={r.support.overview} pathname={pathname} icon={<IconSupport/>}>Support</DrawerNavItem>
              </NavGroupDrawer>
              <NavGroupDrawer label="Themes">
                <DrawerNavItem href={r.themes}               pathname={pathname} icon={<IconTheme/>}>All Themes</DrawerNavItem>
                {/* Customers and Customer Ranking temporarily hidden */}
                {/* <DrawerNavItem href={r.customers}            pathname={pathname} icon={<IconCustomers/>}>Customers</DrawerNavItem> */}
                {/* <DrawerNavItem href={r.intelligenceCustomers} pathname={pathname} icon={<IconCustomerIQ/>}>Customer Ranking</DrawerNavItem> */}
              </NavGroupDrawer>
              <NavGroupDrawer label="Prioritization">
                <DrawerNavItem href={r.ciq}                        pathname={pathname} icon={<IconIntelligence/>}>CIQ Scoring</DrawerNavItem>
                <DrawerNavItem href={r.intelligenceThemes}         pathname={pathname} icon={<IconThemeRank/>}>Theme Ranking</DrawerNavItem>
                <DrawerNavItem href={r.intelligenceFeatures}       pathname={pathname} icon={<IconFeatureRank/>}>Feedback CIQ Ranking</DrawerNavItem>
                <DrawerNavItem href={r.prioritizationFeatures}     pathname={pathname} icon={<IconFeaturePriority/>}>Feedback Priority</DrawerNavItem>
                <DrawerNavItem href={r.prioritizationOpportunities} pathname={pathname} icon={<IconOpportunity/>}>Revenue Opps</DrawerNavItem>
              </NavGroupDrawer>
              <NavGroupDrawer label="Decisions">
                <DrawerNavItem href={r.roadmap}               pathname={pathname} icon={<IconRoadmap/>}>Roadmap</DrawerNavItem>
                <DrawerNavItem href={r.prioritizationRoadmap} pathname={pathname} icon={<IconRoadmapAlign/>}>Roadmap Recs</DrawerNavItem>
                <DrawerNavItem href={r.roadmapAiSuggestions}  pathname={pathname} icon={<IconBrain/>}>AI Suggestions</DrawerNavItem>
                <DrawerNavItem href={r.actionPlan}            pathname={pathname} icon={<IconCalendar/>}>Action Plan</DrawerNavItem>
              </NavGroupDrawer>
              <NavGroupDrawer label="Reports">
                <DrawerNavItem href={r.executiveDashboard} pathname={pathname} icon={<IconDashboard/>}>Exec Dashboard</DrawerNavItem>
                <DrawerNavItem href={r.digest}             pathname={pathname} icon={<IconBook/>}>Digest</DrawerNavItem>
                <DrawerNavItem href={r.reports}            pathname={pathname} icon={<IconReports/>}>Reports</DrawerNavItem>
              </NavGroupDrawer>
              {isAdmin && (
                <NavGroupDrawer label="Admin">
                  <DrawerNavItem href={ra.members}      pathname={pathname} icon={<IconMembers/>}>Members</DrawerNavItem>
                  <DrawerNavItem href={ra.billing}      pathname={pathname} icon={<IconBilling/>}>Billing</DrawerNavItem>
                  <DrawerNavItem href={ra.integrations} pathname={pathname} icon={<IconIntegrations/>}>Integrations</DrawerNavItem>
                  <DrawerNavItem href={ra.settings}     pathname={pathname} icon={<IconSettings/>}>Settings</DrawerNavItem>
                  <DrawerNavItem href={ra.auditLog}     pathname={pathname} icon={<IconAuditLog/>}>Audit Log</DrawerNavItem>
                </NavGroupDrawer>
              )}
            </nav>
            <SidebarBottom workspace={workspace} sidebarOpen r={r} logout={logout} />
          </aside>
        </>
      )}

      {/* ── Main content area ─────────────────────────────────────────────────── */}
      <div style={{ marginLeft: isMobile ? 0 : sidebarW, flex: 1, display: 'flex', flexDirection: 'column',
        minHeight: '100vh', paddingBottom: isMobile ? 64 : 0, transition: 'margin-left 0.2s ease',
        minWidth: 0, maxWidth: '100%' }}>

        {/* Top bar */}
        <header style={{ height: 56, background: '#fff', borderBottom: '1px solid #e9ecef',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: isMobile ? '0 1rem' : '0 1.5rem', position: 'sticky', top: 0, zIndex: 100,
          boxShadow: '0 1px 3px rgba(10,37,64,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {isMobile && (
              <button onClick={() => setDrawerOpen(true)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: NAVY,
                  padding: '4px', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              </button>
            )}
            <PageTitle pathname={pathname} slug={slug} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {role && (
              <span style={{ fontSize: '0.7rem', fontWeight: 700,
                color: role === WorkspaceRole.ADMIN ? '#fff' : NAVY,
                background: role === WorkspaceRole.ADMIN ? TEAL : '#e9ecef',
                padding: '2px 8px', borderRadius: 4, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {role}
              </span>
            )}
            {!isMobile && workspace && (
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: NAVY }}>{workspace.slug ?? slug}</span>
            )}
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, padding: isMobile ? '1rem' : '1.5rem', minWidth: 0, maxWidth: '100%', overflowX: 'hidden' }}>
          {children}
        </main>
      </div>

      {/* ── Mobile bottom tab bar ─────────────────────────────────────────────── */}
      {isMobile && (
        <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 64, background: NAVY,
          display: 'flex', alignItems: 'stretch', zIndex: 200, borderTop: '1px solid rgba(255,255,255,0.1)',
          paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <BottomTab href={r.dashboard}   pathname={pathname} icon={<IconGrid/>}          label="Home"/>
          <BottomTab href={r.inbox}       pathname={pathname} icon={<IconInbox/>}         label="Inbox"/>
          <BottomTab href={r.intelligence} pathname={pathname} icon={<IconIntelligence/>} label="Intel"/>
          <BottomTab href={r.prioritization} pathname={pathname} icon={<IconPriority/>}  label="Priority"/>
          <button onClick={() => setDrawerOpen(true)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 3, background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.55)', fontSize: '0.6rem', fontWeight: 600,
              letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
            More
          </button>
        </nav>
      )}
    </div>
  );
}

// ─── Bottom tab ───────────────────────────────────────────────────────────────
function BottomTab({ href, pathname, icon, label }: { href: string; pathname: string; icon: React.ReactNode; label: string }) {
  const isActive = pathname === href || pathname.startsWith(href + '/');
  return (
    <Link href={href} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 3, textDecoration: 'none',
      color: isActive ? TEAL : 'rgba(255,255,255,0.55)',
      fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
      <span style={{ color: isActive ? TEAL : 'rgba(255,255,255,0.55)' }}>{icon}</span>
      {label}
    </Link>
  );
}

// ─── Sidebar bottom (profile + sign out) ─────────────────────────────────────
function SidebarBottom({ workspace, sidebarOpen, r, logout }: {
  workspace: { name?: string; slug?: string } | null | undefined;
  sidebarOpen: boolean;
  r: ReturnType<typeof appRoutes>;
  logout: () => void;
}) {
  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)',
      padding: sidebarOpen ? '0.75rem 1rem' : '0.75rem 0.6rem',
      display: 'flex', flexDirection: 'column', gap: '0.4rem', flexShrink: 0 }}>
      {sidebarOpen && workspace && (
        <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', fontWeight: 500,
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.2rem',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {workspace.name}
        </div>
      )}
      <Link href={r.profile} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem',
        textDecoration: 'none', padding: '0.35rem 0.4rem', borderRadius: 6,
        color: 'rgba(255,255,255,0.65)', fontSize: '0.82rem', fontWeight: 500 }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(32,164,164,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
          </svg>
        </div>
        {sidebarOpen && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Profile</span>}
      </Link>
      <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem',
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'rgba(255,255,255,0.5)', fontSize: '0.82rem', fontWeight: 500,
        padding: '0.35rem 0.4rem', borderRadius: 6, textAlign: 'left', width: '100%' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
        </svg>
        {sidebarOpen && 'Sign out'}
      </button>
    </div>
  );
}

// ─── Nav group label ──────────────────────────────────────────────────────────
function NavGroup({ label, open, children }: { label: string; open: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.25rem' }}>
      {open ? (
        <div style={{ fontSize: '0.63rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)',
          textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.6rem 1rem 0.25rem' }}>
          {label}
        </div>
      ) : <div style={{ height: '0.5rem' }}/>}
      {children}
    </div>
  );
}

// ─── Desktop sidebar nav item ─────────────────────────────────────────────────
function SideNavItem({ href, pathname, open, icon, children }: {
  href: string; pathname: string; open: boolean; icon: React.ReactNode; children: React.ReactNode;
}) {
  const isActive = pathname === href || pathname.startsWith(href + '/');
  return (
    <Link href={href} style={{ display: 'flex', alignItems: 'center', gap: open ? '0.6rem' : 0,
      padding: open ? '0.42rem 1rem' : '0.42rem 0', justifyContent: open ? 'flex-start' : 'center',
      textDecoration: 'none', background: isActive ? 'rgba(32,164,164,0.12)' : 'transparent',
      borderLeft: isActive ? `2px solid ${TEAL}` : '2px solid transparent',
      color: isActive ? '#fff' : 'rgba(255,255,255,0.65)',
      fontSize: '0.85rem', fontWeight: isActive ? 600 : 400 }}>
      <span style={{ color: isActive ? TEAL : 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center' }}>{icon}</span>
      {open && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>}
      {isActive && open && <span style={{ marginLeft: 'auto', width: 4, height: 4, borderRadius: '50%', background: TEAL, flexShrink: 0 }}/>}
    </Link>
  );
}

// ─── Mobile drawer group label ────────────────────────────────────────────────
function NavGroupDrawer({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.25rem' }}>
      <div style={{ fontSize: '0.63rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)',
        textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.6rem 1rem 0.25rem' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

// ─── Mobile drawer nav item ───────────────────────────────────────────────────
function DrawerNavItem({ href, pathname, icon, children }: { href: string; pathname: string; icon: React.ReactNode; children: React.ReactNode }) {
  const isActive = pathname === href || pathname.startsWith(href + '/');
  return (
    <Link href={href} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.5rem 1rem',
      textDecoration: 'none', background: isActive ? 'rgba(32,164,164,0.12)' : 'transparent',
      borderLeft: isActive ? `2px solid ${TEAL}` : '2px solid transparent',
      color: isActive ? '#fff' : 'rgba(255,255,255,0.7)', fontSize: '0.9rem', fontWeight: isActive ? 600 : 400 }}>
      <span style={{ color: isActive ? TEAL : 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center' }}>{icon}</span>
      {children}
    </Link>
  );
}

// ─── Page title (top bar) ─────────────────────────────────────────────────────
function PageTitle({ pathname, slug }: { pathname: string; slug: string }) {
  const segments = pathname.replace(`/${slug}`, '').split('/').filter(Boolean);
  const last     = segments[segments.length - 1] ?? 'app';
  const parent   = segments[segments.length - 2] ?? '';

  // Context-aware title: when inside /intelligence/*, use intelligence-specific labels
  if (parent === 'intelligence') {
    const intelTitles: Record<string, string> = {
      themes:    'Theme Ranking',
      features:  'Feature Ranking',
      customers: 'Customer Ranking',
    };
    if (intelTitles[last]) {
      return <h1 style={{ fontSize: '0.95rem', fontWeight: 700, color: NAVY, margin: 0, letterSpacing: '-0.01em' }}>{intelTitles[last]}</h1>;
    }
  }

  // Context-aware title: when inside /prioritization/*, use prioritization-specific labels
  if (parent === 'prioritization') {
    const prioTitles: Record<string, string> = {
      features:      'Feature Priority Ranking',
      opportunities: 'Revenue Opportunities',
      roadmap:       'Roadmap Fit',
      settings:      'Prioritization Settings',
    };
    if (prioTitles[last]) {
      return <h1 style={{ fontSize: '0.95rem', fontWeight: 700, color: NAVY, margin: 0, letterSpacing: '-0.01em' }}>{prioTitles[last]}</h1>;
    }
  }

  const titles: Record<string, string> = {
    app: 'Home', inbox: 'Inbox', feedback: 'Feedback Source', themes: 'Themes', roadmap: 'Roadmap',
    customers: 'Customers', reports: 'Reports', voice: 'Voice', surveys: 'Surveys',
    support: 'Support',
    intelligence: 'Intelligence Hub', features: 'Feature Ranking', 'customers-iq': 'Customer Ranking',
    prioritization: 'Prioritization Engine', opportunities: 'Revenue Opportunities', 'roadmap-fit': 'Roadmap Fit',
    digest: 'Weekly Digest', risk: 'Revenue Risk', members: 'Members', billing: 'Billing',
    integrations: 'Integrations', settings: 'Settings', profile: 'Profile', 'ai-settings': 'AI Settings', 'audit-log': 'Audit Log',
  };
  const title = titles[last] ?? (last.charAt(0).toUpperCase() + last.slice(1));
  return <h1 style={{ fontSize: '0.95rem', fontWeight: 700, color: NAVY, margin: 0, letterSpacing: '-0.01em' }}>{title}</h1>;
}

// ─── Logo mark ────────────────────────────────────────────────────────────────
function LogoMark() {
  return (
    <div style={{ width: 26, height: 26, background: `linear-gradient(135deg, ${TEAL} 0%, #1a8f8f 100%)`,
      borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M3 4h10M3 8h7M3 12h5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const ip = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

// Workspace
function IconGrid()         { return <svg {...ip}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>; }
function IconInbox()        { return <svg {...ip}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>; }
function IconTheme()        { return <svg {...ip}><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>; }
function IconRoadmap()      { return <svg {...ip}><line x1="3" y1="12" x2="21" y2="12"/><polyline points="8 8 3 12 8 16"/><polyline points="16 8 21 12 16 16"/></svg>; }

// Intelligence Hub
function IconIntelligence() { return <svg {...ip}><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>; }
function IconThemeRank()    { return <svg {...ip}><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>; }
function IconFeatureRank()  { return <svg {...ip}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>; }
function IconCustomerIQ()   { return <svg {...ip}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }

// Prioritization
function IconPriority()       { return <svg {...ip}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>; }
function IconFeaturePriority(){ return <svg {...ip}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>; }
function IconOpportunity()    { return <svg {...ip}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>; }
function IconRoadmapAlign()   { return <svg {...ip}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>; }

// Customers
function IconCustomers()    { return <svg {...ip}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function IconReports()      { return <svg {...ip}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>; }

// Signals
function IconFeedback()     { return <svg {...ip}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>; }
function IconVoice()        { return <svg {...ip}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>; }
function IconSurveys()      { return <svg {...ip}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>; }
function IconSupport()      { return <svg {...ip}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>; }

// Decisions
function IconBrain()        { return <svg {...ip}><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2z"/></svg>; }
function IconCalendar()     { return <svg {...ip}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>; }

// Reports
function IconDashboard()    { return <svg {...ip}><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>; }
function IconBook()         { return <svg {...ip}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>; }

// Admin
function IconMembers()      { return <svg {...ip}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function IconBilling()      { return <svg {...ip}><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>; }
function IconAuditLog()     { return <svg {...ip}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>; }
function IconIntegrations() { return <svg {...ip}><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>; }
function IconSettings()     { return <svg {...ip}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }

'use client';

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  Inbox,
  Mic,
  ClipboardList,
  HeadphonesIcon,
  Layers,
  Users,
  Zap,
  TrendingUp,
  BarChart2,
  DollarSign,
  Map,
  Lightbulb,
  CalendarCheck,
  Settings,
  User,
  Brain,
  Package2,
  ChevronRight,
} from "lucide-react";
import { appRoutes, orgAdminRoutes } from "@/lib/routes";

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
}

interface NavSection {
  id: string;
  title: string;
  subtitle: string;
  items: NavItem[];
}

export function Sidebar({ orgSlug: orgSlugProp }: { orgSlug?: string }) {
  const params = useParams();
  const pathname = usePathname();
  const slug = orgSlugProp ?? (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';

  const r = appRoutes(slug);
  const adminR = orgAdminRoutes(slug);

  const sections: NavSection[] = [
    {
      id: 'signals',
      title: 'SIGNALS',
      subtitle: 'Raw incoming data from all sources',
      items: [
        { href: r.inbox,           icon: Inbox,           label: 'Inbox' },
        { href: r.voice,           icon: Mic,             label: 'Voice' },
        { href: r.surveys,         icon: ClipboardList,   label: 'Surveys' },
        { href: r.support.overview,icon: HeadphonesIcon,  label: 'Support' },
      ],
    },
    {
      id: 'themes',
      title: 'THEMES',
      subtitle: 'AI-grouped problems and customer context',
      items: [
        { href: r.themes,    icon: Layers, label: 'All Themes' },
        { href: r.customers, icon: Users,  label: 'Customers' },
      ],
    },
    {
      id: 'prioritization',
      title: 'PRIORITIZATION',
      subtitle: 'Business scoring and ranked impact',
      items: [
        { href: r.ciq,                        icon: Zap,       label: 'CIQ Scoring' },
        { href: r.intelligenceThemes,          icon: TrendingUp,label: 'Theme Ranking' },
        { href: r.intelligenceFeatures,        icon: BarChart2, label: 'Feature Ranking' },
        { href: r.prioritizationOpportunities, icon: DollarSign,label: 'Revenue Opps' },
      ],
    },
    {
      id: 'decisions',
      title: 'DECISIONS',
      subtitle: 'Act on insights and plan what to build',
      items: [
        { href: r.roadmap,            icon: Map,          label: 'Roadmap' },
        { href: r.roadmapAiSuggestions,icon: Lightbulb,   label: 'AI Suggestions' },
        { href: r.actionPlan,          icon: CalendarCheck,label: 'Action Plan' },
      ],
    },
  ];

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <aside
      className="fixed inset-y-0 left-0 z-10 hidden w-56 flex-col border-r bg-background sm:flex"
      style={{ boxShadow: '1px 0 0 0 #e9ecef' }}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b px-4 gap-2">
        <Link
          href={r.dashboard}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
        >
          <Package2 className="h-4 w-4" />
        </Link>
        <span className="font-semibold text-sm text-foreground tracking-tight">TriageInsight</span>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-5">
        {sections.map((section) => (
          <div key={section.id}>
            {/* Section header */}
            <div className="px-2 mb-1">
              <p className="text-[10px] font-semibold tracking-widest text-muted-foreground/70 uppercase">
                {section.title}
              </p>
              <p className="text-[10px] text-muted-foreground/50 leading-tight mt-0.5 hidden xl:block">
                {section.subtitle}
              </p>
            </div>
            {/* Section items */}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={[
                        'flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors',
                        active
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                      ].join(' ')}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                      {active && <ChevronRight className="h-3 w-3 ml-auto shrink-0 opacity-50" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="border-t px-3 py-3 space-y-0.5">
        <Link
          href={r.profile}
          className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <User className="h-4 w-4 shrink-0" />
          <span>Profile</span>
        </Link>
        <Link
          href={adminR.aiSettings}
          className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Brain className="h-4 w-4 shrink-0" />
          <span>AI Settings</span>
        </Link>
        <Link
          href={adminR.settings}
          className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Settings className="h-4 w-4 shrink-0" />
          <span>Settings</span>
        </Link>
      </div>
    </aside>
  );
}

/**
 * Centralised route helpers for the multi-tenant architecture.
 *
 * URL shape:
 *   Platform super-admin  → /admin/*
 *   Workspace staff app   → /:orgSlug/app/*
 *   Workspace org-admin   → /:orgSlug/admin/*
 *   Public portal         → /:orgSlug/feedback | /:orgSlug/roadmap
 *   Workspace auth        → /:orgSlug/login | /:orgSlug/signup | …
 *   Global auth           → /login | /signup | /create-workspace
 */

// ─── Platform super-admin ─────────────────────────────────────────────────────
export const platformRoutes = {
  dashboard: '/admin',
} as const;

// ─── Global auth ──────────────────────────────────────────────────────────────
export const globalAuthRoutes = {
  login: '/login',
  signup: '/signup',
  createWorkspace: '/signup',
} as const;

// ─── Per-workspace helpers ────────────────────────────────────────────────────

/** Workspace staff app routes (admin + editor + viewer) */
export const appRoutes = (slug: string) => ({
  dashboard:  `/${slug}/app`,
  feedbackSource: `/${slug}/app/feedback`,
  inbox:      `/${slug}/app/inbox`,
  inboxItem:  (id: string) => `/${slug}/app/inbox/${id}`,
  inboxNew:   `/${slug}/app/inbox/new`,
  themes:     `/${slug}/app/themes`,
  themeItem:  (id: string) => `/${slug}/app/themes/${id}`,
  roadmap:    `/${slug}/app/roadmap`,
  roadmapItem: (id: string) => `/${slug}/app/roadmap/${id}`,
  voice:      `/${slug}/app/voice`,
  voiceItem:  (id: string) => `/${slug}/app/voice/${id}`,
  surveys:    `/${slug}/app/surveys`,
  surveyItem: (id: string) => `/${slug}/app/surveys/${id}`,
  digest:     `/${slug}/app/digest`,
  support: {
    overview: `/${slug}/app/support`,
    tickets:  `/${slug}/app/support/tickets`,
    clusters: `/${slug}/app/support/clusters`,
    spikes:   `/${slug}/app/support/spikes`,
    calls:    `/${slug}/app/support/calls`,
  },
  risk:       `/${slug}/app/risk`,
  riskItem:   (id: string) => `/${slug}/app/risk/${id}`,
  customers:  `/${slug}/app/customers`,
  customerItem: (id: string) => `/${slug}/app/customers/${id}`,
  customersAnalytics: `/${slug}/app/customers/analytics`,
  intelligence: `/${slug}/app/intelligence`,
  intelligenceThemes: `/${slug}/app/intelligence/themes`,
  intelligenceFeatures: `/${slug}/app/intelligence/features`,
  intelligenceCustomers: `/${slug}/app/intelligence/customers`,
  ciq: `/${slug}/app/ciq`,
  prioritization:              `/${slug}/app/prioritization`,
  prioritizationFeatures:      `/${slug}/app/prioritization/features`,
  prioritizationOpportunities: `/${slug}/app/prioritization/opportunities`,
  prioritizationRoadmap:       `/${slug}/app/prioritization/roadmap`,
  prioritizationBoard:         `/${slug}/app/prioritization/board`,
  prioritizationSettings:      `/${slug}/app/prioritization/settings`,
  roadmapAiSuggestions:        `/${slug}/app/roadmap/ai-suggestions`,
  actionPlan:                  `/${slug}/app/action-plan`,
  executiveDashboard:          `/${slug}/app/executive-dashboard`,
  reports:    `/${slug}/app/reports`,
  profile:    `/${slug}/app/profile`,
  upgrade:    `/${slug}/app/upgrade`,
});

/** Workspace org-admin routes (admin only) */
export const orgAdminRoutes = (slug: string) => ({
  settings:     `/${slug}/admin/settings`,
  members:      `/${slug}/admin/members`,
  billing:      `/${slug}/admin/billing`,
  integrations: `/${slug}/admin/integrations`,
  aiSettings:   `/${slug}/admin/ai-settings`,
  auditLog:     `/${slug}/admin/audit-log`,
});

/** Public portal routes (unauthenticated) */
export const publicRoutes = (slug: string) => ({
  feedback:       `/${slug}/feedback`,
  feedbackItem:   (id: string) => `/${slug}/feedback/${id}`,
  feedbackNew:    `/${slug}/feedback/new`,
  roadmap:        `/${slug}/roadmap`,
  // Portal surveys — public-facing survey pages
  portalSurveys:     `/${slug}/portal/surveys`,
  portalSurveyItem:  (id: string) => `/${slug}/portal/surveys/${id}`,
});

/** Workspace-scoped auth routes */
export const workspaceAuthRoutes = (slug: string) => ({
  login:         `/${slug}/login`,
  signup:        `/${slug}/signup`,
  resetPassword: `/${slug}/reset-password`,
  verify:        `/${slug}/verify`,
});

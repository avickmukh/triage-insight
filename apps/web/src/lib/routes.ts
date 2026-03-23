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
  inbox:      `/${slug}/app/inbox`,
  inboxItem:  (id: string) => `/${slug}/app/inbox/${id}`,
  inboxNew:   `/${slug}/app/inbox/new`,
  themes:     `/${slug}/app/themes`,
  themeItem:  (id: string) => `/${slug}/app/themes/${id}`,
  roadmap:    `/${slug}/app/roadmap`,
  roadmapItem: (id: string) => `/${slug}/app/roadmap/${id}`,
  voice:      `/${slug}/app/voice`,
  surveys:    `/${slug}/app/surveys`,
  surveyItem: (id: string) => `/${slug}/app/surveys/${id}`,
  digest:     `/${slug}/app/digest`,
  support: {
    tickets: `/${slug}/app/support/tickets`,
    calls:   `/${slug}/app/support/calls`,
  },
  risk:       `/${slug}/app/risk`,
  riskItem:   (id: string) => `/${slug}/app/risk/${id}`,
  customers:  `/${slug}/app/customers`,
  customerItem: (id: string) => `/${slug}/app/customers/${id}`,
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
});

/** Public portal routes (unauthenticated) */
export const publicRoutes = (slug: string) => ({
  feedback:       `/${slug}/feedback`,
  feedbackItem:   (id: string) => `/${slug}/feedback/${id}`,
  feedbackNew:    `/${slug}/feedback/new`,
  roadmap:        `/${slug}/roadmap`,
});

/** Workspace-scoped auth routes */
export const workspaceAuthRoutes = (slug: string) => ({
  login:         `/${slug}/login`,
  signup:        `/${slug}/signup`,
  resetPassword: `/${slug}/reset-password`,
  verify:        `/${slug}/verify`,
});

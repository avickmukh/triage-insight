/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@triage-insight/ui"],

  // Produce a self-contained server bundle for Docker / Lightsail deployment.
  // The standalone output copies only the required node_modules into .next/standalone
  // so the production image is lean (no full node_modules copy needed).
  output: 'standalone',

  /**
   * Rewrites map the clean public-portal URLs to the internal (workspace) route group.
   *
   * Target architecture:
   *   /:orgSlug/feedback      → rendered by (workspace)/[orgSlug]/portal/feedback/page.tsx
   *   /:orgSlug/feedback/new  → rendered by (workspace)/[orgSlug]/portal/feedback/new/page.tsx
   *   /:orgSlug/feedback/:id  → rendered by (workspace)/[orgSlug]/portal/feedback/[id]/page.tsx
   *   /:orgSlug/roadmap       → rendered by (workspace)/[orgSlug]/portal/roadmap/page.tsx
   *
   * These are transparent rewrites (URL stays clean in the browser).
   * The middleware matcher excludes portal paths so they remain public.
   *
   * NOTE: The :orgSlug segment must not match known top-level paths such as
   * "admin", "login", "signup", "activation", "api", "_next", etc.
   * We use a negative-lookahead-style exclusion via the `has` field or simply
   * rely on route specificity (more specific routes win over the rewrite).
   */
  async rewrites() {
    return [
      // Public portal – feedback list
      {
        source: "/:orgSlug/feedback",
        destination: "/:orgSlug/portal/feedback",
      },
      // Public portal – new feedback form
      {
        source: "/:orgSlug/feedback/new",
        destination: "/:orgSlug/portal/feedback/new",
      },
      // Public portal – feedback detail
      {
        source: "/:orgSlug/feedback/:id",
        destination: "/:orgSlug/portal/feedback/:id",
      },
      // Public portal – roadmap
      {
        source: "/:orgSlug/roadmap",
        destination: "/:orgSlug/portal/roadmap",
      },
      // Public portal – survey list
      {
        source: "/:orgSlug/surveys",
        destination: "/:orgSlug/portal/surveys",
      },
      // Public portal – survey detail (the public-facing survey form)
      {
        source: "/:orgSlug/surveys/:id",
        destination: "/:orgSlug/portal/surveys/:id",
      },
    ];
  },
};

export default nextConfig;

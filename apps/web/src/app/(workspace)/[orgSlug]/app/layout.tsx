/**
 * /:orgSlug/app/* — Staff workspace shell layout
 *
 * This layout wraps all staff-facing workspace pages (inbox, themes, roadmap,
 * dashboard, digest, etc.).  It is a transparent pass-through: the actual
 * navigation shell is provided by the parent /:orgSlug/layout.tsx which
 * renders the top nav and main content wrapper.
 *
 * A separate layout file is required here so that Next.js can apply any
 * future segment-specific metadata, loading UI, or error boundaries without
 * touching the parent shell.
 */
export default function WorkspaceAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Protect workspace-scoped routes and the platform admin control plane:
 *   /:orgSlug/app/*   → staff app (admin, editor, viewer)
 *   /:orgSlug/admin/* → org-admin only
 *   /admin/*          → platform super-admin only
 *
 * On missing token:
 *   - workspace routes redirect to /:orgSlug/login
 *   - platform admin routes redirect to /login
 *
 * Note: role-level guards (admin-only, super-admin-only) are enforced inside
 * each layout via the useCurrentMemberRole / getMe hooks; the middleware only
 * checks token presence so unauthenticated users never see a flash of content.
 */
export function middleware(request: NextRequest) {
  const accessToken = request.cookies.get('accessToken')?.value
  const { pathname } = request.nextUrl

  // ── Platform admin: /admin/* ──────────────────────────────────────────────
  if (pathname.startsWith('/admin') && !accessToken) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // ── Workspace-scoped: /:orgSlug/app/* and /:orgSlug/admin/* ──────────────
  const workspaceProtected = /^\/([^/]+)\/(app|admin)(\/|$)/.exec(pathname)
  if (workspaceProtected && !accessToken) {
    const orgSlug = workspaceProtected[1]
    return NextResponse.redirect(new URL(`/${orgSlug}/login`, request.url))
  }

  return NextResponse.next()
}

export const config = {
  // Apply to all workspace-scoped protected paths and the platform admin panel.
  // Next.js middleware matchers do not support regex directly, so we use
  // explicit patterns. The :path* wildcard handles nested segments.
  matcher: ['/admin/:path*', '/:orgSlug/app/:path*', '/:orgSlug/admin/:path*'],
}

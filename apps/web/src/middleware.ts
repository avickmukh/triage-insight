import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Protect workspace-scoped routes:
 *   /:orgSlug/app/*   → staff app (admin, editor, viewer)
 *   /:orgSlug/admin/* → org-admin only
 *
 * On missing token, redirect to /:orgSlug/login so the user stays
 * in the right workspace context.
 *
 * Note: role-level guards (admin-only) are enforced inside each page/layout
 * via the useWorkspace hook; the middleware only checks token presence.
 */
export function middleware(request: NextRequest) {
  const accessToken = request.cookies.get('accessToken')?.value
  const { pathname } = request.nextUrl

  // Match /:orgSlug/app/* and /:orgSlug/admin/*
  const workspaceProtected = /^\/([^/]+)\/(app|admin)(\/|$)/.exec(pathname)

  if (workspaceProtected && !accessToken) {
    const orgSlug = workspaceProtected[1]
    return NextResponse.redirect(new URL(`/${orgSlug}/login`, request.url))
  }

  return NextResponse.next()
}

export const config = {
  // Apply to all workspace-scoped protected paths.
  // Next.js middleware matchers do not support regex directly, so we use
  // two explicit patterns. The :path* wildcard handles nested segments.
  matcher: ['/:orgSlug/app/:path*', '/:orgSlug/admin/:path*'],
}

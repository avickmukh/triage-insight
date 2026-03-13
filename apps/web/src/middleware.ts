import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const accessToken = request.cookies.get('accessToken')?.value

  if (!accessToken) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

/**
 * Protect:
 *   /:orgSlug/app/*   — workspace staff app
 *   /:orgSlug/admin/* — workspace org-admin
 *
 * Public routes (/:orgSlug/feedback, /:orgSlug/roadmap, /login, /signup, etc.)
 * are NOT matched and remain unauthenticated.
 */
export const config = {
  matcher: [
    '/:orgSlug/app/:path*',
    '/:orgSlug/admin/:path*',
  ],
}

/**
 * token-storage.ts
 *
 * Centralises all token read/write operations so that:
 *  - Axios interceptors (client-side) read from localStorage
 *  - Next.js middleware (server-side) reads from the `accessToken` cookie
 *
 * The cookie is intentionally NOT httpOnly so that client-side JS can
 * write and delete it without a dedicated API route. It is Secure in
 * production (HTTPS) and SameSite=Strict to prevent CSRF.
 *
 * The cookie carries only the access token (short-lived). The refresh
 * token stays in localStorage only — it is never sent automatically by
 * the browser and is only used by the Axios interceptor.
 */

const ACCESS_TOKEN_KEY = "accessToken";
const REFRESH_TOKEN_KEY = "refreshToken";

/** Max-age in seconds for the access token cookie (15 minutes). */
const ACCESS_TOKEN_COOKIE_MAX_AGE = 60 * 15;

function buildCookieString(value: string): string {
  const isProduction = process.env.NODE_ENV === "production";
  const parts = [
    `${ACCESS_TOKEN_KEY}=${encodeURIComponent(value)}`,
    `path=/`,
    `max-age=${ACCESS_TOKEN_COOKIE_MAX_AGE}`,
    `SameSite=Strict`,
  ];
  if (isProduction) parts.push("Secure");
  return parts.join("; ");
}

export function setTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === "undefined") return;
  // localStorage — used by the Axios request interceptor
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  // Cookie — used by Next.js middleware for server-side route protection
  document.cookie = buildCookieString(accessToken);
}

export function setAccessToken(accessToken: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  document.cookie = buildCookieString(accessToken);
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  // Expire the cookie immediately
  document.cookie = `${ACCESS_TOKEN_KEY}=; path=/; max-age=0; SameSite=Strict`;
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

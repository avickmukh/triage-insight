/**
 * /:orgSlug/(auth)/* — Auth pages shell
 *
 * Login, signup, reset-password, and verify pages must NOT inherit the
 * workspace nav header from the parent /:orgSlug/layout.tsx.
 *
 * This layout renders a minimal branding-only header so auth pages look
 * clean and consistent without any workspace navigation.
 */
'use client';
import Link from 'next/link';

export default function WorkspaceAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F8F9FA',
        fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif",
        color: '#0A2540',
      }}
    >
      {/* Minimal branding header — no workspace nav */}
      <header
        style={{
          background: '#0A2540',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '0 1.5rem',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            height: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              textDecoration: 'none',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                background: 'linear-gradient(135deg, #20A4A4 0%, #1a8f8f 100%)',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 4h10M3 8h7M3 12h5"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <span
              style={{
                color: '#fff',
                fontWeight: 700,
                fontSize: '1rem',
                letterSpacing: '-0.01em',
              }}
            >
              Triage<span style={{ color: '#20A4A4' }}>Insight</span>
            </span>
          </Link>
          {/* No nav links on auth pages */}
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

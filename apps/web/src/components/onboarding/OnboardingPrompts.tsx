'use client';
/**
 * OnboardingPrompts
 *
 * Step 5 — Team Invite Prompt
 * Step 6 — Digest Expectation UX
 * Step 7 — Portal Activation Prompt
 *
 * Three lightweight inline banners shown in sequence on the dashboard.
 * Each is independently dismissible via localStorage-backed state.
 */
import Link from 'next/link';

const NAVY  = '#0A2540';
const TEAL  = '#20A4A4';
const GRAY  = '#6C757D';
const GREEN = '#2e7d32';
const PURPLE = '#7c3aed';

// ─── Shared dismiss button ────────────────────────────────────────────────────
function DismissBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Dismiss"
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: GRAY, fontSize: '1rem', lineHeight: 1, padding: '0.1rem 0.2rem',
        flexShrink: 0,
      }}
    >
      ✕
    </button>
  );
}

// ─── Step 5: Team Invite Prompt ───────────────────────────────────────────────
interface TeamInviteProps {
  seen: boolean;
  insightsReviewed: boolean;
  memberCount: number;
  inviteHref: string;
  onSeen: () => void;
}

export function TeamInvitePrompt({
  seen,
  insightsReviewed,
  memberCount,
  inviteHref,
  onSeen,
}: TeamInviteProps) {
  // Show only after first insight reviewed and team is still solo
  if (seen || !insightsReviewed || memberCount > 1) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '0.875rem',
      padding: '0.875rem 1.25rem',
      background: '#f0fdf4',
      border: '1px solid #a7f3d0',
      borderLeft: `3px solid ${GREEN}`,
      borderRadius: '0.75rem',
      marginBottom: '1.25rem',
    }}>
      <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>👥</span>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: '0.875rem', fontWeight: 700, color: NAVY, margin: '0 0 0.2rem' }}>
          Share insights with your team
        </p>
        <p style={{ fontSize: '0.78rem', color: GRAY, margin: '0 0 0.5rem', lineHeight: 1.5 }}>
          You&apos;re the only member right now. Invite your PM, engineering lead, or customer success team
          so they can act on these insights directly.
        </p>
        <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
          <Link
            href={inviteHref}
            onClick={onSeen}
            style={{
              padding: '0.35rem 0.875rem',
              borderRadius: '0.4rem',
              background: GREEN,
              color: '#fff',
              fontSize: '0.78rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Invite team →
          </Link>
          <button
            onClick={onSeen}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: GRAY, padding: 0 }}
          >
            Maybe later
          </button>
        </div>
      </div>
      <DismissBtn onClick={onSeen} />
    </div>
  );
}

// ─── Step 6: Digest Expectation UX ───────────────────────────────────────────
interface DigestProps {
  seen: boolean;
  themeCount: number;
  digestHref: string;
  onSeen: () => void;
}

export function DigestExpectationBanner({ seen, themeCount, digestHref, onSeen }: DigestProps) {
  // Show once themes exist and the user hasn't seen this yet
  if (seen || themeCount === 0) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '0.875rem',
      padding: '0.875rem 1.25rem',
      background: '#faf5ff',
      border: '1px solid #e9d5ff',
      borderLeft: `3px solid ${PURPLE}`,
      borderRadius: '0.75rem',
      marginBottom: '1.25rem',
    }}>
      <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>📬</span>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: '0.875rem', fontWeight: 700, color: NAVY, margin: '0 0 0.2rem' }}>
          Your weekly intelligence digest is set up
        </p>
        <p style={{ fontSize: '0.78rem', color: GRAY, margin: '0 0 0.5rem', lineHeight: 1.5 }}>
          Every Monday at 8 AM UTC, TriageInsight emails your team a digest with the top 5 themes,
          sentiment trends, and priority changes from the past week. No action needed — it runs automatically.
        </p>
        <Link
          href={digestHref}
          onClick={onSeen}
          style={{
            fontSize: '0.75rem', color: PURPLE, fontWeight: 600, textDecoration: 'underline',
          }}
        >
          Preview digest settings →
        </Link>
      </div>
      <DismissBtn onClick={onSeen} />
    </div>
  );
}

// ─── Step 7: Portal Activation Prompt ────────────────────────────────────────
interface PortalProps {
  seen: boolean;
  themeCount: number;
  orgSlug: string;
  portalSettingsHref: string;
  onSeen: () => void;
}

export function PortalActivationPrompt({
  seen,
  themeCount,
  orgSlug,
  portalSettingsHref,
  onSeen,
}: PortalProps) {
  // Show once insights exist and user hasn't seen this yet
  if (seen || themeCount === 0) return null;

  const portalUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/${orgSlug}/portal/feedback`;

  const handleCopy = () => {
    navigator.clipboard.writeText(portalUrl).catch(() => {/* ignore */});
    onSeen();
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '0.875rem',
      padding: '0.875rem 1.25rem',
      background: '#eff6ff',
      border: '1px solid #bfdbfe',
      borderLeft: `3px solid ${TEAL}`,
      borderRadius: '0.75rem',
      marginBottom: '1.25rem',
    }}>
      <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>🔗</span>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: '0.875rem', fontWeight: 700, color: NAVY, margin: '0 0 0.2rem' }}>
          Share your feedback portal with customers
        </p>
        <p style={{ fontSize: '0.78rem', color: GRAY, margin: '0 0 0.5rem', lineHeight: 1.5 }}>
          Your public feedback portal is ready. Share the link with customers so they can submit
          feedback directly — it feeds straight into your AI analysis pipeline.
        </p>
        {/* Portal URL display */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.4rem 0.75rem',
          background: '#fff',
          border: '1px solid #bfdbfe',
          borderRadius: '0.4rem',
          marginBottom: '0.5rem',
          flexWrap: 'wrap',
        }}>
          <code style={{ fontSize: '0.75rem', color: NAVY, flex: 1, wordBreak: 'break-all' }}>
            {portalUrl}
          </code>
          <button
            onClick={handleCopy}
            style={{
              padding: '0.25rem 0.625rem',
              borderRadius: '0.3rem',
              border: `1px solid ${TEAL}`,
              background: '#fff',
              color: TEAL,
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Copy link
          </button>
        </div>
        <div style={{ display: 'flex', gap: '0.875rem', alignItems: 'center' }}>
          <Link
            href={portalSettingsHref}
            onClick={onSeen}
            style={{ fontSize: '0.75rem', color: TEAL, fontWeight: 600, textDecoration: 'underline' }}
          >
            Configure portal →
          </Link>
          <button
            onClick={onSeen}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: GRAY, padding: 0 }}
          >
            Got it
          </button>
        </div>
      </div>
      <DismissBtn onClick={onSeen} />
    </div>
  );
}

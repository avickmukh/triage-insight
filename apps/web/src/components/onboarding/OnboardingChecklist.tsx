'use client';
/**
 * OnboardingChecklist
 *
 * Step 1 — Post-signup activation checklist
 * Step 2 — Data ingestion guidance (CSV + Slack)
 *
 * Shown at the top of the dashboard until dismissed or all steps complete.
 * Uses localStorage for persistence (no backend changes required).
 */
import Link from 'next/link';
import type { OnboardingState } from './use-onboarding';

// ─── Design tokens (match dashboard) ─────────────────────────────────────────
const NAVY  = '#0A2540';
const TEAL  = '#20A4A4';
const GRAY  = '#6C757D';
const BORDER = '#e9ecef';

interface Props {
  state: OnboardingState;
  feedbackCount: number;
  themeCount: number;
  memberCount: number;
  routes: {
    inboxNew: string;
    inbox: string;
    intelligenceThemes: string;
    adminMembers: string;
    adminIntegrations: string;
  };
  onMarkStep: (step: keyof OnboardingState['steps'], value?: boolean) => void;
  onDismiss: () => void;
}

interface StepItemProps {
  done: boolean;
  label: string;
  hint: string;
  cta: string;
  href: string;
  onClick?: () => void;
}

function StepItem({ done, label, hint, cta, href, onClick }: StepItemProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
      padding: '0.75rem 0',
      borderBottom: `1px solid ${BORDER}`,
    }}>
      {/* Checkbox circle */}
      <div style={{
        flexShrink: 0,
        width: 22, height: 22,
        borderRadius: '50%',
        border: done ? 'none' : `2px solid ${TEAL}`,
        background: done ? TEAL : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginTop: 2,
      }}>
        {done && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      {/* Text */}
      <div style={{ flex: 1 }}>
        <p style={{
          margin: '0 0 0.15rem',
          fontSize: '0.875rem',
          fontWeight: done ? 500 : 700,
          color: done ? GRAY : NAVY,
          textDecoration: done ? 'line-through' : 'none',
        }}>
          {label}
        </p>
        <p style={{ margin: 0, fontSize: '0.78rem', color: GRAY, lineHeight: 1.5 }}>{hint}</p>
      </div>
      {/* CTA */}
      {!done && (
        <Link
          href={href}
          onClick={onClick}
          style={{
            flexShrink: 0,
            padding: '0.35rem 0.875rem',
            borderRadius: '0.4rem',
            background: TEAL,
            color: '#fff',
            fontSize: '0.78rem',
            fontWeight: 600,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {cta}
        </Link>
      )}
    </div>
  );
}

export function OnboardingChecklist({
  state,
  feedbackCount,
  themeCount,
  memberCount,
  routes,
  onMarkStep,
  onDismiss,
}: Props) {
  const completedCount = Object.values(state.steps).filter(Boolean).length;
  const totalSteps = 3;
  const pct = Math.round((completedCount / totalSteps) * 100);

  // Auto-detect completion from live data
  const feedbackDone = state.steps.feedbackImported || feedbackCount > 0;
  const insightsDone = state.steps.insightsReviewed || themeCount > 0;
  const teamDone     = state.steps.teamInvited      || memberCount > 1;

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${BORDER}`,
      borderLeft: `3px solid ${TEAL}`,
      borderRadius: '0.875rem',
      padding: '1.25rem 1.5rem',
      boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
      marginBottom: '1.25rem',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, color: NAVY, margin: '0 0 0.2rem' }}>
            Get started with TriageInsight
          </h2>
          <p style={{ fontSize: '0.8rem', color: GRAY, margin: 0 }}>
            Complete these steps to unlock your first product insights.
          </p>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss onboarding checklist"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: GRAY, fontSize: '1.1rem', lineHeight: 1, padding: '0.1rem 0.2rem',
          }}
        >
          ✕
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: '0.875rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
          <span style={{ fontSize: '0.72rem', color: GRAY }}>{completedCount} of {totalSteps} complete</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: TEAL }}>{pct}%</span>
        </div>
        <div style={{ height: 6, background: '#e9ecef', borderRadius: 3 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: TEAL, borderRadius: 3, transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Steps */}
      <StepItem
        done={feedbackDone}
        label="Import your feedback"
        hint="Upload a CSV or connect Slack to bring in historical customer feedback."
        cta="Import CSV"
        href={routes.inbox}
        onClick={() => onMarkStep('feedbackImported')}
      />

      {/* Step 2 — Data ingestion guidance */}
      {!feedbackDone && (
        <div style={{
          margin: '0.5rem 0 0.75rem',
          padding: '0.75rem 1rem',
          background: '#f0f9ff',
          border: '1px solid #bae6fd',
          borderRadius: '0.625rem',
          display: 'flex',
          gap: '1.5rem',
          flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0369a1', margin: '0 0 0.2rem' }}>
              📄 CSV Import — fastest way to start
            </p>
            <p style={{ fontSize: '0.75rem', color: '#0c4a6e', margin: '0 0 0.4rem', lineHeight: 1.5 }}>
              Export feedback from Intercom, Zendesk, or any spreadsheet. Columns needed: <code style={{ background: '#e0f2fe', padding: '0 3px', borderRadius: 3 }}>title</code>, <code style={{ background: '#e0f2fe', padding: '0 3px', borderRadius: 3 }}>description</code>, <code style={{ background: '#e0f2fe', padding: '0 3px', borderRadius: 3 }}>customerEmail</code>.
            </p>
            <Link href={routes.inbox} style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: 600, textDecoration: 'underline' }}>
              Go to Feedback Inbox →
            </Link>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#7c3aed', margin: '0 0 0.2rem' }}>
              💬 Slack Connect — ongoing ingestion
            </p>
            <p style={{ fontSize: '0.75rem', color: '#4c1d95', margin: '0 0 0.4rem', lineHeight: 1.5 }}>
              Connect a Slack channel and TriageInsight will automatically ingest new feedback as it arrives.
            </p>
            <Link href={routes.adminIntegrations} style={{ fontSize: '0.75rem', color: '#7c3aed', fontWeight: 600, textDecoration: 'underline' }}>
              Connect Slack →
            </Link>
          </div>
        </div>
      )}

      <StepItem
        done={insightsDone}
        label="Review your first insights"
        hint="Once feedback is imported, AI will cluster it into themes automatically."
        cta="View themes"
        href={routes.intelligenceThemes}
        onClick={() => onMarkStep('insightsReviewed')}
      />

      <StepItem
        done={teamDone}
        label="Invite your team"
        hint="Share insights with your PM, engineering lead, or customer success team."
        cta="Invite team"
        href={routes.adminMembers}
        onClick={() => onMarkStep('teamInvited')}
      />

      {/* All done state */}
      {feedbackDone && insightsDone && teamDone && (
        <div style={{ marginTop: '0.875rem', padding: '0.625rem 0.875rem', background: '#f0fdf4', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1rem' }}>🎉</span>
          <p style={{ fontSize: '0.82rem', color: '#065f46', fontWeight: 600, margin: 0 }}>
            You&apos;re all set! Your workspace is ready for pilot use.
          </p>
        </div>
      )}
    </div>
  );
}

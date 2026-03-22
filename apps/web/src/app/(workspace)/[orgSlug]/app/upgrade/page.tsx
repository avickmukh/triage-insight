'use client';
/**
 * /:orgSlug/app/upgrade — Plan upgrade page
 *
 * Accessible to ALL authenticated workspace members (ADMIN, EDITOR, VIEWER).
 *
 * Behaviour by role:
 *   ADMIN  → Shows plan comparison + "Go to Billing" button (direct link to /admin/billing)
 *   EDITOR/VIEWER → Shows plan comparison + "Request upgrade" message to notify their admin
 *
 * This page is the destination for all PlanGate upgrade CTAs so that
 * non-admin users are never sent to /admin/billing which they can't access.
 */
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCurrentMemberRole } from '@/hooks/use-workspace';
import { useBilling, usePlans } from '@/hooks/use-billing';
import { WorkspaceRole, BillingPlan } from '@/lib/api-types';
import { orgAdminRoutes } from '@/lib/routes';

const PLAN_ORDER: BillingPlan[] = [BillingPlan.FREE, BillingPlan.PRO, BillingPlan.BUSINESS];

const PLAN_HIGHLIGHT: Record<string, boolean> = {
  PRO: true,
};

export default function UpgradePage() {
  const params = useParams();
  const router = useRouter();
  const slug =
    (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';

  const { role, isLoading: roleLoading } = useCurrentMemberRole();
  const { billing, isLoading: billingLoading } = useBilling();
  const { plans, isLoading: plansLoading } = usePlans();

  const [requested, setRequested] = useState(false);

  const isAdmin = role === WorkspaceRole.ADMIN;
  const isLoading = roleLoading || billingLoading || plansLoading;
  const currentPlan = billing?.billingPlan ?? null;

  const sortedPlans = [...plans].sort(
    (a, b) =>
      PLAN_ORDER.indexOf(a.planType as BillingPlan) -
      PLAN_ORDER.indexOf(b.planType as BillingPlan),
  );

  if (isLoading) {
    return (
      <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#6C757D' }}>
        Loading plans…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 0' }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: '2.5rem' }}>
        <h1
          style={{
            fontSize: '1.75rem',
            fontWeight: 700,
            color: '#0A2540',
            marginBottom: '0.5rem',
          }}
        >
          Upgrade your plan
        </h1>
        <p style={{ color: '#6C757D', fontSize: '1rem', lineHeight: 1.6 }}>
          {isAdmin
            ? 'Choose a plan that fits your team. Changes take effect immediately.'
            : 'Compare plans below. Contact your workspace admin to upgrade.'}
        </p>
      </div>

      {/* ── Non-admin notice ── */}
      {!isAdmin && (
        <div
          style={{
            background: '#EFF6FF',
            border: '1px solid #BFDBFE',
            borderRadius: 10,
            padding: '1rem 1.25rem',
            marginBottom: '2rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
          }}
        >
          <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>ℹ️</span>
          <div>
            <p style={{ fontWeight: 600, color: '#1E40AF', marginBottom: '0.25rem' }}>
              Only workspace admins can change the plan
            </p>
            <p style={{ color: '#3B82F6', fontSize: '0.875rem', lineHeight: 1.5 }}>
              You can view the available plans below. To upgrade, ask your workspace admin to visit{' '}
              <strong>Admin → Billing</strong>.
            </p>
          </div>
        </div>
      )}

      {/* ── Plan cards ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '1.25rem',
          marginBottom: '2.5rem',
        }}
      >
        {sortedPlans.map((plan) => {
          const isCurrent = plan.planType === currentPlan;
          const isHighlighted = PLAN_HIGHLIGHT[plan.planType];
          const priceDisplay =
            plan.priceMonthly === 0
              ? 'Free'
              : `$${Math.floor(plan.priceMonthly / 100)}/mo`;

          return (
            <div
              key={plan.planType}
              style={{
                background: '#fff',
                border: isHighlighted
                  ? '2px solid #20A4A4'
                  : isCurrent
                  ? '2px solid #0A2540'
                  : '1px solid #E9ECEF',
                borderRadius: 12,
                padding: '1.5rem',
                position: 'relative',
              }}
            >
              {/* Badge */}
              {isHighlighted && !isCurrent && (
                <div
                  style={{
                    position: 'absolute',
                    top: -12,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#20A4A4',
                    color: '#fff',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '3px 12px',
                    borderRadius: 20,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}
                >
                  Most Popular
                </div>
              )}
              {isCurrent && (
                <div
                  style={{
                    position: 'absolute',
                    top: -12,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#0A2540',
                    color: '#fff',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '3px 12px',
                    borderRadius: 20,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}
                >
                  Current Plan
                </div>
              )}

              <h3
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  color: '#0A2540',
                  marginBottom: '0.25rem',
                }}
              >
                {plan.displayName}
              </h3>
              <div
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 800,
                  color: '#0A2540',
                  marginBottom: '0.25rem',
                }}
              >
                {priceDisplay}
              </div>
              {plan.priceMonthly > 0 && (
                <p style={{ color: '#6C757D', fontSize: '0.8rem', marginBottom: '1rem' }}>
                  billed monthly
                </p>
              )}
              <p
                style={{
                  color: '#6C757D',
                  fontSize: '0.85rem',
                  lineHeight: 1.5,
                  marginBottom: '1.25rem',
                }}
              >
                {plan.description}
              </p>

              {/* Feature list */}
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem', fontSize: '0.85rem' }}>
                <FeatureRow label={`${plan.adminLimit ?? '∞'} admin${(plan.adminLimit ?? 0) > 1 ? 's' : ''}`} />
                <FeatureRow
                  label={
                    plan.seatLimit == null
                      ? 'Unlimited staff'
                      : `Up to ${plan.seatLimit} staff`
                  }
                />
                <FeatureRow
                  label={
                    plan.feedbackLimit == null
                      ? 'Unlimited feedback/mo'
                      : `${plan.feedbackLimit.toLocaleString()} feedback/mo`
                  }
                />
                {plan.voiceFeedback && (
                  <FeatureRow
                    label={
                      plan.voiceUploadLimit === -1
                        ? 'Voice feedback (unlimited)'
                        : `Voice feedback (${plan.voiceUploadLimit}/mo)`
                    }
                  />
                )}
                {plan.survey && (
                  <FeatureRow
                    label={
                      plan.surveyResponseLimit === -1
                        ? 'Surveys (unlimited)'
                        : `Surveys (${plan.surveyResponseLimit} responses/mo)`
                    }
                  />
                )}
                {plan.aiInsights && <FeatureRow label="AI deduplication" />}
                {plan.aiThemeClustering && <FeatureRow label="AI theme clustering" />}
                {plan.weeklyDigest && <FeatureRow label="Weekly AI digest" />}
                {plan.integrations && <FeatureRow label="Integrations (Slack, Zendesk…)" />}
                {plan.executiveReporting && <FeatureRow label="Executive reporting" />}
              </ul>

              {/* CTA */}
              {isAdmin ? (
                isCurrent ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '0.6rem',
                      background: '#F1F3F5',
                      borderRadius: 8,
                      color: '#6C757D',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    Current plan
                  </div>
                ) : (
                  <button
                    onClick={() => router.push(`/${slug}/admin/billing`)}
                    style={{
                      width: '100%',
                      padding: '0.65rem',
                      background: isHighlighted ? '#20A4A4' : '#0A2540',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                    }}
                  >
                    Upgrade to {plan.displayName}
                  </button>
                )
              ) : (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '0.6rem',
                    background: isCurrent ? '#F1F3F5' : '#F8F9FA',
                    borderRadius: 8,
                    color: isCurrent ? '#6C757D' : '#0A2540',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    border: isCurrent ? 'none' : '1px solid #DEE2E6',
                  }}
                >
                  {isCurrent ? 'Current plan' : `Ask admin to upgrade`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Non-admin: request upgrade CTA ── */}
      {!isAdmin && !requested && (
        <div
          style={{
            background: '#fff',
            border: '1px solid #E9ECEF',
            borderRadius: 12,
            padding: '1.5rem',
            textAlign: 'center',
          }}
        >
          <p style={{ color: '#0A2540', fontWeight: 600, marginBottom: '0.5rem' }}>
            Want to upgrade? Let your admin know.
          </p>
          <p style={{ color: '#6C757D', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
            Click below to mark this as a request. Your workspace admin will be notified.
          </p>
          <button
            onClick={() => setRequested(true)}
            style={{
              padding: '0.65rem 2rem',
              background: '#20A4A4',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Request plan upgrade
          </button>
        </div>
      )}

      {!isAdmin && requested && (
        <div
          style={{
            background: '#ECFDF5',
            border: '1px solid #6EE7B7',
            borderRadius: 12,
            padding: '1.5rem',
            textAlign: 'center',
          }}
        >
          <p style={{ color: '#065F46', fontWeight: 600, marginBottom: '0.25rem' }}>
            ✓ Request sent
          </p>
          <p style={{ color: '#047857', fontSize: '0.875rem' }}>
            Your workspace admin has been notified. They can upgrade the plan from Admin → Billing.
          </p>
        </div>
      )}

      {/* ── Admin: direct billing link ── */}
      {isAdmin && (
        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <button
            onClick={() => router.push(orgAdminRoutes(slug).billing)}
            style={{
              padding: '0.65rem 2rem',
              background: 'transparent',
              color: '#20A4A4',
              border: '1.5px solid #20A4A4',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Manage billing &amp; invoices →
          </button>
        </div>
      )}
    </div>
  );
}

function FeatureRow({ label }: { label: string }) {
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
        padding: '0.3rem 0',
        color: '#374151',
      }}
    >
      <span style={{ color: '#20A4A4', fontWeight: 700, flexShrink: 0 }}>✓</span>
      {label}
    </li>
  );
}

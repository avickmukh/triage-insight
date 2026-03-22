'use client';
import { useState } from 'react';
import { useBilling, usePlans, useUpdateBillingEmail, useRequestPlanChange } from '@/hooks/use-billing';
import {
  BillingPlan,
  BillingStatus,
  PlanConfig,
  TrialStatus,
} from '@/lib/api-types';

// ── Design tokens (matches existing admin design system) ──────────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
};
const SECTION_TITLE: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
  color: '#0A2540',
  marginBottom: '1.25rem',
};
const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#6C757D',
  marginBottom: '0.4rem',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
};
const VALUE: React.CSSProperties = {
  fontSize: '0.92rem',
  color: '#0A2540',
  fontWeight: 500,
};
const INPUT: React.CSSProperties = {
  width: '100%',
  padding: '0.65rem 0.9rem',
  borderRadius: '0.5rem',
  border: '1px solid #dee2e6',
  fontSize: '0.9rem',
  color: '#0A2540',
  outline: 'none',
  boxSizing: 'border-box',
  background: '#fff',
};
const BTN_PRIMARY: React.CSSProperties = {
  padding: '0.65rem 1.5rem',
  borderRadius: '0.5rem',
  border: 'none',
  background: '#FFC832',
  color: '#0A2540',
  fontWeight: 700,
  fontSize: '0.88rem',
  cursor: 'pointer',
};
const BTN_DISABLED: React.CSSProperties = {
  ...BTN_PRIMARY,
  opacity: 0.5,
  cursor: 'not-allowed',
};
const BTN_SECONDARY: React.CSSProperties = {
  padding: '0.65rem 1.5rem',
  borderRadius: '0.5rem',
  border: '1px solid #dee2e6',
  background: 'transparent',
  color: '#0A2540',
  fontWeight: 600,
  fontSize: '0.88rem',
  cursor: 'pointer',
};
const HINT: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#6C757D',
  marginTop: '0.3rem',
};

// ── Plan metadata ─────────────────────────────────────────────────────────────
const PLAN_PRICES: Record<string, string> = {
  [BillingPlan.FREE]: '$0 / month',
  [BillingPlan.PRO]: '$29 / month',
  [BillingPlan.BUSINESS]: '$49 / month',
};

const STATUS_BADGE: Record<BillingStatus, { label: string; bg: string; color: string }> = {
  [BillingStatus.TRIALING]: { label: 'Trialing', bg: '#e0f2fe', color: '#0369a1' },
  [BillingStatus.ACTIVE]: { label: 'Active', bg: '#d1fae5', color: '#065f46' },
  [BillingStatus.PAST_DUE]: { label: 'Past Due', bg: '#fff7ed', color: '#c2410c' },
  [BillingStatus.CANCELED]: { label: 'Canceled', bg: '#fee2e2', color: '#991b1b' },
  [BillingStatus.UNPAID]: { label: 'Unpaid', bg: '#fee2e2', color: '#991b1b' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function FeatureValue({ value }: { value: number | null | boolean | undefined }) {
  // null, undefined, or -1 all mean "unlimited"
  if (value === null || value === undefined || value === -1)
    return <span style={{ color: '#10b981', fontWeight: 600 }}>∞ Unlimited</span>;
  if (value === true)
    return <span style={{ color: '#10b981', fontWeight: 600 }}>✓ Included</span>;
  if (value === false)
    return <span style={{ color: '#adb5bd' }}>– Not included</span>;
  if (value === 0)
    return <span style={{ color: '#adb5bd' }}>– Not included</span>;
  return <span style={{ fontWeight: 600 }}>{(value as number).toLocaleString()}</span>;
}

function Skeleton({ width = '60%', height = '1rem' }: { width?: string; height?: string }) {
  return (
    <div
      style={{
        height,
        width,
        background: '#f1f3f5',
        borderRadius: '0.4rem',
        display: 'inline-block',
      }}
    />
  );
}

// ── Plan features table (DB-driven) ──────────────────────────────────────────
function PlanFeaturesTable({ planConfig }: { planConfig: PlanConfig | Omit<PlanConfig, 'planType' | 'isActive' | 'isDefault'> }) {
  const rows: Array<{ label: string; value: number | null | boolean | undefined }> = [
    { label: 'Admin limit', value: planConfig.adminLimit },
    { label: 'Staff seats', value: planConfig.seatLimit },
    { label: 'Feedback limit / month', value: planConfig.feedbackLimit },
    { label: 'AI usage limit', value: planConfig.aiUsageLimit },
    { label: 'Voice uploads / month', value: planConfig.voiceUploadLimit },
    { label: 'Survey responses / month', value: planConfig.surveyResponseLimit },
    { label: 'AI insights', value: planConfig.aiInsights },
    { label: 'AI theme clustering', value: planConfig.aiThemeClustering },
    { label: 'CIQ prioritization', value: planConfig.ciqPrioritization },
    { label: 'Explainable AI scores', value: planConfig.explainableAi },
    { label: 'Weekly AI digest', value: planConfig.weeklyDigest },
    { label: 'Voice feedback', value: planConfig.voiceFeedback },
    { label: 'Survey', value: planConfig.survey },
    { label: 'Integrations', value: planConfig.integrations },
    { label: 'Public portal', value: planConfig.publicPortal },
    { label: 'CSV import', value: planConfig.csvImport },
    { label: 'API access', value: planConfig.apiAccess },
    { label: 'Executive reporting', value: planConfig.executiveReporting },
    { label: 'Custom domain', value: planConfig.customDomain },
  ];

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
      <tbody>
        {rows.map(({ label, value }) => (
          <tr key={label} style={{ borderBottom: '1px solid #f1f3f5' }}>
            <td style={{ padding: '0.55rem 0', color: '#6C757D', width: '55%' }}>{label}</td>
            <td style={{ padding: '0.55rem 0', color: '#0A2540', textAlign: 'right' }}>
              <FeatureValue value={value} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Plan comparison table (all active plans from DB) ─────────────────────────
function PlanComparisonTable({
  plans,
  currentPlan,
  onSelect,
  isPending,
}: {
  plans: PlanConfig[];
  currentPlan: BillingPlan;
  onSelect: (plan: BillingPlan) => void;
  isPending: boolean;
}) {
  const featureRows: Array<{ key: keyof PlanConfig; label: string }> = [
    { key: 'adminLimit', label: 'Admins' },
    { key: 'seatLimit', label: 'Staff seats' },
    { key: 'feedbackLimit', label: 'Feedback / month' },
    { key: 'voiceUploadLimit', label: 'Voice uploads / month' },
    { key: 'surveyResponseLimit', label: 'Survey responses / month' },
    { key: 'aiInsights', label: 'AI insights' },
    { key: 'aiThemeClustering', label: 'AI theme clustering' },
    { key: 'ciqPrioritization', label: 'CIQ prioritization' },
    { key: 'weeklyDigest', label: 'Weekly AI digest' },
    { key: 'voiceFeedback', label: 'Voice feedback' },
    { key: 'survey', label: 'Survey' },
    { key: 'integrations', label: 'Integrations' },
    { key: 'executiveReporting', label: 'Executive reporting' },
  ];

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: '560px' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.5rem 0', color: '#6C757D', fontWeight: 600, width: '30%' }}>
              Feature
            </th>
            {plans.map((p) => (
              <th
                key={p.planType}
                style={{
                  textAlign: 'center',
                  padding: '0.5rem 0.5rem',
                  color: p.planType === currentPlan ? '#0A2540' : '#6C757D',
                  fontWeight: p.planType === currentPlan ? 800 : 600,
                }}
              >
                {p.displayName}
                {p.planType === currentPlan && (
                  <span
                    style={{
                      display: 'block',
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      color: '#10b981',
                      marginTop: '0.1rem',
                    }}
                  >
                    Current
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {featureRows.map(({ key, label }) => (
            <tr key={key} style={{ borderBottom: '1px solid #f1f3f5' }}>
              <td style={{ padding: '0.5rem 0', color: '#6C757D' }}>{label}</td>
              {plans.map((p) => (
                <td key={p.planType} style={{ padding: '0.5rem', textAlign: 'center' }}>
                  <FeatureValue value={p[key] as number | null | boolean} />
                </td>
              ))}
            </tr>
          ))}
          {/* CTA row */}
          <tr>
            <td />
            {plans.map((p) => (
              <td key={p.planType} style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                {p.planType === currentPlan ? (
                  <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 600 }}>
                    Current plan
                  </span>
                ) : (
                  <button
                    style={isPending ? BTN_DISABLED : BTN_PRIMARY}
                    disabled={isPending}
                    onClick={() => onSelect(p.planType)}
                  >
                    {isPending ? 'Requesting…' : `Switch to ${p.displayName}`}
                  </button>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Billing email form ────────────────────────────────────────────────────────
function BillingEmailForm({ currentEmail }: { currentEmail: string | null }) {
  const [email, setEmail] = useState(currentEmail ?? '');
  const [saved, setSaved] = useState(false);
  const { mutate, isPending, isError, error } = useUpdateBillingEmail();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    mutate(
      { billingEmail: email.trim() },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
        },
      },
    );
  };

  const isDirty = email.trim() !== (currentEmail ?? '');

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div>
        <label style={LABEL}>Billing contact email</label>
        <input
          style={INPUT}
          type="email"
          placeholder="billing@yourcompany.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setSaved(false);
          }}
        />
        <p style={HINT}>Invoices and billing notifications will be sent to this address.</p>
      </div>
      {isError && (
        <p style={{ fontSize: '0.82rem', color: '#dc3545', margin: 0 }}>
          {(error as Error)?.message ?? 'Failed to update billing email.'}
        </p>
      )}
      {saved && (
        <p style={{ fontSize: '0.82rem', color: '#065f46', margin: 0 }}>Billing email updated.</p>
      )}
      <div>
        <button
          type="submit"
          style={isPending || !isDirty || !email.trim() ? BTN_DISABLED : BTN_PRIMARY}
          disabled={isPending || !isDirty || !email.trim()}
        >
          {isPending ? 'Saving…' : 'Save email'}
        </button>
      </div>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function BillingPage() {
  const { billing, isLoading, isError, error } = useBilling();
  const { plans, isLoading: plansLoading } = usePlans();
  const { mutate: requestChange, isPending: changePending, data: changeResult, isError: changeError } =
    useRequestPlanChange();

  const [showComparison, setShowComparison] = useState(false);

  if (isLoading) {
    return (
      <div
        style={{
          padding: '2rem',
          maxWidth: '760px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}
      >
        <div style={{ marginBottom: '0.5rem' }}>
          <Skeleton width="30%" height="1.5rem" />
          <div style={{ marginTop: '0.5rem' }}>
            <Skeleton width="55%" height="0.9rem" />
          </div>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Skeleton width="35%" />
            <Skeleton width="70%" height="0.85rem" />
            <Skeleton width="50%" height="0.85rem" />
          </div>
        ))}
      </div>
    );
  }

  if (isError || !billing) {
    return (
      <div style={{ padding: '2rem', maxWidth: '760px', margin: '0 auto' }}>
        <div
          style={{
            background: '#fff5f5',
            border: '1px solid #feb2b2',
            borderRadius: '0.5rem',
            padding: '1rem',
            color: '#c53030',
            fontSize: '0.88rem',
          }}
        >
          Failed to load billing information:{' '}
          {(error as Error)?.message ?? 'Unknown error'}
        </div>
      </div>
    );
  }

  const statusBadge = STATUS_BADGE[billing.billingStatus];
  const isTrialing = billing.billingStatus === BillingStatus.TRIALING;
  const trialExpired =
    billing.trialStatus === TrialStatus.EXPIRED ||
    (isTrialing && billing.trialDaysRemaining === 0);

  return (
    <div
      style={{
        padding: '2rem',
        maxWidth: '760px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
      }}
    >
      {/* Page header */}
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0A2540', margin: 0 }}>
          Billing
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#6C757D', marginTop: '0.35rem' }}>
          Manage your workspace subscription, plan, and billing contact.
        </p>
      </div>

      {/* Current plan card */}
      <div style={CARD}>
        <p style={SECTION_TITLE}>Current plan</p>

        {/* Plan name + status badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            flexWrap: 'wrap',
            marginBottom: '1.25rem',
          }}
        >
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0A2540' }}>
              {billing.planConfig.displayName}
            </div>
            <div style={{ fontSize: '0.88rem', color: '#6C757D', marginTop: '0.15rem' }}>
              {PLAN_PRICES[billing.billingPlan] ?? 'Custom pricing'}
            </div>
          </div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.25rem 0.75rem',
              borderRadius: '999px',
              background: statusBadge.bg,
              color: statusBadge.color,
              fontSize: '0.78rem',
              fontWeight: 700,
            }}
          >
            {statusBadge.label}
          </span>
        </div>

        {/* Trial banner */}
        {isTrialing && billing.trialEndsAt && (
          <div
            style={{
              background: trialExpired ? '#fff5f5' : '#eff6ff',
              border: `1px solid ${trialExpired ? '#feb2b2' : '#bfdbfe'}`,
              borderRadius: '0.5rem',
              padding: '0.75rem 1rem',
              fontSize: '0.85rem',
              color: trialExpired ? '#c53030' : '#1e40af',
              marginBottom: '1.25rem',
            }}
          >
            {!trialExpired && billing.trialDaysRemaining !== null && billing.trialDaysRemaining > 0
              ? `Your free trial ends in ${billing.trialDaysRemaining} day${
                  billing.trialDaysRemaining === 1 ? '' : 's'
                } (${formatDate(billing.trialEndsAt)}).`
              : `Your free trial ended on ${formatDate(billing.trialEndsAt)}.`}{' '}
            Upgrade to continue using all features.
          </div>
        )}

        {/* Trial start date */}
        {billing.trialStartedAt && (
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div>
              <span style={LABEL}>Trial started</span>
              <span style={VALUE}>{formatDate(billing.trialStartedAt)}</span>
            </div>
            {billing.trialEndsAt && (
              <div>
                <span style={LABEL}>Trial ends</span>
                <span style={VALUE}>{formatDate(billing.trialEndsAt)}</span>
              </div>
            )}
          </div>
        )}

        {/* Past due / canceled / unpaid banner */}
        {(billing.billingStatus === BillingStatus.PAST_DUE ||
          billing.billingStatus === BillingStatus.UNPAID ||
          billing.billingStatus === BillingStatus.CANCELED) && (
          <div
            style={{
              background: '#fff5f5',
              border: '1px solid #feb2b2',
              borderRadius: '0.5rem',
              padding: '0.75rem 1rem',
              fontSize: '0.85rem',
              color: '#c53030',
              marginBottom: '1.25rem',
            }}
          >
            {billing.billingStatus === BillingStatus.PAST_DUE
              ? 'Your payment is past due. Please update your payment method to avoid service interruption.'
              : billing.billingStatus === BillingStatus.UNPAID
              ? 'Your account has an unpaid invoice. Please settle the outstanding balance.'
              : 'Your subscription has been canceled. Upgrade to restore access.'}
          </div>
        )}

        {/* Current period dates */}
        {billing.currentPeriodStart && billing.currentPeriodEnd && (
          <div
            style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}
          >
            <div>
              <span style={LABEL}>Period start</span>
              <span style={VALUE}>{formatDate(billing.currentPeriodStart)}</span>
            </div>
            <div>
              <span style={LABEL}>Period end</span>
              <span style={VALUE}>{formatDate(billing.currentPeriodEnd)}</span>
            </div>
          </div>
        )}

        {/* Workspace limits */}
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <div>
            <span style={LABEL}>Seat limit</span>
            <span style={VALUE}>
              {billing.seatLimit === 0 ? '∞ Unlimited' : billing.seatLimit.toLocaleString()}
            </span>
          </div>
          <div>
            <span style={LABEL}>AI usage limit</span>
            <span style={VALUE}>
              {billing.aiUsageLimit === 0 ? 'Not included' : billing.aiUsageLimit.toLocaleString()}
            </span>
          </div>
          <div>
            <span style={LABEL}>Stripe customer</span>
            <span style={VALUE}>
              {billing.hasStripeCustomer ? (
                <span style={{ color: '#10b981', fontWeight: 600 }}>✓ Linked</span>
              ) : (
                <span style={{ color: '#adb5bd' }}>Not linked</span>
              )}
            </span>
          </div>
        </div>

        {/* Plan change success/error feedback */}
        {changeResult && (
          <div
            style={{
              background: '#d1fae5',
              border: '1px solid #6ee7b7',
              borderRadius: '0.5rem',
              padding: '0.75rem 1rem',
              fontSize: '0.85rem',
              color: '#065f46',
              marginBottom: '1rem',
            }}
          >
            {changeResult.message}
          </div>
        )}
        {changeError && (
          <div
            style={{
              background: '#fff5f5',
              border: '1px solid #feb2b2',
              borderRadius: '0.5rem',
              padding: '0.75rem 1rem',
              fontSize: '0.85rem',
              color: '#c53030',
              marginBottom: '1rem',
            }}
          >
            Failed to submit plan change request. Please try again.
          </div>
        )}

        {/* Upgrade / manage CTAs */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {billing.billingPlan !== BillingPlan.BUSINESS && (
            <button
              style={BTN_PRIMARY}
              onClick={() => setShowComparison((v) => !v)}
            >
              {showComparison ? 'Hide plans' : 'Upgrade plan'}
            </button>
          )}
          {billing.hasStripeCustomer && (
            <button
              style={BTN_SECONDARY}
              onClick={() => alert('Stripe Customer Portal integration coming soon.')}
            >
              Manage subscription
            </button>
          )}
        </div>
      </div>

      {/* Plan comparison table (toggled) */}
      {showComparison && (
        <div style={CARD}>
          <p style={SECTION_TITLE}>Compare plans</p>
          {plansLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} width="100%" height="1.2rem" />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <p style={{ fontSize: '0.88rem', color: '#6C757D' }}>
              No plan configuration found. Contact your administrator.
            </p>
          ) : (
            <PlanComparisonTable
              plans={plans}
              currentPlan={billing.billingPlan}
              onSelect={(targetPlan) =>
                requestChange({ targetPlan })
              }
              isPending={changePending}
            />
          )}
        </div>
      )}

      {/* Current plan features card (DB-driven) */}
      <div style={CARD}>
        <p style={SECTION_TITLE}>
          Plan features — {billing.planConfig.displayName}
        </p>
        {billing.planConfig.description && (
          <p style={{ fontSize: '0.85rem', color: '#6C757D', marginBottom: '1rem', marginTop: '-0.5rem' }}>
            {billing.planConfig.description}
          </p>
        )}
        <PlanFeaturesTable planConfig={billing.planConfig} />
      </div>

      {/* Billing contact card */}
      <div style={CARD}>
        <p style={SECTION_TITLE}>Billing contact</p>
        <BillingEmailForm currentEmail={billing.billingEmail} />
      </div>
    </div>
  );
}

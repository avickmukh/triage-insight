'use client';
import React from 'react';
import { useBilling } from '@/hooks/use-billing';
import { BillingStatus, TrialStatus } from '@/lib/api-types';

/**
 * TrialBanner
 *
 * Displays a sticky top banner when the workspace is in a free trial.
 * Shows days remaining and a link to the billing page.
 * Disappears when the trial is not active or has converted to a paid plan.
 *
 * Rendered inside the workspace app shell layout.
 */
export function TrialBanner({ orgSlug }: { orgSlug: string }) {
  const { billing, isLoading } = useBilling();

  if (isLoading || !billing) return null;

  const isTrialing = billing.billingStatus === BillingStatus.TRIALING;
  const trialExpired =
    billing.trialStatus === TrialStatus.EXPIRED ||
    (isTrialing && billing.trialDaysRemaining === 0);

  // Only show banner during active trial or when trial has expired
  if (!isTrialing && billing.trialStatus !== TrialStatus.EXPIRED) return null;

  const daysLeft = billing.trialDaysRemaining ?? 0;
  const planName = billing.planConfig?.displayName ?? 'your plan';

  const bgColor = trialExpired ? '#fff5f5' : '#eff6ff';
  const borderColor = trialExpired ? '#feb2b2' : '#bfdbfe';
  const textColor = trialExpired ? '#c53030' : '#1e40af';

  return (
    <div
      style={{
        background: bgColor,
        borderBottom: `1px solid ${borderColor}`,
        padding: '0.55rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        fontSize: '0.875rem',
        color: textColor,
        fontWeight: 500,
        flexWrap: 'wrap',
      }}
    >
      <span>
        {trialExpired
          ? `Your ${planName} trial has ended.`
          : daysLeft === 1
          ? `Your ${planName} trial ends tomorrow.`
          : `Your ${planName} trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`}
      </span>
      <a
        href={`/${orgSlug}/admin/billing`}
        style={{
          padding: '0.3rem 0.9rem',
          background: trialExpired ? '#c53030' : '#1e40af',
          color: '#fff',
          borderRadius: '0.375rem',
          fontWeight: 600,
          fontSize: '0.8rem',
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {trialExpired ? 'Upgrade now' : 'Upgrade to keep access'}
      </a>
    </div>
  );
}

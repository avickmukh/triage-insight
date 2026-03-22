'use client';
import React from 'react';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { PlanConfig, BillingPlan } from '@/lib/api-types';

type BooleanFeatureKey = keyof Pick<
  PlanConfig,
  | 'aiInsights'
  | 'aiThemeClustering'
  | 'ciqPrioritization'
  | 'explainableAi'
  | 'weeklyDigest'
  | 'voiceFeedback'
  | 'survey'
  | 'integrations'
  | 'publicPortal'
  | 'csvImport'
  | 'apiAccess'
  | 'executiveReporting'
  | 'customDomain'
>;

interface PlanGateProps {
  /** The feature flag to check */
  feature: BooleanFeatureKey;
  /** Required plan name shown in the upgrade prompt */
  requiredPlan?: string;
  /** Upgrade link — defaults to the billing admin page */
  upgradeHref?: string;
  children: React.ReactNode;
}

/**
 * PlanGate
 *
 * Wraps a page or section that requires a specific plan feature.
 * Shows an upgrade prompt when the feature is not enabled on the current plan.
 *
 * Usage:
 *   <PlanGate feature="weeklyDigest" requiredPlan="Business">
 *     <DigestContent />
 *   </PlanGate>
 */
export function PlanGate({ feature, requiredPlan, upgradeHref, children }: PlanGateProps) {
  const { enabled, isLoading, plan } = useFeatureFlag(feature);

  if (isLoading) {
    return (
      <div style={{ padding: '3rem 2rem', textAlign: 'center', color: '#6C757D' }}>
        Loading…
      </div>
    );
  }

  if (!enabled) {
    return (
      <UpgradePrompt
        currentPlan={plan}
        requiredPlan={requiredPlan}
        feature={feature}
        upgradeHref={upgradeHref}
      />
    );
  }

  return <>{children}</>;
}

function UpgradePrompt({
  currentPlan,
  requiredPlan,
  feature,
  upgradeHref,
}: {
  currentPlan: string | null;
  requiredPlan?: string;
  feature: string;
  upgradeHref?: string;
}) {
  const featureLabels: Record<string, string> = {
    weeklyDigest: 'Weekly AI Digest',
    voiceFeedback: 'Voice Feedback',
    survey: 'Surveys',
    integrations: 'Integrations',
    aiThemeClustering: 'AI Theme Clustering',
    ciqPrioritization: 'CIQ Prioritization',
    explainableAi: 'Explainable AI Scores',
    executiveReporting: 'Executive Reporting',
    apiAccess: 'API Access',
    customDomain: 'Custom Domain',
  };

  const label = featureLabels[feature] ?? feature;
  const href = upgradeHref ?? 'admin/billing';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '40vh',
        padding: '3rem 2rem',
        textAlign: 'center',
      }}
    >
      {/* Lock icon */}
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: '#f1f3f5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1.5rem',
          fontSize: '1.75rem',
        }}
      >
        🔒
      </div>

      <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0A2540', marginBottom: '0.5rem' }}>
        {label} is not available on your plan
      </h2>

      <p style={{ color: '#6C757D', maxWidth: 420, lineHeight: 1.6, marginBottom: '1.75rem' }}>
        {currentPlan
          ? `Your current plan is ${currentPlan}.`
          : 'Your current plan does not include this feature.'}{' '}
        {requiredPlan
          ? `Upgrade to ${requiredPlan} or higher to unlock ${label}.`
          : `Upgrade your plan to unlock ${label}.`}
      </p>

      <a
        href={href}
        style={{
          display: 'inline-block',
          padding: '0.65rem 1.75rem',
          background: '#0A2540',
          color: '#fff',
          borderRadius: '0.5rem',
          fontWeight: 600,
          fontSize: '0.95rem',
          textDecoration: 'none',
        }}
      >
        View upgrade options
      </a>
    </div>
  );
}

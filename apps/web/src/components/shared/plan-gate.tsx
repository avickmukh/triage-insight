'use client';
import React from 'react';
import { useParams } from 'next/navigation';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { useCurrentMemberRole } from '@/hooks/use-workspace';
import { PlanConfig, WorkspaceRole } from '@/lib/api-types';
import { appRoutes, orgAdminRoutes } from '@/lib/routes';

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
  /** Override the upgrade link (optional — auto-resolved by role if omitted) */
  upgradeHref?: string;
  children: React.ReactNode;
}

/**
 * PlanGate
 *
 * Wraps a page or section that requires a specific plan feature.
 * Shows an upgrade prompt when the feature is not enabled on the current plan.
 *
 * Role-aware upgrade link:
 *   ADMIN        → /:orgSlug/admin/billing   (direct billing management)
 *   EDITOR/VIEWER → /:orgSlug/app/upgrade    (plan comparison + request page)
 *
 * Usage:
 *   <PlanGate feature="weeklyDigest" requiredPlan="Business">
 *     <DigestContent />
 *   </PlanGate>
 */
export function PlanGate({ feature, requiredPlan, upgradeHref, children }: PlanGateProps) {
  const { enabled, isLoading: flagLoading, plan } = useFeatureFlag(feature);
  const { role, isLoading: roleLoading } = useCurrentMemberRole();
  const params = useParams();
  const slug =
    (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';

  const isLoading = flagLoading || roleLoading;

  if (isLoading) {
    return (
      <div style={{ padding: '3rem 2rem', textAlign: 'center', color: '#6C757D' }}>
        Loading…
      </div>
    );
  }

  if (!enabled) {
    // Resolve upgrade destination based on role
    const resolvedHref =
      upgradeHref ??
      (role === WorkspaceRole.ADMIN
        ? orgAdminRoutes(slug).billing
        : appRoutes(slug).upgrade);

    return (
      <UpgradePrompt
        currentPlan={plan}
        requiredPlan={requiredPlan}
        feature={feature}
        upgradeHref={resolvedHref}
        isAdmin={role === WorkspaceRole.ADMIN}
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
  isAdmin,
}: {
  currentPlan: string | null;
  requiredPlan?: string;
  feature: string;
  upgradeHref: string;
  isAdmin: boolean;
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

      <p style={{ color: '#6C757D', maxWidth: 440, lineHeight: 1.6, marginBottom: '0.75rem' }}>
        {currentPlan
          ? `Your current plan is ${currentPlan}.`
          : 'Your current plan does not include this feature.'}{' '}
        {requiredPlan
          ? `Upgrade to ${requiredPlan} or higher to unlock ${label}.`
          : `Upgrade your plan to unlock ${label}.`}
      </p>

      {/* Role-specific sub-message */}
      {!isAdmin && (
        <p style={{ color: '#9CA3AF', fontSize: '0.85rem', maxWidth: 380, marginBottom: '1.5rem' }}>
          Contact your workspace admin to upgrade, or view plan options below.
        </p>
      )}

      <a
        href={upgradeHref}
        style={{
          display: 'inline-block',
          padding: '0.65rem 1.75rem',
          background: '#20A4A4',
          color: '#fff',
          borderRadius: '0.5rem',
          fontWeight: 600,
          fontSize: '0.95rem',
          textDecoration: 'none',
          marginTop: isAdmin ? '1rem' : 0,
        }}
      >
        {isAdmin ? 'Manage billing' : 'View upgrade options'}
      </a>
    </div>
  );
}

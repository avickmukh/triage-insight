'use client';
import { useBilling } from './use-billing';
import { PlanConfig } from '@/lib/api-types';

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

/**
 * useFeatureFlag
 *
 * Returns whether a specific plan feature is enabled for the current workspace.
 * Reads from the billing status cache (GET /billing/status).
 *
 * Usage:
 *   const { enabled, isLoading } = useFeatureFlag('weeklyDigest');
 *   if (!enabled) return <UpgradePrompt />;
 *
 * Returns:
 *   enabled    — true if the feature is included in the workspace's plan
 *   isLoading  — true while billing status is being fetched
 *   plan       — the current plan display name (e.g. "Free", "Pro", "Business")
 */
export const useFeatureFlag = (feature: BooleanFeatureKey) => {
  const { billing, isLoading } = useBilling();

  const enabled = billing?.planConfig?.[feature] ?? false;
  const plan = billing?.planConfig?.displayName ?? null;

  return { enabled, isLoading, plan };
};

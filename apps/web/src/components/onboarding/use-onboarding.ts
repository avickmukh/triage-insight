'use client';
/**
 * useOnboarding
 *
 * Manages the pilot onboarding checklist state using localStorage so it
 * persists across page reloads without any backend changes.
 *
 * State is keyed by workspaceId so each workspace has independent progress.
 */
import { useState, useEffect, useCallback } from 'react';

export interface OnboardingState {
  /** Has the user dismissed the entire onboarding panel? */
  dismissed: boolean;
  /** Individual step completion flags */
  steps: {
    feedbackImported: boolean;
    teamInvited: boolean;
    insightsReviewed: boolean;
  };
  /** Has the user seen the team invite prompt after first insight? */
  invitePromptSeen: boolean;
  /** Has the user seen the digest expectation message? */
  digestPromptSeen: boolean;
  /** Has the user seen the portal activation prompt? */
  portalPromptSeen: boolean;
}

const DEFAULT_STATE: OnboardingState = {
  dismissed: false,
  steps: {
    feedbackImported: false,
    teamInvited: false,
    insightsReviewed: false,
  },
  invitePromptSeen: false,
  digestPromptSeen: false,
  portalPromptSeen: false,
};

function storageKey(workspaceId: string) {
  return `triage_onboarding_v1_${workspaceId}`;
}

function load(workspaceId: string): OnboardingState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(storageKey(workspaceId));
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
  }
}

function save(workspaceId: string, state: OnboardingState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(state));
  } catch {
    // storage quota exceeded — silently ignore
  }
}

export function useOnboarding(workspaceId: string | undefined) {
  const [state, setState] = useState<OnboardingState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    if (!workspaceId) return;
    setState(load(workspaceId));
    setHydrated(true);
  }, [workspaceId]);

  const update = useCallback(
    (patch: Partial<OnboardingState>) => {
      if (!workspaceId) return;
      setState((prev) => {
        const next = { ...prev, ...patch };
        save(workspaceId, next);
        return next;
      });
    },
    [workspaceId],
  );

  const markStep = useCallback(
    (step: keyof OnboardingState['steps'], value = true) => {
      if (!workspaceId) return;
      setState((prev) => {
        const next = {
          ...prev,
          steps: { ...prev.steps, [step]: value },
        };
        save(workspaceId, next);
        return next;
      });
    },
    [workspaceId],
  );

  const dismiss = useCallback(() => update({ dismissed: true }), [update]);

  /** All three checklist items are complete */
  const allComplete =
    state.steps.feedbackImported &&
    state.steps.teamInvited &&
    state.steps.insightsReviewed;

  return { state, hydrated, update, markStep, dismiss, allComplete };
}

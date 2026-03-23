/**
 * Portal Signal Queue
 *
 * All public portal interactions (feedback creation, votes, comments, roadmap
 * status changes) are published as jobs on this queue.  The
 * PortalSignalProcessor consumes them to:
 *   1. Update theme signal weights / sentiment aggregates
 *   2. Emit real-time SSE events to connected portal clients
 *   3. Prepare CIQ-ready fields for later scoring
 *
 * Queue name is exported so every module that needs to produce or consume
 * jobs can import it from a single location.
 */
export const PORTAL_SIGNAL_QUEUE = 'portal-signal';

// ─── Job Types ────────────────────────────────────────────────────────────────

export const PORTAL_SIGNAL_JOB = {
  FEEDBACK_CREATED: 'FEEDBACK_CREATED',
  FEEDBACK_VOTED: 'FEEDBACK_VOTED',
  FEEDBACK_COMMENTED: 'FEEDBACK_COMMENTED',
  ROADMAP_STATUS_CHANGED: 'ROADMAP_STATUS_CHANGED',
} as const;

export type PortalSignalJobType =
  (typeof PORTAL_SIGNAL_JOB)[keyof typeof PORTAL_SIGNAL_JOB];

// ─── Job Payloads ─────────────────────────────────────────────────────────────

export interface PortalSignalPayload {
  /** Internal workspace UUID — used for DB queries and SSE scoping */
  workspaceId: string;
  /** Human-readable slug — used as the SSE channel key */
  workspaceSlug: string;
  /** The feedback item that triggered this event */
  feedbackId: string;
  /** Whether the actor was an authenticated PortalUser or anonymous */
  actorType: 'PortalUser' | 'Anonymous';
  /** ISO-8601 timestamp of the action */
  timestamp: string;
  /** Job-specific extra data */
  data?: Record<string, unknown>;
}

export interface RoadmapSignalPayload {
  workspaceId: string;
  workspaceSlug: string;
  roadmapItemId: string;
  newStatus: string;
  timestamp: string;
}

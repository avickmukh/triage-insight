/**
 * usePortalEvents
 *
 * Subscribes to the Server-Sent Events stream for a given workspace's public
 * portal. Events are broadcast by the NestJS PortalSseGateway whenever a
 * portal action occurs (feedback created, voted, commented, roadmap changed).
 *
 * Usage:
 *   usePortalEvents(orgSlug, (event) => {
 *     if (event.type === 'FEEDBACK_VOTED') {
 *       // update local state or invalidate React Query cache
 *     }
 *   });
 *
 * The hook is safe to call in unauthenticated portal pages — it does NOT
 * require workspace context or an access token.
 */
"use client";

import { useEffect, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PortalEventType =
  | "FEEDBACK_CREATED"
  | "FEEDBACK_VOTED"
  | "FEEDBACK_COMMENTED"
  | "ROADMAP_STATUS_CHANGED"
  | "PING";

export interface PortalEvent {
  type: PortalEventType;
  data: Record<string, unknown>;
}

export type PortalEventHandler = (event: PortalEvent) => void;

// ─── Hook ─────────────────────────────────────────────────────────────────────

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1";

/**
 * Subscribe to the portal SSE stream for the given workspace.
 *
 * @param orgSlug  - The workspace slug (same as the URL segment)
 * @param onEvent  - Callback invoked for every event received from the server
 * @param enabled  - Set to false to disable the subscription (default: true)
 */
export function usePortalEvents(
  orgSlug: string,
  onEvent: PortalEventHandler,
  enabled = true,
): void {
  // Keep a stable ref to the callback so we don't re-subscribe on every render
  const onEventRef = useRef<PortalEventHandler>(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled || !orgSlug || typeof window === "undefined") return;

    const url = `${API_BASE}/public/${orgSlug}/events`;
    let es: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    const MAX_RETRIES = 5;

    function connect() {
      es = new EventSource(url);

      // Handle named event types emitted by the server
      const eventTypes: PortalEventType[] = [
        "FEEDBACK_CREATED",
        "FEEDBACK_VOTED",
        "FEEDBACK_COMMENTED",
        "ROADMAP_STATUS_CHANGED",
        "PING",
      ];

      for (const type of eventTypes) {
        es.addEventListener(type, (e: MessageEvent) => {
          try {
            const parsed = JSON.parse(e.data) as Record<string, unknown>;
            onEventRef.current({ type, data: parsed });
          } catch {
            // Ignore malformed events
          }
        });
      }

      es.onerror = () => {
        es?.close();
        es = null;
        if (retryCount < MAX_RETRIES) {
          // Exponential back-off: 2s, 4s, 8s, 16s, 32s
          const delay = Math.min(2 ** retryCount * 1_000, 32_000);
          retryCount++;
          retryTimeout = setTimeout(connect, delay);
        }
      };

      es.onopen = () => {
        retryCount = 0; // Reset on successful connection
      };
    }

    connect();

    return () => {
      if (retryTimeout) clearTimeout(retryTimeout);
      es?.close();
    };
  }, [orgSlug, enabled]);
}

/**
 * PortalSseGateway
 *
 * Manages Server-Sent Event (SSE) streams for the public portal.
 * Each stream is scoped to a single workspace (identified by orgSlug) so
 * there is zero cross-tenant data leakage.
 *
 * Architecture:
 *   - A Map<workspaceSlug, Set<Subject>> holds one RxJS Subject per connected
 *     client.  When the processor calls broadcast(), every Subject in the set
 *     emits the event and the NestJS SSE controller pipes it to the HTTP
 *     response.
 *   - Subjects are cleaned up when the client disconnects (onDisconnect).
 *
 * No external packages are required — NestJS has native SSE support via
 * @Sse() and Observable<MessageEvent>.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface PortalSseEvent {
  /** SSE event type — maps to EventSource.addEventListener(type) */
  type:
    | 'FEEDBACK_CREATED'
    | 'FEEDBACK_VOTED'
    | 'FEEDBACK_COMMENTED'
    | 'ROADMAP_STATUS_CHANGED'
    | 'PING';
  /** Event payload — must be JSON-serialisable */
  data: Record<string, unknown>;
}

/**
 * NestJS SSE MessageEvent shape.
 * NestJS @Sse() expects { data: string | object, type?: string, id?: string }.
 * We define our own interface to avoid conflicts with the browser's MessageEvent.
 */
export interface SseMessage {
  data: string;
  type?: string;
  id?: string;
  retry?: number;
}

@Injectable()
export class PortalSseGateway {
  private readonly logger = new Logger(PortalSseGateway.name);

  /**
   * Map<workspaceSlug, Set<Subject<SseMessage>>>
   *
   * Each connected SSE client gets its own Subject.  The NestJS @Sse()
   * controller converts the Subject's Observable to a streaming HTTP response.
   */
  private readonly clients = new Map<string, Set<Subject<SseMessage>>>();

  /**
   * Register a new SSE client for the given workspace.
   * Returns the Subject so the controller can pipe it as an Observable.
   */
  subscribe(workspaceSlug: string): Subject<SseMessage> {
    const subject = new Subject<SseMessage>();

    if (!this.clients.has(workspaceSlug)) {
      this.clients.set(workspaceSlug, new Set());
    }
    this.clients.get(workspaceSlug)!.add(subject);

    this.logger.debug(
      `SSE client connected: slug=${workspaceSlug}, total=${this.clients.get(workspaceSlug)!.size}`,
    );

    return subject;
  }

  /**
   * Remove a client Subject when its HTTP connection closes.
   */
  unsubscribe(workspaceSlug: string, subject: Subject<SseMessage>): void {
    const set = this.clients.get(workspaceSlug);
    if (set) {
      set.delete(subject);
      if (set.size === 0) this.clients.delete(workspaceSlug);
    }
    subject.complete();
    this.logger.debug(`SSE client disconnected: slug=${workspaceSlug}`);
  }

  /**
   * Broadcast an event to all clients connected to the given workspace.
   * Called by the PortalSignalProcessor after processing a signal job.
   */
  broadcast(workspaceSlug: string, event: PortalSseEvent): void {
    const set = this.clients.get(workspaceSlug);
    if (!set || set.size === 0) return;

    // NestJS SSE MessageEvent shape: { data: string, type?: string }
    const message: SseMessage = {
      data: JSON.stringify(event.data),
      type: event.type,
    };

    for (const subject of set) {
      try {
        subject.next(message);
      } catch (err) {
        this.logger.warn(`Failed to emit SSE event: ${String(err)}`);
        set.delete(subject);
      }
    }

    this.logger.debug(
      `SSE broadcast: slug=${workspaceSlug}, type=${event.type}, clients=${set.size}`,
    );
  }

  /**
   * Send a PING to all clients of a workspace to keep connections alive.
   * Called by the SSE controller on a 30-second interval.
   */
  ping(workspaceSlug: string): void {
    this.broadcast(workspaceSlug, {
      type: 'PING',
      data: { ts: new Date().toISOString() },
    });
  }

  /** Returns the number of connected clients for a workspace. */
  clientCount(workspaceSlug: string): number {
    return this.clients.get(workspaceSlug)?.size ?? 0;
  }
}

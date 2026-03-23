/**
 * DashboardCacheService
 *
 * In-memory TTL cache for dashboard intelligence surfaces.
 * Default TTL: 15 minutes. Invalidated on demand by the refresh worker.
 */
import { Injectable, Logger } from '@nestjs/common';

interface CacheEntry<T> {
  data:      T;
  expiresAt: number;
}

@Injectable()
export class DashboardCacheService {
  private readonly logger = new Logger(DashboardCacheService.name);
  private readonly store  = new Map<string, CacheEntry<unknown>>();
  private readonly TTL_MS = 15 * 60 * 1000; // 15 minutes

  private key(workspaceId: string, surface: string): string {
    return `${workspaceId}:${surface}`;
  }

  get<T>(workspaceId: string, surface: string): T | null {
    const entry = this.store.get(this.key(workspaceId, surface));
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(this.key(workspaceId, surface));
      return null;
    }
    return entry.data as T;
  }

  set<T>(workspaceId: string, surface: string, data: T, ttlMs?: number): void {
    this.store.set(this.key(workspaceId, surface), {
      data,
      expiresAt: Date.now() + (ttlMs ?? this.TTL_MS),
    });
  }

  invalidate(workspaceId: string, surface?: string): void {
    if (surface) {
      this.store.delete(this.key(workspaceId, surface));
    } else {
      // Invalidate all surfaces for this workspace
      for (const k of this.store.keys()) {
        if (k.startsWith(`${workspaceId}:`)) this.store.delete(k);
      }
      this.logger.log(`[CACHE] Invalidated all dashboard surfaces for workspace ${workspaceId}`);
    }
  }

  has(workspaceId: string, surface: string): boolean {
    return this.get(workspaceId, surface) !== null;
  }
}

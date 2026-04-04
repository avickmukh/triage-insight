/**
 * PrioritizationCacheService
 *
 * Lightweight in-memory TTL cache for prioritization engine outputs.
 *
 * Keyed by workspaceId. Each entry expires after TTL_MS (default 5 minutes).
 * The cache is invalidated by the PrioritizationWorker after a full recompute.
 *
 * Design rationale:
 *   - Prioritization scoring is CPU-intensive (multiple DB joins + scoring math).
 *   - Results change only when feedback/deals/ARR/settings change — not on every read.
 *   - A 5-minute TTL provides a good balance between freshness and performance.
 *   - For multi-instance deployments, replace with Redis-backed cache.
 */
import { Injectable, Logger } from '@nestjs/common';
import type {
  ThemePriorityItem,
  FeaturePriorityItem,
  RoadmapRecommendationItem,
  PrioritizationOpportunity,
} from './aggregation.service';

export interface PrioritizationCacheEntry {
  themes: ThemePriorityItem[];
  features: FeaturePriorityItem[];
  roadmap: RoadmapRecommendationItem[];
  opportunities: PrioritizationOpportunity[];
  computedAt: Date;
  expiresAt: Date;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class PrioritizationCacheService {
  private readonly logger = new Logger(PrioritizationCacheService.name);
  private readonly cache = new Map<string, PrioritizationCacheEntry>();

  get(workspaceId: string): PrioritizationCacheEntry | null {
    const entry = this.cache.get(workspaceId);
    if (!entry) return null;
    if (entry.expiresAt < new Date()) {
      this.cache.delete(workspaceId);
      return null;
    }
    return entry;
  }

  set(
    workspaceId: string,
    data: Omit<PrioritizationCacheEntry, 'expiresAt'>,
  ): void {
    this.cache.set(workspaceId, {
      ...data,
      expiresAt: new Date(Date.now() + TTL_MS),
    });
    this.logger.debug(
      `Cache set for workspace ${workspaceId}, expires in ${TTL_MS / 1000}s`,
    );
  }

  invalidate(workspaceId: string): void {
    this.cache.delete(workspaceId);
    this.logger.debug(`Cache invalidated for workspace ${workspaceId}`);
  }

  invalidateAll(): void {
    this.cache.clear();
    this.logger.debug('All prioritization caches invalidated');
  }

  getStats(): { size: number; workspaces: string[] } {
    return { size: this.cache.size, workspaces: [...this.cache.keys()] };
  }
}

import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
  HealthIndicatorResult,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_NAMES } from '../queue/queue.module';

/**
 * HealthController
 *
 * Exposes a single GET /health endpoint that checks:
 *
 * 1. **Database** — Prisma ping to PostgreSQL
 * 2. **Redis** — PING command to the Bull Redis connection
 * 3. **Queue depth** — Waiting job counts for the two highest-volume queues.
 *    Returns a WARNING (but not a failure) if waiting jobs exceed the threshold
 *    so that load balancers do not take the instance out of rotation for a
 *    transient backlog.
 *
 * The endpoint is intentionally unauthenticated so that Kubernetes liveness
 * and readiness probes can reach it without credentials.
 */
@Controller('health')
export class HealthController {
  /** Alert threshold: warn if more than this many jobs are waiting in a queue */
  private readonly QUEUE_DEPTH_WARN_THRESHOLD = 500;

  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prismaService: PrismaService,
    @InjectQueue(QUEUE_NAMES.AI_ANALYSIS) private readonly analysisQueue: Queue,
    @InjectQueue(QUEUE_NAMES.CIQ_SCORING) private readonly ciqQueue: Queue,
  ) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      // ── 1. Database ────────────────────────────────────────────────────────
      () => this.prismaIndicator.pingCheck('database', this.prismaService),

      // ── 2. Redis ───────────────────────────────────────────────────────────
      () => this.checkRedis(),

      // ── 3. Queue depth ─────────────────────────────────────────────────────
      () => this.checkQueueDepth(QUEUE_NAMES.AI_ANALYSIS, this.analysisQueue),
      () => this.checkQueueDepth(QUEUE_NAMES.CIQ_SCORING, this.ciqQueue),
    ]);
  }

  // ── Private health indicator helpers ──────────────────────────────────────

  /**
   * Sends a PING to Redis via the Bull queue client.
   * Returns healthy if Redis responds within the connection timeout.
   */
  private async checkRedis(): Promise<HealthIndicatorResult> {
    const key = 'redis';
    try {
      // Bull exposes the underlying ioredis client via queue.client
      const client = (
        this.analysisQueue as unknown as {
          client: { ping: () => Promise<string> };
        }
      ).client;
      const pong = await client.ping();
      if (pong === 'PONG') {
        return { [key]: { status: 'up' } };
      }
      return {
        [key]: { status: 'down', message: `Unexpected PING response: ${pong}` },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { [key]: { status: 'down', message } };
    }
  }

  /**
   * Checks the number of waiting jobs in a queue.
   * Returns healthy with a `depth` field; adds a `warning` field if the
   * depth exceeds the threshold but does NOT mark the check as down.
   */
  private async checkQueueDepth(
    queueName: string,
    queue: Queue,
  ): Promise<HealthIndicatorResult> {
    const key = `queue:${queueName}`;
    try {
      const waitingCount = await queue.getWaitingCount();
      const isOverThreshold = waitingCount > this.QUEUE_DEPTH_WARN_THRESHOLD;
      return {
        [key]: {
          status: 'up',
          depth: waitingCount,
          ...(isOverThreshold && {
            warning: `Queue depth (${waitingCount}) exceeds warning threshold (${this.QUEUE_DEPTH_WARN_THRESHOLD})`,
          }),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { [key]: { status: 'down', message } };
    }
  }
}

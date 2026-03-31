/**
 * QueueModule — Single Source of Truth for All Bull Queues
 *
 * Marked @Global() so queue tokens are available in every module without
 * re-importing QueueModule or calling BullModule.registerQueue() again.
 *
 * ── Critical architectural rule ──────────────────────────────────────────────
 * BullModule.registerQueue() must be called EXACTLY ONCE per queue name across
 * the entire application. Calling it multiple times (even in different modules)
 * creates duplicate provider tokens. NestJS resolves the last one, which means
 * the Bull Queue instance that BullExplorer uses to register processors may be
 * a DIFFERENT object than the one the processor's @InjectQueue token resolves
 * to. When the processor calls queue.process(), Bull's internal setHandler()
 * is called on an already-configured queue instance → crash:
 *   "Cannot define the same handler twice __default__"
 *
 * Solution: ALL queues are registered here. Feature modules use @InjectQueue()
 * directly — the token is resolved from this global module. No feature module
 * should ever call BullModule.registerQueue() for any queue listed here.
 *
 * ── Redis connection resolution (priority order) ─────────────────────────────
 * 1. REDIS_URL  — full connection string, e.g. redis://:password@host:port
 *                 (used by docker-compose and most cloud providers)
 * 2. REDIS_HOST + REDIS_PORT + REDIS_PASSWORD + REDIS_TLS
 *                 (used for explicit per-variable configuration)
 *
 * ── Env vars ─────────────────────────────────────────────────────────────────
 *   REDIS_URL              — full Redis connection URL (takes priority)
 *   REDIS_HOST             — Redis host (default: localhost)
 *   REDIS_PORT             — Redis port (default: 6379)
 *   REDIS_PASSWORD         — Redis password (required for Upstash, Redis Cloud, etc.)
 *   REDIS_TLS              — set to "true" to enable TLS (required by most cloud Redis)
 *   JOB_MAX_ATTEMPTS       — max retry attempts per job (default: 5)
 *   JOB_BACKOFF_DELAY_MS   — initial exponential backoff delay in ms (default: 2000)
 *   JOB_REMOVE_ON_COMPLETE — number of completed jobs to keep (default: 100)
 *   JOB_REMOVE_ON_FAIL     — number of failed jobs to keep (default: 500)
 */
import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';

/** All queue names as constants — import these instead of hardcoding strings */
export const QUEUE_NAMES = {
  AI_ANALYSIS:                  'ai-analysis',
  CIQ_SCORING:                  'ciq-scoring',
  VOICE_TRANSCRIPTION:          'voice-transcription',
  VOICE_EXTRACTION:             'voice-extraction',
  SURVEY_INTELLIGENCE:          'survey-intelligence',
  SUPPORT_SYNC:                 'support-sync',
  SUPPORT_CLUSTERING:           'support-clustering',
  SUPPORT_SPIKE_DETECTION:      'support-spike-detection',
  SUPPORT_SENTIMENT:            'support-sentiment',
  CUSTOMER_REVENUE_SIGNAL:      'customer-revenue-signal',
  CUSTOMER_SIGNAL_AGGREGATION:  'customer-signal-aggregation',
  THEME_CLUSTERING:             'theme-clustering',
  UNIFIED_AGGREGATION:          'unified-aggregation',
  PRIORITIZATION:               'prioritization',
  DASHBOARD_REFRESH:            'dashboard-refresh',
  DIGEST:                       'digest',
  PORTAL_SIGNAL:                'portal-signal',
  SLACK_INGESTION:              'slack-ingestion',
  PURGE:                        'workspace-purge',
  /** Dead-letter queue — all exhausted jobs are moved here */
  DLQ:                          'dlq',
} as const;

/**
 * Parse a Redis connection URL into ioredis connection options.
 * Supports: redis://host:port, redis://:password@host:port,
 *           rediss://host:port (TLS), redis://user:password@host:port
 */
function parseRedisUrl(url: string): {
  host: string;
  port: number;
  password?: string;
  tls?: object;
} {
  const parsed = new URL(url);
  const host     = parsed.hostname || 'localhost';
  const port     = parsed.port ? parseInt(parsed.port, 10) : 6379;
  const password = parsed.password || undefined;
  const tls      = parsed.protocol === 'rediss:' ? {} : undefined;
  return { host, port, ...(password ? { password } : {}), ...(tls ? { tls } : {}) };
}

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        // ── Redis connection: REDIS_URL takes priority over individual vars ──
        const redisUrl      = configService.get<string>('REDIS_URL', '');
        const redisPassword = configService.get<string>('REDIS_PASSWORD', '');
        const redisTls      = configService.get<string>('REDIS_TLS', 'false') === 'true';

        const redisConfig = redisUrl
          ? parseRedisUrl(redisUrl)
          : {
              host:     configService.get<string>('REDIS_HOST', 'localhost'),
              port:     configService.get<number>('REDIS_PORT', 6379),
              ...(redisPassword ? { password: redisPassword } : {}),
              ...(redisTls ? { tls: {} } : {}),
            };

        return {
          redis: {
            ...redisConfig,
            connectTimeout:       10000,
            maxRetriesPerRequest: null,
          },
          defaultJobOptions: {
            attempts:        configService.get<number>('JOB_MAX_ATTEMPTS', 5),
            backoff: {
              type:  'exponential',
              delay: configService.get<number>('JOB_BACKOFF_DELAY_MS', 2000),
            },
            removeOnComplete: configService.get<number>('JOB_REMOVE_ON_COMPLETE', 100),
            removeOnFail:     configService.get<number>('JOB_REMOVE_ON_FAIL', 500),
          },
        };
      },
      inject: [ConfigService],
    }),
    /**
     * Register ALL queues here — exactly once.
     * Feature modules must NOT call BullModule.registerQueue() for any of
     * these queues. They can inject queue tokens directly via @InjectQueue()
     * because this module is @Global() and its exports are available everywhere.
     */
    BullModule.registerQueue(
      {
        name: QUEUE_NAMES.AI_ANALYSIS,
        // STABILITY FIX (2026-04-01):
        // Default BullMQ lockDuration is 30s. Each ai-analysis job takes 15–90s
        // (embedding API + advisory-locked DB clustering). Without a longer lock,
        // BullMQ marks jobs as stalled after 30s and re-queues them, causing
        // duplicate processing and cascading Prisma transaction timeouts.
        //
        // lockDuration: 5 minutes — safely covers worst-case job duration.
        // stalledInterval: 60s — check for stalled jobs every 60s.
        // maxStalledCount: 1 — fail after 1 stall (prevents infinite re-queue loops).
        settings: {
          lockDuration: 300_000,
          stalledInterval: 60_000,
          maxStalledCount: 1,
        },
      },
      {
        name: QUEUE_NAMES.CIQ_SCORING,
        // CIQ scoring jobs are fast (< 10s) but can flood under bulk imports.
        // Deduplication by jobId (see ThemeClusteringService) prevents queue saturation.
        settings: {
          lockDuration: 60_000,
          stalledInterval: 30_000,
          maxStalledCount: 2,
        },
      },
      { name: QUEUE_NAMES.VOICE_TRANSCRIPTION },
      { name: QUEUE_NAMES.VOICE_EXTRACTION },
      { name: QUEUE_NAMES.SURVEY_INTELLIGENCE },
      { name: QUEUE_NAMES.SUPPORT_SYNC },
      { name: QUEUE_NAMES.SUPPORT_CLUSTERING },
      { name: QUEUE_NAMES.SUPPORT_SPIKE_DETECTION },
      { name: QUEUE_NAMES.SUPPORT_SENTIMENT },
      { name: QUEUE_NAMES.CUSTOMER_REVENUE_SIGNAL },
      { name: QUEUE_NAMES.CUSTOMER_SIGNAL_AGGREGATION },
      { name: QUEUE_NAMES.THEME_CLUSTERING },
      { name: QUEUE_NAMES.UNIFIED_AGGREGATION },
      { name: QUEUE_NAMES.PRIORITIZATION },
      { name: QUEUE_NAMES.DASHBOARD_REFRESH },
      { name: QUEUE_NAMES.DIGEST },
      { name: QUEUE_NAMES.PORTAL_SIGNAL },
      { name: QUEUE_NAMES.SLACK_INGESTION },
      { name: QUEUE_NAMES.PURGE },
      { name: QUEUE_NAMES.DLQ },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}

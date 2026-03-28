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
 * ── Env vars (all optional with safe defaults) ───────────────────────────────
 *   JOB_MAX_ATTEMPTS         — max retry attempts per job (default: 5)
 *   JOB_BACKOFF_DELAY_MS     — initial exponential backoff delay in ms (default: 2000)
 *   JOB_REMOVE_ON_COMPLETE   — number of completed jobs to keep (default: 100)
 *   JOB_REMOVE_ON_FAIL       — number of failed jobs to keep (default: 500)
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

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host:           configService.get<string>('REDIS_HOST', 'localhost'),
          port:           configService.get<number>('REDIS_PORT', 6379),
          lazyConnect:    true,
          connectTimeout: 5000,
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
      }),
      inject: [ConfigService],
    }),
    /**
     * Register ALL queues here — exactly once.
     * Feature modules must NOT call BullModule.registerQueue() for any of
     * these queues. They can inject queue tokens directly via @InjectQueue()
     * because this module is @Global() and its exports are available everywhere.
     */
    BullModule.registerQueue(
      { name: QUEUE_NAMES.AI_ANALYSIS },
      { name: QUEUE_NAMES.CIQ_SCORING },
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

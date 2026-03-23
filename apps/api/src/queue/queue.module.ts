
/**
 * QueueModule — Hardened
 *
 * Hardening additions (vs original):
 * 1. Configurable default job options: attempts, backoff delay, removeOnComplete/Fail
 * 2. All queue names exported as constants for type-safe injection
 * 3. DLQ queue registered for all pipelines
 *
 * New env vars (all optional with safe defaults):
 *   JOB_MAX_ATTEMPTS         — max retry attempts per job (default: 5)
 *   JOB_BACKOFF_DELAY_MS     — initial exponential backoff delay in ms (default: 2000)
 *   JOB_REMOVE_ON_COMPLETE   — number of completed jobs to keep (default: 100)
 *   JOB_REMOVE_ON_FAIL       — number of failed jobs to keep (default: 500)
 */
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';

/** All queue names as constants — import these instead of hardcoding strings */
export const QUEUE_NAMES = {
  AI_ANALYSIS:                 'ai-analysis',
  CIQ_SCORING:                 'ciq-scoring',
  VOICE_TRANSCRIPTION:         'voice-transcription',
  VOICE_EXTRACTION:            'voice-extraction',
  SURVEY_INTELLIGENCE:         'survey-intelligence',
  SUPPORT_SYNC:                'support-sync',
  SUPPORT_CLUSTERING:          'support-clustering',
  SUPPORT_SPIKE_DETECTION:     'support-spike-detection',
  CUSTOMER_SIGNAL_AGGREGATION: 'customer-signal-aggregation',
  THEME_CLUSTERING:            'theme-clustering',
  PRIORITIZATION:              'prioritization',
  DASHBOARD_REFRESH:           'dashboard-refresh',
  /** Dead-letter queue — all exhausted jobs are moved here */
  DLQ:                         'dlq',
} as const;

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host:                 configService.get<string>('REDIS_HOST', 'localhost'),
          port:                 configService.get<number>('REDIS_PORT', 6379),
          // ── Graceful degradation: don't block the app if Redis is down ──
          enableOfflineQueue:   false,
          maxRetriesPerRequest: 0,
          lazyConnect:          true,
          connectTimeout:       5000,
          retryStrategy:        (times: number) => {
            // Give up after 3 attempts; return null to stop retrying
            if (times > 3) return null;
            return Math.min(times * 500, 2000);
          },
        },
        /** Global default job options applied to every queue */
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

    /** Register all queues so they can be injected anywhere via @InjectQueue() */
    BullModule.registerQueue(
      { name: QUEUE_NAMES.AI_ANALYSIS },
      { name: QUEUE_NAMES.CIQ_SCORING },
      { name: QUEUE_NAMES.VOICE_TRANSCRIPTION },
      { name: QUEUE_NAMES.VOICE_EXTRACTION },
      { name: QUEUE_NAMES.SURVEY_INTELLIGENCE },
      { name: QUEUE_NAMES.SUPPORT_SYNC },
      { name: QUEUE_NAMES.SUPPORT_CLUSTERING },
      { name: QUEUE_NAMES.SUPPORT_SPIKE_DETECTION },
      { name: QUEUE_NAMES.CUSTOMER_SIGNAL_AGGREGATION },
      { name: QUEUE_NAMES.THEME_CLUSTERING },
      { name: QUEUE_NAMES.PRIORITIZATION },
      { name: QUEUE_NAMES.DASHBOARD_REFRESH },
      { name: QUEUE_NAMES.DLQ },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}

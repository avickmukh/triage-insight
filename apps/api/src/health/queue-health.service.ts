/**
 * QueueHealthService
 *
 * Provides real-time health and depth metrics for every Bull queue registered
 * in QueueModule. Injected by HealthController and the /health/queues endpoint.
 *
 * For each queue it reports:
 *   - waiting   : jobs waiting to be picked up by a worker
 *   - active    : jobs currently being processed
 *   - completed : recently completed jobs (kept per removeOnComplete setting)
 *   - failed    : recently failed jobs (kept per removeOnFail setting)
 *   - delayed   : jobs scheduled for future execution
 *   - paused    : whether the queue is paused
 *
 * A queue is considered "unhealthy" if:
 *   - Redis cannot be reached (status = 'error')
 *   - waiting depth exceeds WARN_THRESHOLD (status = 'warn')
 *   - failed count exceeds FAIL_WARN_THRESHOLD (status = 'warn')
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { QUEUE_NAMES } from '../queue/queue.module';

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
  status: 'ok' | 'warn' | 'error';
  warnings: string[];
}

export interface QueueHealthReport {
  timestamp: string;
  overall: 'ok' | 'warn' | 'error';
  queues: QueueStats[];
}

@Injectable()
export class QueueHealthService {
  private readonly logger = new Logger(QueueHealthService.name);

  /** Warn if more than this many jobs are waiting in a single queue */
  private readonly WAIT_WARN_THRESHOLD = 500;
  /** Warn if more than this many jobs have failed in a single queue */
  private readonly FAIL_WARN_THRESHOLD = 50;

  constructor(
    @InjectQueue(QUEUE_NAMES.AI_ANALYSIS)
    private readonly aiAnalysisQueue: Queue,
    @InjectQueue(QUEUE_NAMES.CIQ_SCORING)
    private readonly ciqScoringQueue: Queue,
    @InjectQueue(QUEUE_NAMES.THEME_CLUSTERING)
    private readonly themeClusteringQueue: Queue,
    @InjectQueue(QUEUE_NAMES.UNIFIED_AGGREGATION)
    private readonly unifiedAggregationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.DASHBOARD_REFRESH)
    private readonly dashboardRefreshQueue: Queue,
    @InjectQueue(QUEUE_NAMES.VOICE_TRANSCRIPTION)
    private readonly voiceTranscriptionQueue: Queue,
    @InjectQueue(QUEUE_NAMES.VOICE_EXTRACTION)
    private readonly voiceExtractionQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SURVEY_INTELLIGENCE)
    private readonly surveyIntelligenceQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SUPPORT_SYNC)
    private readonly supportSyncQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SUPPORT_CLUSTERING)
    private readonly supportClusteringQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SUPPORT_SPIKE_DETECTION)
    private readonly supportSpikeQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SUPPORT_SENTIMENT)
    private readonly supportSentimentQueue: Queue,
    @InjectQueue(QUEUE_NAMES.CUSTOMER_REVENUE_SIGNAL)
    private readonly customerRevenueQueue: Queue,
    @InjectQueue(QUEUE_NAMES.CUSTOMER_SIGNAL_AGGREGATION)
    private readonly customerAggregationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PRIORITIZATION)
    private readonly prioritizationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.DIGEST) private readonly digestQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PORTAL_SIGNAL)
    private readonly portalSignalQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SLACK_INGESTION)
    private readonly slackIngestionQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PURGE) private readonly purgeQueue: Queue,
    @InjectQueue(QUEUE_NAMES.DLQ) private readonly dlqQueue: Queue,
  ) {}

  /**
   * Returns a full health report for all queues.
   * Errors per-queue are caught individually so one bad queue does not
   * prevent reporting on the others.
   */
  async getReport(): Promise<QueueHealthReport> {
    const entries: Array<[string, Queue]> = [
      [QUEUE_NAMES.AI_ANALYSIS, this.aiAnalysisQueue],
      [QUEUE_NAMES.CIQ_SCORING, this.ciqScoringQueue],
      [QUEUE_NAMES.THEME_CLUSTERING, this.themeClusteringQueue],
      [QUEUE_NAMES.UNIFIED_AGGREGATION, this.unifiedAggregationQueue],
      [QUEUE_NAMES.DASHBOARD_REFRESH, this.dashboardRefreshQueue],
      [QUEUE_NAMES.VOICE_TRANSCRIPTION, this.voiceTranscriptionQueue],
      [QUEUE_NAMES.VOICE_EXTRACTION, this.voiceExtractionQueue],
      [QUEUE_NAMES.SURVEY_INTELLIGENCE, this.surveyIntelligenceQueue],
      [QUEUE_NAMES.SUPPORT_SYNC, this.supportSyncQueue],
      [QUEUE_NAMES.SUPPORT_CLUSTERING, this.supportClusteringQueue],
      [QUEUE_NAMES.SUPPORT_SPIKE_DETECTION, this.supportSpikeQueue],
      [QUEUE_NAMES.SUPPORT_SENTIMENT, this.supportSentimentQueue],
      [QUEUE_NAMES.CUSTOMER_REVENUE_SIGNAL, this.customerRevenueQueue],
      [QUEUE_NAMES.CUSTOMER_SIGNAL_AGGREGATION, this.customerAggregationQueue],
      [QUEUE_NAMES.PRIORITIZATION, this.prioritizationQueue],
      [QUEUE_NAMES.DIGEST, this.digestQueue],
      [QUEUE_NAMES.PORTAL_SIGNAL, this.portalSignalQueue],
      [QUEUE_NAMES.SLACK_INGESTION, this.slackIngestionQueue],
      [QUEUE_NAMES.PURGE, this.purgeQueue],
      [QUEUE_NAMES.DLQ, this.dlqQueue],
    ];

    const queueStats = await Promise.all(
      entries.map(([name, queue]) => this.getQueueStats(name, queue)),
    );

    const hasError = queueStats.some((q) => q.status === 'error');
    const hasWarn = queueStats.some((q) => q.status === 'warn');
    const overall = hasError ? 'error' : hasWarn ? 'warn' : 'ok';

    return {
      timestamp: new Date().toISOString(),
      overall,
      queues: queueStats,
    };
  }

  private async getQueueStats(name: string, queue: Queue): Promise<QueueStats> {
    try {
      const [waiting, active, completed, failed, delayed, isPaused] =
        await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
          queue.isPaused(),
        ]);

      const warnings: string[] = [];
      if (waiting > this.WAIT_WARN_THRESHOLD) {
        warnings.push(
          `waiting depth ${waiting} exceeds threshold ${this.WAIT_WARN_THRESHOLD}`,
        );
      }
      if (failed > this.FAIL_WARN_THRESHOLD) {
        warnings.push(
          `failed count ${failed} exceeds threshold ${this.FAIL_WARN_THRESHOLD}`,
        );
      }
      if (isPaused) {
        warnings.push('queue is paused');
      }

      return {
        name,
        waiting,
        active,
        completed,
        failed,
        delayed,
        paused: isPaused,
        status: warnings.length > 0 ? 'warn' : 'ok',
        warnings,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to get stats for queue "${name}": ${message}`);
      return {
        name,
        waiting: -1,
        active: -1,
        completed: -1,
        failed: -1,
        delayed: -1,
        paused: false,
        status: 'error',
        warnings: [message],
      };
    }
  }
}

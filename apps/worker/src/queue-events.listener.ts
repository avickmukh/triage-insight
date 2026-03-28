/**
 * QueueEventsListener
 *
 * A single NestJS service that attaches structured lifecycle logging to every
 * Bull queue registered in QueueModule. This gives full observability into
 * job processing without modifying individual processor files.
 *
 * Events logged (all as structured JSON via NestJS Logger):
 *   QUEUE_ACTIVE    — job picked up by a worker
 *   QUEUE_COMPLETED — job finished successfully
 *   QUEUE_FAILED    — job failed (includes attempt count and error message)
 *   QUEUE_STALLED   — job stalled (worker died mid-processing)
 *   QUEUE_ERROR     — queue-level error (Redis disconnect, etc.)
 *   QUEUE_PAUSED    — queue paused
 *   QUEUE_RESUMED   — queue resumed
 *
 * Log format (JSON, one line per event):
 * {
 *   "event": "QUEUE_FAILED",
 *   "queue": "ai-analysis",
 *   "job_id": "42",
 *   "job_name": "__default__",
 *   "attempt": 2,
 *   "failure_reason": "OpenAI rate limit exceeded",
 *   "duration_ms": 1234
 * }
 *
 * This listener is registered as a provider in WorkerModule and runs in the
 * worker process only. It does NOT affect the API process.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue, Job } from 'bull';
import { QUEUE_NAMES } from '../../api/src/queue/queue.module';

@Injectable()
export class QueueEventsListener implements OnModuleInit {
  private readonly logger = new Logger(QueueEventsListener.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.AI_ANALYSIS)             private readonly aiAnalysisQueue: Queue,
    @InjectQueue(QUEUE_NAMES.CIQ_SCORING)             private readonly ciqScoringQueue: Queue,
    @InjectQueue(QUEUE_NAMES.THEME_CLUSTERING)        private readonly themeClusteringQueue: Queue,
    @InjectQueue(QUEUE_NAMES.UNIFIED_AGGREGATION)     private readonly unifiedAggregationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.DASHBOARD_REFRESH)       private readonly dashboardRefreshQueue: Queue,
    @InjectQueue(QUEUE_NAMES.VOICE_TRANSCRIPTION)     private readonly voiceTranscriptionQueue: Queue,
    @InjectQueue(QUEUE_NAMES.VOICE_EXTRACTION)        private readonly voiceExtractionQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SURVEY_INTELLIGENCE)     private readonly surveyIntelligenceQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SUPPORT_SYNC)            private readonly supportSyncQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SUPPORT_CLUSTERING)      private readonly supportClusteringQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SUPPORT_SPIKE_DETECTION) private readonly supportSpikeQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SUPPORT_SENTIMENT)       private readonly supportSentimentQueue: Queue,
    @InjectQueue(QUEUE_NAMES.CUSTOMER_REVENUE_SIGNAL) private readonly customerRevenueQueue: Queue,
    @InjectQueue(QUEUE_NAMES.CUSTOMER_SIGNAL_AGGREGATION) private readonly customerAggregationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PRIORITIZATION)          private readonly prioritizationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.DIGEST)                  private readonly digestQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PORTAL_SIGNAL)           private readonly portalSignalQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SLACK_INGESTION)         private readonly slackIngestionQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PURGE)                   private readonly purgeQueue: Queue,
    @InjectQueue(QUEUE_NAMES.DLQ)                     private readonly dlqQueue: Queue,
  ) {}

  onModuleInit(): void {
    const queues: Array<[string, Queue]> = [
      [QUEUE_NAMES.AI_ANALYSIS,             this.aiAnalysisQueue],
      [QUEUE_NAMES.CIQ_SCORING,             this.ciqScoringQueue],
      [QUEUE_NAMES.THEME_CLUSTERING,        this.themeClusteringQueue],
      [QUEUE_NAMES.UNIFIED_AGGREGATION,     this.unifiedAggregationQueue],
      [QUEUE_NAMES.DASHBOARD_REFRESH,       this.dashboardRefreshQueue],
      [QUEUE_NAMES.VOICE_TRANSCRIPTION,     this.voiceTranscriptionQueue],
      [QUEUE_NAMES.VOICE_EXTRACTION,        this.voiceExtractionQueue],
      [QUEUE_NAMES.SURVEY_INTELLIGENCE,     this.surveyIntelligenceQueue],
      [QUEUE_NAMES.SUPPORT_SYNC,            this.supportSyncQueue],
      [QUEUE_NAMES.SUPPORT_CLUSTERING,      this.supportClusteringQueue],
      [QUEUE_NAMES.SUPPORT_SPIKE_DETECTION, this.supportSpikeQueue],
      [QUEUE_NAMES.SUPPORT_SENTIMENT,       this.supportSentimentQueue],
      [QUEUE_NAMES.CUSTOMER_REVENUE_SIGNAL, this.customerRevenueQueue],
      [QUEUE_NAMES.CUSTOMER_SIGNAL_AGGREGATION, this.customerAggregationQueue],
      [QUEUE_NAMES.PRIORITIZATION,          this.prioritizationQueue],
      [QUEUE_NAMES.DIGEST,                  this.digestQueue],
      [QUEUE_NAMES.PORTAL_SIGNAL,           this.portalSignalQueue],
      [QUEUE_NAMES.SLACK_INGESTION,         this.slackIngestionQueue],
      [QUEUE_NAMES.PURGE,                   this.purgeQueue],
      [QUEUE_NAMES.DLQ,                     this.dlqQueue],
    ];

    for (const [name, queue] of queues) {
      this.attachListeners(name, queue);
    }

    this.logger.log(
      JSON.stringify({ event: 'QUEUE_LISTENERS_ATTACHED', queue_count: queues.length }),
    );
  }

  private attachListeners(queueName: string, queue: Queue): void {
    queue.on('active', (job: Job) => {
      this.logger.log(
        JSON.stringify({
          event: 'QUEUE_ACTIVE',
          queue: queueName,
          job_id: String(job.id),
          job_name: job.name,
          attempt: job.attemptsMade + 1,
        }),
      );
    });

    queue.on('completed', (job: Job, result: unknown) => {
      const durationMs =
        job.finishedOn && job.processedOn
          ? job.finishedOn - job.processedOn
          : undefined;
      this.logger.log(
        JSON.stringify({
          event: 'QUEUE_COMPLETED',
          queue: queueName,
          job_id: String(job.id),
          job_name: job.name,
          duration_ms: durationMs,
        }),
      );
    });

    queue.on('failed', (job: Job, err: Error) => {
      const durationMs =
        job.finishedOn && job.processedOn
          ? job.finishedOn - job.processedOn
          : undefined;
      this.logger.error(
        JSON.stringify({
          event: 'QUEUE_FAILED',
          queue: queueName,
          job_id: String(job.id),
          job_name: job.name,
          attempt: job.attemptsMade,
          failure_reason: err?.message ?? String(err),
          duration_ms: durationMs,
        }),
      );
    });

    queue.on('stalled', (job: Job) => {
      this.logger.warn(
        JSON.stringify({
          event: 'QUEUE_STALLED',
          queue: queueName,
          job_id: String(job.id),
          job_name: job.name,
        }),
      );
    });

    queue.on('error', (err: Error) => {
      this.logger.error(
        JSON.stringify({
          event: 'QUEUE_ERROR',
          queue: queueName,
          failure_reason: err?.message ?? String(err),
        }),
      );
    });

    queue.on('paused', () => {
      this.logger.warn(
        JSON.stringify({ event: 'QUEUE_PAUSED', queue: queueName }),
      );
    });

    queue.on('resumed', () => {
      this.logger.log(
        JSON.stringify({ event: 'QUEUE_RESUMED', queue: queueName }),
      );
    });
  }
}

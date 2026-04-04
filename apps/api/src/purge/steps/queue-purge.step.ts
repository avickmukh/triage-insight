import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue, Job } from 'bull';
import { PurgeService } from '../purge.service';
import { PurgeStepStatus } from '@prisma/client';
import { QUEUE_NAMES } from '../../queue/queue.module';

/**
 * QueuePurgeStep
 *
 * Removes all pending, waiting, and delayed BullMQ jobs that belong to
 * the target workspace. Jobs are identified by their `workspaceId` payload
 * field.
 *
 * Active (currently running) jobs are not killed — they will complete
 * naturally. Since the workspace is already FROZEN, no new jobs can be
 * enqueued, so active jobs will simply find no work to do on their next
 * enqueue attempt.
 *
 * This step is idempotent.
 */
@Injectable()
export class QueuePurgeStep {
  private readonly logger = new Logger(QueuePurgeStep.name);

  constructor(
    private readonly purgeService: PurgeService,
    @InjectQueue(QUEUE_NAMES.AI_ANALYSIS)
    private readonly aiAnalysisQueue: Queue,
    @InjectQueue(QUEUE_NAMES.CIQ_SCORING)
    private readonly ciqScoringQueue: Queue,
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
    @InjectQueue(QUEUE_NAMES.CUSTOMER_SIGNAL_AGGREGATION)
    private readonly customerSignalQueue: Queue,
    @InjectQueue(QUEUE_NAMES.THEME_CLUSTERING)
    private readonly themeClusteringQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PRIORITIZATION)
    private readonly prioritizationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.DASHBOARD_REFRESH)
    private readonly dashboardRefreshQueue: Queue,
  ) {}

  async execute(deletionRequestId: string, workspaceId: string): Promise<void> {
    const startedAt = new Date();

    const queues: Queue[] = [
      this.aiAnalysisQueue,
      this.ciqScoringQueue,
      this.voiceTranscriptionQueue,
      this.voiceExtractionQueue,
      this.surveyIntelligenceQueue,
      this.supportSyncQueue,
      this.supportClusteringQueue,
      this.supportSpikeQueue,
      this.customerSignalQueue,
      this.themeClusteringQueue,
      this.prioritizationQueue,
      this.dashboardRefreshQueue,
    ];

    let totalRemoved = 0;
    const queueStats: Record<string, number> = {};

    for (const queue of queues) {
      try {
        // Get all waiting and delayed jobs
        const [waiting, delayed] = await Promise.all([
          queue.getWaiting(),
          queue.getDelayed(),
        ]);

        const toRemove: Job[] = [...waiting, ...delayed].filter(
          (job) => job.data?.workspaceId === workspaceId,
        );

        for (const job of toRemove) {
          await job.remove();
          totalRemoved++;
        }

        if (toRemove.length > 0) {
          queueStats[queue.name] = toRemove.length;
          this.logger.log(
            `[QueuePurgeStep] Removed ${toRemove.length} jobs from queue "${queue.name}" for workspace ${workspaceId}`,
          );
        }
      } catch (err) {
        // Redis may be unavailable — log and continue (non-fatal for purge)
        this.logger.warn(
          `[QueuePurgeStep] Could not drain queue "${queue.name}": ${(err as Error).message}`,
        );
      }
    }

    await this.purgeService.logStep(
      deletionRequestId,
      workspaceId,
      'DRAIN_QUEUES',
      PurgeStepStatus.SUCCESS,
      {
        totalJobsRemoved: totalRemoved,
        perQueue: queueStats,
        durationMs: Date.now() - startedAt.getTime(),
      },
    );
  }
}

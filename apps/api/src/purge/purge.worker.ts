import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  PurgeService,
  PURGE_QUEUE,
  PURGE_JOB_NAME,
  PurgeJobPayload,
} from './purge.service';
import { StoragePurgeStep } from './steps/storage-purge.step';
import { DatabasePurgeStep } from './steps/database-purge.step';
import { QueuePurgeStep } from './steps/queue-purge.step';
import { TokenRevocationStep } from './steps/token-revocation.step';
import { WorkspaceDeletionStatus, PurgeStepStatus } from '@prisma/client';

/**
 * PurgeWorker
 *
 * Executes the 5-step workspace purge pipeline in strict order.
 * Each step is idempotent and logs its result to WorkspaceDeletionAuditLog.
 *
 * Steps:
 *   1. REVOKE_TOKENS   — revoke auth tokens for users whose last workspace is being purged
 *   2. DRAIN_QUEUES    — remove all pending BullMQ jobs for this workspace
 *   3. PURGE_STORAGE   — delete all S3 objects under workspaces/{workspaceId}/
 *   4. PURGE_DATABASE  — cascade-delete the Workspace row (deletes all child rows)
 *   5. COMPLETE        — mark the deletion request as COMPLETED
 */
@Processor(PURGE_QUEUE)
export class PurgeWorker {
  private readonly logger = new Logger(PurgeWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly purgeService: PurgeService,
    private readonly storagePurge: StoragePurgeStep,
    private readonly databasePurge: DatabasePurgeStep,
    private readonly queuePurge: QueuePurgeStep,
    private readonly tokenRevocation: TokenRevocationStep,
  ) {}

  @Process(PURGE_JOB_NAME)
  async execute(job: Job<PurgeJobPayload>) {
    const { deletionRequestId, workspaceId } = job.data;
    this.logger.log(
      `[Purge] Starting purge for workspace ${workspaceId} (request: ${deletionRequestId})`,
    );

    // Mark as IN_PROGRESS
    await this.prisma.workspaceDeletionRequest.update({
      where: { id: deletionRequestId },
      data: {
        status: WorkspaceDeletionStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
    });

    const steps = [
      {
        name: 'REVOKE_TOKENS',
        fn: () => this.tokenRevocation.execute(deletionRequestId, workspaceId),
      },
      {
        name: 'DRAIN_QUEUES',
        fn: () => this.queuePurge.execute(deletionRequestId, workspaceId),
      },
      {
        name: 'PURGE_STORAGE',
        fn: () => this.storagePurge.execute(deletionRequestId, workspaceId),
      },
      {
        name: 'PURGE_DATABASE',
        fn: () => this.databasePurge.execute(deletionRequestId, workspaceId),
      },
    ];

    for (const step of steps) {
      try {
        this.logger.log(
          `[Purge] Executing step: ${step.name} for workspace ${workspaceId}`,
        );
        await step.fn();
        this.logger.log(
          `[Purge] Step ${step.name} completed for workspace ${workspaceId}`,
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `[Purge] Step ${step.name} FAILED for workspace ${workspaceId}: ${errorMessage}`,
        );

        // Log the failure
        await this.purgeService.logStep(
          deletionRequestId,
          workspaceId,
          step.name,
          PurgeStepStatus.FAILED,
          {},
          errorMessage,
        );

        // Mark the request as FAILED and stop
        await this.prisma.workspaceDeletionRequest.update({
          where: { id: deletionRequestId },
          data: {
            status: WorkspaceDeletionStatus.FAILED,
            failedAt: new Date(),
            failureReason: `Step ${step.name} failed: ${errorMessage}`,
          },
        });

        throw err; // Rethrow so BullMQ marks the job as failed
      }
    }

    // All steps succeeded — mark as COMPLETED
    await this.prisma.workspaceDeletionRequest.update({
      where: { id: deletionRequestId },
      data: {
        status: WorkspaceDeletionStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    this.logger.log(
      `[Purge] Workspace ${workspaceId} purge COMPLETED successfully`,
    );
  }
}

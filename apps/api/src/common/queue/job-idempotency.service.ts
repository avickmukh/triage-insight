/**
 * JobIdempotencyService
 *
 * Prevents duplicate job processing by tracking dedup keys in the AiJobLog table.
 *
 * Dedup key format: {jobType}:{entityId}:{workspaceId}
 *
 * A job is considered a duplicate if:
 * - A record with the same dedupeKey exists
 * - AND its status is 'RUNNING' or 'COMPLETED'
 * - AND it was created within the TTL window (default: 10 minutes)
 *
 * Failed and DEAD_LETTERED jobs are NOT considered duplicates — they can be retried.
 */

import { Injectable } from '@nestjs/common';
import { AiJobStatus, AiJobType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JobLogger } from './job-logger';

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class JobIdempotencyService {
  private readonly logger = new JobLogger(JobIdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build a canonical dedup key for a job.
   */
  static buildKey(
    jobType: string,
    entityId: string,
    workspaceId: string,
  ): string {
    return `${jobType}:${entityId}:${workspaceId}`;
  }

  /**
   * Check if a job with this dedup key is already running or completed.
   * Returns true if the job should be skipped (duplicate detected).
   */
  async isDuplicate(
    jobType: AiJobType,
    entityId: string,
    workspaceId: string,
    ttlMs: number = DEFAULT_TTL_MS,
  ): Promise<boolean> {
    const dedupeKey = JobIdempotencyService.buildKey(
      jobType,
      entityId,
      workspaceId,
    );
    const since = new Date(Date.now() - ttlMs);

    const existing = await this.prisma.aiJobLog.findFirst({
      where: {
        workspaceId,
        dedupeKey,
        status: { in: [AiJobStatus.RUNNING, AiJobStatus.COMPLETED] },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      this.logger.skip(
        { jobType, workspaceId, entityId },
        `Duplicate detected: existing job ${existing.id} status=${existing.status}`,
      );
      return true;
    }

    return false;
  }

  /**
   * Mark a job as started (RUNNING) in the idempotency store.
   * Returns the AiJobLog ID for later completion/failure updates.
   */
  async markStarted(
    jobType: AiJobType,
    entityId: string,
    workspaceId: string,
    entityType?: string,
  ): Promise<string> {
    const dedupeKey = JobIdempotencyService.buildKey(
      jobType,
      entityId,
      workspaceId,
    );
    const record = await this.prisma.aiJobLog.create({
      data: {
        workspaceId,
        jobType,
        entityId,
        entityType: entityType ?? null,
        status: AiJobStatus.RUNNING,
        startedAt: new Date(),
        dedupeKey,
      },
    });
    return record.id;
  }

  /**
   * Mark a job as completed in the idempotency store.
   */
  async markCompleted(logId: string, durationMs: number): Promise<void> {
    await this.prisma.aiJobLog.update({
      where: { id: logId },
      data: {
        status: AiJobStatus.COMPLETED,
        completedAt: new Date(),
        durationMs,
      },
    });
  }

  /**
   * Mark a job as failed in the idempotency store.
   * Failed jobs are NOT considered duplicates — they can be retried.
   */
  async markFailed(
    logId: string,
    errorMessage: string,
    durationMs: number,
  ): Promise<void> {
    await this.prisma.aiJobLog.update({
      where: { id: logId },
      data: {
        status: AiJobStatus.FAILED,
        completedAt: new Date(),
        durationMs,
        error: errorMessage,
      },
    });
  }

  /**
   * Mark a job as dead-lettered (max retries exceeded).
   * Dead-lettered jobs are inspectable via the AiJobLog table.
   */
  async markDeadLettered(
    logId: string,
    errorMessage: string,
    attempts: number,
    durationMs: number,
  ): Promise<void> {
    await this.prisma.aiJobLog.update({
      where: { id: logId },
      data: {
        status: AiJobStatus.DEAD_LETTERED,
        completedAt: new Date(),
        durationMs,
        attempts,
        error: `[DLQ] ${errorMessage}`,
      },
    });
  }
}

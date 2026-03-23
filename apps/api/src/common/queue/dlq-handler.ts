/**
 * DLQ Handler
 *
 * Shared dead-letter queue handling for Bull processors.
 * When a job exceeds its max retry attempts, it is marked as DEAD_LETTERED
 * in the AiJobLog table and a structured error log is emitted.
 *
 * Usage: call `handleDlq(job, error, logger, idempotencyService)` from
 * the @OnQueueFailed handler in each processor.
 */

import type { Job } from 'bull';
import { JobLogger, JobContext } from './job-logger';
import { JobIdempotencyService } from './job-idempotency.service';
import { RetryPolicy } from './retry-policy';

export interface DlqJobData {
  workspaceId: string;
  __logId?: string;
  [key: string]: unknown;
}

/**
 * Called from @OnQueueFailed in a processor.
 * If the job has exhausted all retries, marks it as DEAD_LETTERED.
 * Otherwise, logs the failure and allows Bull to retry.
 */
export async function handleDlq(
  job: Job<DlqJobData>,
  error: Error,
  ctx: JobContext,
  logger: JobLogger,
  idempotencyService: JobIdempotencyService | null,
): Promise<void> {
  const maxAttempts = RetryPolicy.maxAttempts();
  const isExhausted = job.attemptsMade >= maxAttempts;
  const durationMs = job.finishedOn ? job.finishedOn - job.processedOn! : 0;

  if (isExhausted) {
    // Move to DLQ: mark as DEAD_LETTERED in AiJobLog
    logger.dlq({
      ...ctx,
      failureReason: error.message,
      attempts: job.attemptsMade,
    });

    if (idempotencyService && job.data.__logId) {
      await idempotencyService.markDeadLettered(
        job.data.__logId,
        error.message,
        job.attemptsMade,
        durationMs,
      ).catch(() => {
        // Non-critical: log update failure should not throw
      });
    }
  } else {
    // Not yet exhausted — log the failure and let Bull retry
    logger.fail({
      ...ctx,
      durationMs,
      failureReason: error.message,
      attempt: job.attemptsMade,
    });

    if (idempotencyService && job.data.__logId) {
      await idempotencyService.markFailed(
        job.data.__logId,
        error.message,
        durationMs,
      ).catch(() => {
        // Non-critical
      });
    }
  }
}

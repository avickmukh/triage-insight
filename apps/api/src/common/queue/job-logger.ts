/**
 * JobLogger
 *
 * Structured logging utility for Bull queue processors.
 * Ensures every log line includes: workspace_id, entity_id, job_type, duration, failure_reason.
 * Wraps NestJS Logger so all output goes through the standard NestJS logging pipeline.
 */

import { Logger } from '@nestjs/common';

export interface JobContext {
  jobType: string;
  workspaceId: string;
  entityId?: string;
  jobId?: string | number;
}

export interface JobLogPayload extends JobContext {
  durationMs?: number;
  failureReason?: string;
  attempt?: number;
  [key: string]: unknown;
}

export class JobLogger {
  private readonly logger: Logger;

  constructor(processorName: string) {
    this.logger = new Logger(processorName);
  }

  /** Log job start */
  start(ctx: JobContext): void {
    this.logger.log(this.format('JOB_START', ctx));
  }

  /** Log job completion */
  complete(ctx: JobContext & { durationMs: number }): void {
    this.logger.log(this.format('JOB_COMPLETE', ctx));
  }

  /** Log a non-fatal warning (step failed but job continues) */
  stepWarn(ctx: JobContext, step: string, reason: string): void {
    this.logger.warn(
      this.format('STEP_WARN', { ...ctx, step, failureReason: reason }),
    );
  }

  /** Log a fatal job failure */
  fail(ctx: JobContext & { durationMs: number; failureReason: string; attempt?: number }): void {
    this.logger.error(this.format('JOB_FAIL', ctx));
  }

  /** Log a DLQ move event */
  dlq(ctx: JobContext & { failureReason: string; attempts: number }): void {
    this.logger.error(this.format('JOB_DLQ', ctx));
  }

  /** Log idempotency skip */
  skip(ctx: JobContext, reason: string): void {
    this.logger.log(this.format('JOB_SKIP', { ...ctx, reason }));
  }

  /** Log a generic debug message */
  debug(ctx: JobContext, message: string, extra?: Record<string, unknown>): void {
    this.logger.debug(this.format('JOB_DEBUG', { ...ctx, message, ...extra }));
  }

  private format(event: string, payload: JobLogPayload): string {
    const fields: Record<string, unknown> = {
      event,
      job_type: payload.jobType,
      workspace_id: payload.workspaceId,
      entity_id: payload.entityId ?? null,
      job_id: payload.jobId ?? null,
    };

    if (payload.durationMs !== undefined) fields.duration_ms = payload.durationMs;
    if (payload.failureReason) fields.failure_reason = payload.failureReason;
    if (payload.attempt !== undefined) fields.attempt = payload.attempt;

    // Include any extra fields
    for (const [k, v] of Object.entries(payload)) {
      if (!['jobType', 'workspaceId', 'entityId', 'jobId', 'durationMs', 'failureReason', 'attempt'].includes(k)) {
        fields[k] = v;
      }
    }

    return JSON.stringify(fields);
  }
}

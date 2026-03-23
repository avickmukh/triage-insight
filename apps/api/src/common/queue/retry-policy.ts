/**
 * RetryPolicy
 *
 * Centralised retry and backoff configuration for all Bull queue jobs.
 * Values are read from environment variables with safe defaults.
 *
 * Environment variables:
 *   JOB_MAX_ATTEMPTS    — max number of attempts before DLQ (default: 3)
 *   JOB_BACKOFF_DELAY   — initial backoff delay in ms (default: 5000)
 *   JOB_BACKOFF_TYPE    — 'exponential' | 'fixed' (default: 'exponential')
 *   QUEUE_CONCURRENCY   — worker concurrency per queue (default: 2)
 */

export interface JobRetryOptions {
  attempts: number;
  backoff: {
    type: 'exponential' | 'fixed';
    delay: number;
  };
  removeOnComplete: number;
  removeOnFail: number;
}

export class RetryPolicy {
  /** Standard retry options for AI processing jobs (embedding, scoring, clustering) */
  static standard(): JobRetryOptions {
    return {
      attempts: RetryPolicy.maxAttempts(),
      backoff: {
        type: RetryPolicy.backoffType(),
        delay: RetryPolicy.backoffDelay(),
      },
      removeOnComplete: 100,   // keep last 100 completed jobs for observability
      removeOnFail: 500,       // keep last 500 failed jobs for DLQ inspection
    };
  }

  /** Aggressive retry for critical scoring jobs (CIQ, theme scoring) */
  static critical(): JobRetryOptions {
    return {
      attempts: Math.max(RetryPolicy.maxAttempts(), 5),
      backoff: {
        type: 'exponential',
        delay: RetryPolicy.backoffDelay(),
      },
      removeOnComplete: 200,
      removeOnFail: 1000,
    };
  }

  /** Light retry for non-critical background jobs (support clustering, spike detection) */
  static light(): JobRetryOptions {
    return {
      attempts: Math.min(RetryPolicy.maxAttempts(), 2),
      backoff: {
        type: 'fixed',
        delay: 3000,
      },
      removeOnComplete: 50,
      removeOnFail: 200,
    };
  }

  static maxAttempts(): number {
    const val = parseInt(process.env.JOB_MAX_ATTEMPTS ?? '3', 10);
    return isNaN(val) || val < 1 ? 3 : Math.min(val, 10); // cap at 10 to prevent infinite loops
  }

  static backoffDelay(): number {
    const val = parseInt(process.env.JOB_BACKOFF_DELAY ?? '5000', 10);
    return isNaN(val) || val < 100 ? 5000 : val;
  }

  static backoffType(): 'exponential' | 'fixed' {
    return process.env.JOB_BACKOFF_TYPE === 'fixed' ? 'fixed' : 'exponential';
  }

  static concurrency(): number {
    const val = parseInt(process.env.QUEUE_CONCURRENCY ?? '2', 10);
    return isNaN(val) || val < 1 ? 2 : Math.min(val, 20); // cap at 20 for safety
  }
}

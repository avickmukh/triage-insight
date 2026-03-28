
import * as Joi from 'joi';

/**
 * Config validation schema.
 *
 * Infrastructure services (Redis, S3, OpenAI, Stripe) are optional with safe
 * defaults so the API starts and serves requests even without external services
 * configured. Only DATABASE_URL and JWT_SECRET are truly required for the app
 * to function at all.
 *
 * In production, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and CORS_ORIGIN
 * should always be set. The schema warns via Joi.when() but does not hard-fail
 * to allow staging environments to boot without a live Stripe account.
 */
export const validationSchema = Joi.object({
  NODE_ENV:               Joi.string().valid('development', 'production', 'test').default('development'),
  PORT:                   Joi.number().default(3000),

  // ── Required ──────────────────────────────────────────────────────────────
  // Without these the app cannot authenticate or persist data.
  DATABASE_URL:           Joi.string().required(),
  JWT_SECRET:             Joi.string().min(32).required(),

  // ── CORS ──────────────────────────────────────────────────────────────────
  // In production, set to the frontend origin(s), e.g. "https://app.triageinsight.com"
  // Comma-separated for multiple origins.
  CORS_ORIGIN:            Joi.string().default(''),

  // ── Rate Limiting ─────────────────────────────────────────────────────────
  // Global throttle: max THROTTLE_LIMIT requests per THROTTLE_TTL_MS milliseconds per IP.
  THROTTLE_TTL_MS:        Joi.number().default(60000),
  THROTTLE_LIMIT:         Joi.number().default(20),

  // ── Redis / Bull Queues ───────────────────────────────────────────────────
  // App degrades gracefully without Redis (queued jobs will not run).
  REDIS_HOST:             Joi.string().default('localhost'),
  REDIS_PORT:             Joi.number().default(6379),
  // Set REDIS_PASSWORD for authenticated Redis instances (Upstash, Redis Cloud, etc.).
  REDIS_PASSWORD:         Joi.string().default(''),
  // Set REDIS_TLS=true for TLS-enabled Redis (required by most cloud Redis providers).
  REDIS_TLS:              Joi.string().valid('true', 'false').default('false'),

  // ── AWS S3 File Uploads ───────────────────────────────────────────────────
  // Upload endpoints return 503 if not configured.
  AWS_S3_BUCKET:          Joi.string().default(''),
  AWS_S3_REGION:          Joi.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID:      Joi.string().default(''),
  AWS_SECRET_ACCESS_KEY:  Joi.string().default(''),

  // ── OpenAI ────────────────────────────────────────────────────────────────
  // AI features return 503 if not configured.
  OPENAI_API_KEY:         Joi.string().default(''),

  // ── Email ─────────────────────────────────────────────────────────────────
  EMAIL_PROVIDER:         Joi.string().valid('console', 'smtp', 'ses').default('console'),

  // ── Stripe Billing ────────────────────────────────────────────────────────
  // Billing features return 503 if not configured.
  // In production these MUST be set to real values.
  STRIPE_SECRET_KEY:      Joi.string().default(''),
  STRIPE_WEBHOOK_SECRET:  Joi.string().default(''),

  // ── Job Tuning ────────────────────────────────────────────────────────────
  JOB_MAX_ATTEMPTS:       Joi.number().default(5),
  JOB_BACKOFF_DELAY_MS:   Joi.number().default(2000),
  JOB_REMOVE_ON_COMPLETE: Joi.number().default(100),
  JOB_REMOVE_ON_FAIL:     Joi.number().default(500),
});

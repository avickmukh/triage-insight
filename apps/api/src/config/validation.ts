
import * as Joi from 'joi';

/**
 * Config validation schema.
 *
 * Infrastructure services (Redis, S3, OpenAI) are optional with safe defaults
 * so the API starts and serves requests even without external services configured.
 * Only DATABASE_URL and JWT_SECRET are truly required for the app to function.
 */
export const validationSchema = Joi.object({
  NODE_ENV:               Joi.string().valid('development', 'production', 'test').default('development'),
  PORT:                   Joi.number().default(3000),

  // Required: without these the app cannot authenticate or persist data
  DATABASE_URL:           Joi.string().required(),
  JWT_SECRET:             Joi.string().required(),

  // Optional: Redis / Bull queues — app degrades gracefully without Redis
  REDIS_HOST:             Joi.string().default('localhost'),
  REDIS_PORT:             Joi.number().default(6379),

  // Optional: S3 file uploads — upload endpoints return 503 if not configured
  AWS_S3_BUCKET:          Joi.string().default(''),
  AWS_S3_REGION:          Joi.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID:      Joi.string().default(''),
  AWS_SECRET_ACCESS_KEY:  Joi.string().default(''),

  // Optional: OpenAI — AI features return 503 if not configured
  OPENAI_API_KEY:         Joi.string().default(''),

  // Optional: job tuning
  JOB_MAX_ATTEMPTS:       Joi.number().default(5),
  JOB_BACKOFF_DELAY_MS:   Joi.number().default(2000),
  JOB_REMOVE_ON_COMPLETE: Joi.number().default(100),
  JOB_REMOVE_ON_FAIL:     Joi.number().default(500),
});

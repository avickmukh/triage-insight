import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as path from 'path';
import { PrismaModule } from '../../api/src/prisma/prisma.module';
import { QueueModule } from '../../api/src/queue/queue.module';
import { CommonModule } from '../../api/src/common/common.module';
import { EmailModule } from '../../api/src/email/email.module';
import { validationSchema } from '../../api/src/config/validation';
import { WorkerProcessorsModule } from './processors.module';
import { QueueEventsListener } from './queue-events.listener';

/**
 * Root module for the standalone worker application.
 *
 * ── Architecture ─────────────────────────────────────────────────────────────
 * All Bull @Processor() classes are registered EXCLUSIVELY in
 * WorkerProcessorsModule (./processors.module.ts).
 *
 * ── Why AiModule is NOT imported here ────────────────────────────────────────
 * AiModule is @Global() and provides AI services (EmbeddingService, CiqService,
 * etc.). It does NOT call BullModule.registerQueue() — all queues are registered
 * exclusively in QueueModule.
 *
 * AiModule is loaded transitively:
 *   WorkerProcessorsModule → ThemeModule → AiModule
 *
 * Because AiModule is @Global(), its exports are available everywhere in the
 * DI graph once it is loaded. There is no need to import it again here.
 * Importing it a second time would cause NestJS to instantiate its providers
 * twice (duplicate singleton providers), which can cause subtle runtime bugs.
 *
 * ── Module responsibilities ──────────────────────────────────────────────────
 * PrismaModule   @Global() — PrismaService available everywhere
 * QueueModule    — configures BullMQ Redis connection for all queues
 * CommonModule   @Global() — JobIdempotencyService available everywhere
 * EmailModule    — required by DigestService (used by DigestProcessor)
 * WorkerProcessorsModule — imports all feature modules + registers processors
 *
 * ── .env loading ─────────────────────────────────────────────────────────────
 * ConfigModule.forRoot without envFilePath defaults to loading .env from the
 * current working directory. When the worker is started from apps/worker/
 * (via `nest start` or `pnpm dev`), the CWD is apps/worker/ and the API's
 * .env at apps/api/.env is never found — so OPENAI_API_KEY and other secrets
 * are missing.
 *
 * Fix: explicitly list the canonical .env paths in priority order:
 *   1. apps/api/.env  — the single source of truth for all secrets
 *   2. .env           — monorepo root fallback (docker-compose / CI)
 *
 * The paths are resolved relative to this file's location so they work
 * regardless of the CWD at startup time.
 */

/** Resolve .env paths relative to this file so CWD does not matter */
const API_ENV_PATH  = path.resolve(__dirname, '../../../api/.env');
const ROOT_ENV_PATH = path.resolve(__dirname, '../../../../.env');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Load apps/api/.env first (contains OPENAI_API_KEY and all secrets),
      // then fall back to the monorepo root .env (used in Docker / CI).
      // NestJS merges all files; the first file wins on key conflicts.
      envFilePath: [API_ENV_PATH, ROOT_ENV_PATH],
      validationSchema,
    }),
    // @Global() — PrismaService available everywhere
    PrismaModule,
    // Configures BullMQ Redis connection for all queues
    QueueModule,
    // @Global() — JobIdempotencyService available everywhere
    CommonModule,
    // Required by DigestService which DigestProcessor depends on
    EmailModule,
    // Imports all feature modules + registers all @Processor classes.
    // AiModule is loaded transitively here (via ThemeModule → AiModule).
    // Do NOT import AiModule above — it is @Global() and already available.
    WorkerProcessorsModule,
  ],
  providers: [
    // Attaches structured lifecycle logging to every Bull queue.
    // Logs QUEUE_ACTIVE, QUEUE_COMPLETED, QUEUE_FAILED, QUEUE_STALLED,
    // QUEUE_ERROR, QUEUE_PAUSED, QUEUE_RESUMED events as structured JSON.
    QueueEventsListener,
  ],
})
export class WorkerModule {}

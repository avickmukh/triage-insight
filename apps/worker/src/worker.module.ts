import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
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

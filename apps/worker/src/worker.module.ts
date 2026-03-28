import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../api/src/prisma/prisma.module';
import { QueueModule } from '../../api/src/queue/queue.module';
import { CommonModule } from '../../api/src/common/common.module';
import { EmailModule } from '../../api/src/email/email.module';
import { validationSchema } from '../../api/src/config/validation';
import { WorkerProcessorsModule } from './processors.module';

/**
 * Root module for the standalone worker application.
 *
 * ── Architecture ─────────────────────────────────────────────────────────────
 * All Bull @Processor() classes are registered EXCLUSIVELY in
 * WorkerProcessorsModule (./processors.module.ts).
 *
 * ── Why AiModule is NOT imported here ────────────────────────────────────────
 * AiModule is @Global() and registers the ai-analysis and ciq-scoring queues
 * via BullModule.registerQueue(). WorkerProcessorsModule imports ThemeModule,
 * which in turn imports AiModule. If WorkerModule ALSO imports AiModule
 * directly, the import graph looks like:
 *
 *   WorkerModule → AiModule            (registers ai-analysis, ciq-scoring)
 *   WorkerModule → WorkerProcessorsModule → ThemeModule → AiModule
 *                                       (registers ai-analysis, ciq-scoring again)
 *
 * Even though NestJS deduplicates module class instances, BullModule's dynamic
 * module factory runs once per import path. Bull then calls Queue.process()
 * twice for the same queue instance, hitting setHandler() twice and throwing:
 *   "Cannot define the same handler twice __default__"
 *
 * Solution: AiModule is imported only via WorkerProcessorsModule → ThemeModule.
 * Its @Global() exports (EmbeddingService, CiqService, etc.) are available
 * everywhere in the DI graph without a second explicit import.
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
    // Do NOT import AiModule above — it would register ai-analysis and
    // ciq-scoring queues a second time, causing Bull to crash.
    WorkerProcessorsModule,
  ],
})
export class WorkerModule {}

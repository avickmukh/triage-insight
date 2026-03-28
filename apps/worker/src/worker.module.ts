import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../api/src/prisma/prisma.module';
import { QueueModule } from '../../api/src/queue/queue.module';
import { CommonModule } from '../../api/src/common/common.module';
import { EmailModule } from '../../api/src/email/email.module';
import { AiModule } from '../../api/src/ai/ai.module';
import { validationSchema } from '../../api/src/config/validation';
import { WorkerProcessorsModule } from './processors.module';

/**
 * Root module for the standalone worker application.
 *
 * Architecture
 * ────────────
 * All BullMQ @Processor() classes are registered exclusively in
 * WorkerProcessorsModule (./processors.module.ts). They are NOT in the
 * providers[] of any shared feature module.
 *
 * This prevents the "Cannot define the same handler twice" error that occurs
 * when a processor's parent module is imported by multiple modules in the
 * same NestJS module graph (e.g. AiModule is imported by both WorkerModule
 * and ThemeModule, which is also imported by WorkerModule).
 *
 * Feature modules (SupportModule, ThemeModule, CustomerModule, etc.) are
 * imported ONLY in WorkerProcessorsModule — NOT here. Importing them in both
 * places causes BullModule.registerQueue() to be called twice for the same
 * queue name, which triggers Bull's "Cannot define the same handler twice"
 * error. NestJS module deduplication prevents double-instantiation of the
 * module class, but does NOT prevent BullModule.registerQueue() from running
 * twice when the same module is reachable via two different import paths.
 *
 * PrismaModule is marked @Global() so PrismaService is available everywhere.
 * AiModule is marked @Global() so AI services are available everywhere.
 * CommonModule is @Global() and provides JobIdempotencyService.
 *
 * Processors registered (all in WorkerProcessorsModule):
 * ── Stage-1 Semantic Intelligence ──────────────────────────────────────────
 * - AiAnalysisProcessor        (ai-analysis queue)
 * - CiqScoringProcessor        (ciq-scoring queue)
 * - ThemeClusteringProcessor   (theme-clustering queue)
 * ── Other background workers ────────────────────────────────────────────────
 * - CustomerRevenueSignalProcessor      (customer-revenue-signal)
 * - CustomerSignalAggregationProcessor  (customer-signal-aggregation)
 * - DigestProcessor            (digest)
 * - SlackIngestionProcessor    (slack-ingestion)
 * - PrioritizationWorker       (prioritization)
 * - PortalSignalProcessor      (portal-signal)
 * - PurgeWorker                (workspace-purge)
 * - SyncProcessor              (support-sync)
 * - ClusteringProcessor        (support-clustering)
 * - SpikeDetectionProcessor    (support-spike-detection)
 * - SurveyIntelligenceProcessor (survey-intelligence)
 * - VoiceTranscriptionProcessor (voice-transcription)
 * - VoiceExtractionProcessor   (voice-extraction)
 * - DashboardRefreshWorker      (dashboard-refresh)
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
    }),
    // PrismaModule is @Global() — provides PrismaService everywhere
    PrismaModule,
    // QueueModule configures BullMQ Redis connection for all queues
    QueueModule,
    // CommonModule is @Global() — provides JobIdempotencyService everywhere
    CommonModule,
    // EmailModule — required by DigestService (used by DigestProcessor)
    EmailModule,
    // AiModule is @Global() — provides EmbeddingService, ThemeClusteringService,
    // DuplicateDetectionService, etc. everywhere
    AiModule,
    // WorkerProcessorsModule — imports all feature modules AND registers all
    // @Processor classes. Feature modules must NOT also be imported above.
    WorkerProcessorsModule,
  ],
})
export class WorkerModule {}

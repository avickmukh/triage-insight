import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../api/src/prisma/prisma.module';
import { QueueModule } from '../../api/src/queue/queue.module';
import { CommonModule } from '../../api/src/common/common.module';
import { EmailModule } from '../../api/src/email/email.module';
import { AiModule } from '../../api/src/ai/ai.module';
import { CustomerModule } from '../../api/src/customer/customer.module';
import { DigestModule } from '../../api/src/digest/digest.module';
import { IntegrationsModule } from '../../api/src/integrations/integrations.module';
import { PrioritizationModule } from '../../api/src/prioritization/prioritization.module';
import { PublicPortalModule } from '../../api/src/public/public-portal.module';
import { PurgeModule } from '../../api/src/purge/purge.module';
import { SupportModule } from '../../api/src/support/support.module';
import { SurveyModule } from '../../api/src/survey/survey.module';
import { ThemeModule } from '../../api/src/theme/theme.module';
import { VoiceModule } from '../../api/src/voice/voice.module';
import { DashboardModule } from '../../api/src/dashboard/dashboard.module';
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
 * Feature modules are imported here to make their exported services available
 * as global/shared providers. WorkerProcessorsModule then imports the same
 * feature modules — NestJS deduplicates module instances, so each module is
 * only instantiated once.
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
    // Feature modules — provide exported services to WorkerProcessorsModule
    CustomerModule,
    DigestModule,
    IntegrationsModule,
    PrioritizationModule,
    PublicPortalModule,
    PurgeModule,
    SupportModule,
    SurveyModule,
    ThemeModule,
    VoiceModule,
    DashboardModule,
    // WorkerProcessorsModule — the ONLY place processors are registered
    WorkerProcessorsModule,
  ],
})
export class WorkerModule {}

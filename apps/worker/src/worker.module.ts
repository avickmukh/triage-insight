import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../api/src/prisma/prisma.module';
import { QueueModule } from '../../api/src/queue/queue.module';
import { CommonModule } from '../../api/src/common/common.module';
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

/**
 * The root module for the standalone worker application.
 *
 * Design principle: processors live in their respective API feature modules
 * (AiModule, ThemeModule, etc.) so the business logic stays co-located with
 * the domain code. The worker simply imports those modules, which causes NestJS
 * to instantiate and register every @Processor() class they declare.
 *
 * The API process also imports these modules, but because it does not call
 * NestJS Bull's worker bootstrap, the @Processor decorators are inert there —
 * no queue consumers are attached in the API process.
 *
 * CommonModule is imported explicitly here because it is @Global() in the API
 * app.module.ts but must be declared directly in the worker's root module to
 * be available as a global provider in the worker DI context.
 *
 * Processors registered via their parent modules:
 * - AiAnalysisProcessor        (via AiModule)
 * - CiqScoringProcessor        (via AiModule)
 * - CustomerRevenueSignalProcessor      (via CustomerModule)
 * - CustomerSignalAggregationProcessor  (via CustomerModule)
 * - DigestProcessor            (via DigestModule)
 * - SlackIngestionProcessor    (via IntegrationsModule)
 * - PrioritizationWorker       (via PrioritizationModule)
 * - PortalSignalProcessor      (via PublicPortalModule)
 * - PurgeWorker                (via PurgeModule)
 * - SyncProcessor              (via SupportModule)
 * - ClusteringProcessor        (via SupportModule)
 * - SpikeDetectionProcessor    (via SupportModule)
 * - SurveyIntelligenceProcessor (via SurveyModule)
 * - ThemeClusteringProcessor   (via ThemeModule)
 * - VoiceTranscriptionProcessor (via VoiceModule)
 * - VoiceExtractionProcessor   (via VoiceModule)
 * - DashboardRefreshWorker      (via DashboardModule)
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
    }),
    PrismaModule,
    QueueModule,
    // CommonModule provides JobIdempotencyService (used by every processor).
    // Must be imported here explicitly — @Global() only propagates from the
    // module that declares it as global, which is app.module.ts in the API.
    CommonModule,
    // Feature modules — each registers its own BullMQ processors
    AiModule,
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
  ],
})
export class WorkerModule {}

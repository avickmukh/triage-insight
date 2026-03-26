import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../api/src/prisma/prisma.module';
import { QueueModule } from '../../api/src/queue/queue.module';
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
import { validationSchema } from '../../api/src/config/validation';

/**
 * The root module for the standalone worker application.
 *
 * This module imports all other modules that contain BullMQ processors.
 * By importing the modules themselves (e.g., `AiModule`, `DigestModule`),
 * we let those modules manage their own providers, including their processors.
 * This keeps the worker's setup clean and respects the modular architecture
 * of the main API application.
 *
 * NOTE: The processors are NOT registered in the API modules' providers arrays.
 * They are registered here in the worker app only. This ensures that processors
 * only run in the worker process, not in the API process.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
    }),
    PrismaModule,
    QueueModule,
    // Import all modules that provide BullMQ processors
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
  ],
  providers: [
    // Processors are registered in their respective modules.
    // The worker imports those modules, so the processors are automatically
    // registered when the modules are imported.
    //
    // All processors that were previously registered in the API modules
    // are now registered here via their parent modules:
    // - AiAnalysisProcessor (via AiModule)
    // - CiqScoringProcessor (via AiModule)
    // - CustomerRevenueSignalProcessor (via CustomerModule)
    // - CustomerSignalAggregationProcessor (via CustomerModule)
    // - DigestProcessor (via DigestModule)
    // - SlackIngestionProcessor (via IntegrationsModule)
    // - PrioritizationWorker (via PrioritizationModule)
    // - PortalSignalProcessor (via PublicPortalModule)
    // - PurgeWorker (via PurgeModule)
    // - SyncProcessor (via SupportModule)
    // - ClusteringProcessor (via SupportModule)
    // - SpikeDetectionProcessor (via SupportModule)
    // - SurveyIntelligenceProcessor (via SurveyModule)
    // - ThemeClusteringProcessor (via ThemeModule)
    // - VoiceTranscriptionProcessor (via VoiceModule)
    // - VoiceExtractionProcessor (via VoiceModule)
  ],
})
export class WorkerModule {}

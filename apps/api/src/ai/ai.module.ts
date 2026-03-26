import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { AI_ANALYSIS_QUEUE } from './processors/analysis.processor';
import { CIQ_SCORING_QUEUE } from './processors/ciq-scoring.processor';
import { EmbeddingService } from './services/embedding.service';
import { SummarizationService } from './services/summarization.service';
import { DuplicateDetectionService } from './services/duplicate-detection.service';
import { DuplicateSuggestionsService } from './services/duplicate-suggestions.service';
import { ThemeClusteringService } from './services/theme-clustering.service';
import { CiqService } from './services/ciq.service';
import { AiController } from './ai.controller';
import { DuplicateSuggestionsController } from './controllers/duplicate-suggestions.controller';
import { MergeService } from './services/merge.service';
import { AuditService } from './services/audit.service';
// CiqEngineService is provided here so CiqScoringProcessor can inject it
// without creating a circular dependency (CiqModule → AiModule → CiqModule)
import { CiqEngineService } from '../ciq/ciq-engine.service';

/**
 * Marked @Global() so AI services are available in every module without
 * explicit import. Processors are NOT registered here — they live only in
 * WorkerProcessorsModule to prevent double-registration.
 */
@Global()
@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: AI_ANALYSIS_QUEUE }),
    BullModule.registerQueue({ name: CIQ_SCORING_QUEUE }),
  ],
  controllers: [AiController, DuplicateSuggestionsController],
  providers: [
    CiqEngineService,
    EmbeddingService,
    SummarizationService,
    DuplicateDetectionService,
    DuplicateSuggestionsService,
    ThemeClusteringService,
    CiqService,
    MergeService,
    AuditService,
    // NOTE: AiAnalysisProcessor and CiqScoringProcessor are NOT here.
    // They are registered only in WorkerProcessorsModule
    // (apps/worker/src/processors.module.ts) to prevent double-registration
    // when multiple modules import AiModule (e.g. ThemeModule also imports it).
  ],
  exports: [
    CiqEngineService,
    EmbeddingService,
    SummarizationService,
    DuplicateDetectionService,
    DuplicateSuggestionsService,
    ThemeClusteringService,
    CiqService,
    MergeService,
    AuditService,
  ],
})
export class AiModule {}

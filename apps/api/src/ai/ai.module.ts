import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { AiAnalysisProcessor, AI_ANALYSIS_QUEUE } from './processors/analysis.processor';
import { CiqScoringProcessor, CIQ_SCORING_QUEUE } from './processors/ciq-scoring.processor';
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
    // BullMQ processors — consumed by the worker process only.
    // Registering them here (in the API module) ensures they are available
    // when the worker imports AiModule, while the API process ignores them
    // because it does not connect to a BullMQ worker context.
    AiAnalysisProcessor,
    CiqScoringProcessor,
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

import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmbeddingService } from './services/embedding.service';
import { SummarizationService } from './services/summarization.service';
import { DuplicateDetectionService } from './services/duplicate-detection.service';
import { DuplicateSuggestionsService } from './services/duplicate-suggestions.service';
import { ThemeClusteringService } from './services/theme-clustering.service';
import { CiqService } from './services/ciq.service';
import { SentimentService } from './services/sentiment.service';
import { ThemeNarrationService } from './services/theme-narration.service';
import { AiController } from './ai.controller';
import { DuplicateSuggestionsController } from './controllers/duplicate-suggestions.controller';
import { MergeService } from './services/merge.service';
import { AuditService } from './services/audit.service';
import { AutoMergeService } from './services/auto-merge.service';
import { ThemeLabelService } from './services/theme-label.service';
import { TrendComputationService } from './services/trend-computation.service';
import { ExplainableInsightsService } from './services/explainable-insights.service';
import { ClusterRefinementService } from './services/cluster-refinement.service';
import { IntentClassifierService } from './services/intent-classifier.service';
import { IssueDimensionService } from './services/issue-dimension.service';
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
  imports: [PrismaModule],
  controllers: [AiController, DuplicateSuggestionsController],
  providers: [
    CiqEngineService,
    EmbeddingService,
    SummarizationService,
    DuplicateDetectionService,
    DuplicateSuggestionsService,
    ThemeClusteringService,
    CiqService,
    SentimentService,
    ThemeNarrationService,
    MergeService,
    AuditService,
    AutoMergeService,
    ThemeLabelService,
    TrendComputationService,
    ExplainableInsightsService,
    ClusterRefinementService,
    IntentClassifierService,
    IssueDimensionService,
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
    SentimentService,
    ThemeNarrationService,
    MergeService,
    AuditService,
    AutoMergeService,
    ThemeLabelService,
    TrendComputationService,
    ExplainableInsightsService,
    ClusterRefinementService,
    IntentClassifierService,
    IssueDimensionService,
  ],
})
export class AiModule {}

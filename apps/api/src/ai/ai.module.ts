import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { AI_ANALYSIS_QUEUE, AiAnalysisProcessor } from './processors/analysis.processor';
import { CIQ_SCORING_QUEUE, CiqScoringProcessor } from './processors/ciq-scoring.processor';
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

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: AI_ANALYSIS_QUEUE }),
    BullModule.registerQueue({ name: CIQ_SCORING_QUEUE }),
  ],
  controllers: [AiController, DuplicateSuggestionsController],
  providers: [
    AiAnalysisProcessor,
    CiqScoringProcessor,
    EmbeddingService,
    SummarizationService,
    DuplicateDetectionService,
    DuplicateSuggestionsService,
    ThemeClusteringService,
    CiqService,
    MergeService,
    AuditService,
  ],
  exports: [
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

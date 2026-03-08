import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { AI_ANALYSIS_QUEUE, AiAnalysisProcessor } from './processors/analysis.processor';
import { EmbeddingService } from './services/embedding.service';
import { SummarizationService } from './services/summarization.service';
import { DuplicateDetectionService } from './services/duplicate-detection.service';
import { ThemeClusteringService } from './services/theme-clustering.service';
import { AiController } from './ai.controller';
import { MergeService } from './services/merge.service';
import { AuditService } from './services/audit.service';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: AI_ANALYSIS_QUEUE }),
  ],
  controllers: [AiController],
  providers: [
    AiAnalysisProcessor,
    EmbeddingService,
    SummarizationService,
    DuplicateDetectionService,
    ThemeClusteringService,
    MergeService,
    AuditService,
  ],
  exports: [
    EmbeddingService,
    SummarizationService,
    DuplicateDetectionService,
    ThemeClusteringService,
    MergeService,
    AuditService,
  ],
})
export class AiModule {}

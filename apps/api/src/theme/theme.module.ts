import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { ThemeService, AI_CLUSTERING_QUEUE } from './services/theme.service';
import { ThemeController } from './theme.controller';
import { ThemeRepository } from './repositories/theme.repository';
import { CIQ_SCORING_QUEUE } from '../ai/processors/ciq-scoring.processor';
import { DealModule } from '../deal/deal.module';
import { UnifiedAggregationService } from './services/unified-aggregation.service';
import { UNIFIED_AGGREGATION_QUEUE } from './processors/unified-aggregation.processor';

@Module({
  imports: [
    PrismaModule,
    AiModule,

    DealModule,
  ],
  controllers: [ThemeController],
  providers: [ThemeService, ThemeRepository, UnifiedAggregationService],
  // ThemeService, ThemeRepository, and UnifiedAggregationService exported so
  // WorkerProcessorsModule can resolve processor dependencies.
  exports: [ThemeService, ThemeRepository, UnifiedAggregationService],
})
export class ThemeModule {}

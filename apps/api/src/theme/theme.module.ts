import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { ThemeService } from './services/theme.service';
import { ThemeController } from './theme.controller';
import { ThemeRepository } from './repositories/theme.repository';
import { DealModule } from '../deal/deal.module';
import { UnifiedAggregationService } from './services/unified-aggregation.service';

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

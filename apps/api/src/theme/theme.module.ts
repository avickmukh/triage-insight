import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { ThemeService, AI_CLUSTERING_QUEUE } from './services/theme.service';
import { ThemeController } from './theme.controller';
import { ThemeRepository } from './repositories/theme.repository';
import { CIQ_SCORING_QUEUE } from '../ai/processors/ciq-scoring.processor';
import { DealModule } from '../deal/deal.module';

@Module({
  imports: [
    PrismaModule,
    AiModule,
    BullModule.registerQueue({ name: AI_CLUSTERING_QUEUE }),
    BullModule.registerQueue({ name: CIQ_SCORING_QUEUE }),
    DealModule,
  ],
  controllers: [ThemeController],
  providers: [ThemeService, ThemeRepository],
  // ThemeService and ThemeRepository exported so WorkerProcessorsModule can
  // resolve ThemeClusteringProcessor's dependencies.
  exports: [ThemeService, ThemeRepository],
})
export class ThemeModule {}

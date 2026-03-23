import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { PrismaModule } from "../prisma/prisma.module";
import { AiModule } from "../ai/ai.module";
import { PrioritizationController } from "./prioritization.controller";
import { PrioritizationService } from "./services/prioritization.service";
import { AggregationService } from "./services/aggregation.service";
import { ScoringService } from "./services/scoring.service";
import { PrioritizationCacheService } from "./services/prioritization-cache.service";
import { PrioritizationWorker, PRIORITIZATION_QUEUE } from "./workers/prioritization.worker";
import { CIQ_SCORING_QUEUE } from "../ai/processors/ciq-scoring.processor";

@Module({
  imports: [
    PrismaModule,
    AiModule,
    BullModule.registerQueue({ name: CIQ_SCORING_QUEUE }),
    BullModule.registerQueue({ name: PRIORITIZATION_QUEUE }),
  ],
  controllers: [PrioritizationController],
  providers: [
    PrioritizationService,
    AggregationService,
    ScoringService,
    PrioritizationCacheService,
    PrioritizationWorker,
  ],
  exports: [PrioritizationService, AggregationService, ScoringService, PrioritizationCacheService],
})
export class PrioritizationModule {}

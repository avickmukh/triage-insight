import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AiModule } from "../ai/ai.module";
import { PrioritizationController } from "./prioritization.controller";
import { PrioritizationService } from "./services/prioritization.service";
import { AggregationService } from "./services/aggregation.service";
import { ScoringService } from "./services/scoring.service";
import { PrioritizationCacheService } from "./services/prioritization-cache.service";
import { ActionPlanService } from "./services/action-plan.service";

@Module({
  imports: [
    PrismaModule,
    AiModule,

  ],
  controllers: [PrioritizationController],
  providers: [
    PrioritizationService,
    AggregationService,
    ScoringService,
    PrioritizationCacheService,
    ActionPlanService,
  ],
  exports: [PrioritizationService, AggregationService, ScoringService, PrioritizationCacheService, ActionPlanService],
})
export class PrioritizationModule {}

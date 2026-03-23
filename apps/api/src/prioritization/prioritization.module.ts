import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { PrismaModule } from "../prisma/prisma.module";
import { AiModule } from "../ai/ai.module";
import { PrioritizationController } from "./prioritization.controller";
import { PrioritizationService } from "./services/prioritization.service";
import { AggregationService } from "./services/aggregation.service";
import { ScoringService } from "./services/scoring.service";
import { CIQ_SCORING_QUEUE } from "../ai/processors/ciq-scoring.processor";

@Module({
  imports: [
    PrismaModule,
    AiModule,
    BullModule.registerQueue({ name: CIQ_SCORING_QUEUE }),
  ],
  controllers: [PrioritizationController],
  providers: [PrioritizationService, AggregationService, ScoringService],
  // CiqService is provided and exported by AiModule — no re-declaration needed here
  exports: [PrioritizationService, AggregationService, ScoringService],
})
export class PrioritizationModule {}

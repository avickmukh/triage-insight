import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AiModule } from "../ai/ai.module";
import { PrioritizationController } from "./prioritization.controller";
import { PrioritizationService } from "./services/prioritization.service";
import { AggregationService } from "./services/aggregation.service";
import { ScoringService } from "./services/scoring.service";

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [PrioritizationController],
  providers: [PrioritizationService, AggregationService, ScoringService],
  // CiqService is provided and exported by AiModule — no re-declaration needed here
  exports: [PrioritizationService, AggregationService, ScoringService],
})
export class PrioritizationModule {}

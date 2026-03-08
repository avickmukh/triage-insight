import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AiModule } from "../ai/ai.module";
import { PrioritizationModule } from "../prioritization/prioritization.module";
import { RoadmapController } from "./roadmap.controller";
import { RoadmapService } from "./services/roadmap.service";
import { PrioritizationService } from "../prioritization/services/prioritization.service";
import { AggregationService } from "../prioritization/services/aggregation.service";
import { ScoringService } from "../prioritization/services/scoring.service";

@Module({
  imports: [PrismaModule, AiModule, PrioritizationModule],
  controllers: [RoadmapController],
  providers: [
    RoadmapService,
    PrioritizationService,
    AggregationService,
    ScoringService,
  ],
})
export class RoadmapModule {}

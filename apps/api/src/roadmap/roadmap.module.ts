import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AiModule } from "../ai/ai.module";
import { RoadmapController } from "./roadmap.controller";
import { RoadmapService } from "./services/roadmap.service";
import { RoadmapIntelligenceService } from "./services/roadmap-intelligence.service";

@Module({
  imports: [
    PrismaModule,
    AiModule,
  ],
  controllers: [RoadmapController],
  providers: [RoadmapService, RoadmapIntelligenceService],
  exports: [RoadmapIntelligenceService],
  // CiqService is exported by AiModule — no need to re-declare here
})
export class RoadmapModule {}

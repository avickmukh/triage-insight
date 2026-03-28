import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { PrismaModule } from "../prisma/prisma.module";
import { AiModule } from "../ai/ai.module";
import { CIQ_SCORING_QUEUE } from "../ai/processors/ciq-scoring.processor";
import { RoadmapController } from "./roadmap.controller";
import { RoadmapService } from "./services/roadmap.service";

@Module({
  imports: [
    PrismaModule,
    AiModule,
  ],
  controllers: [RoadmapController],
  providers: [RoadmapService],
  // CiqService is exported by AiModule — no need to re-declare here
})
export class RoadmapModule {}

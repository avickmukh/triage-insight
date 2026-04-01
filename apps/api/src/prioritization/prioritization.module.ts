import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AiModule } from "../ai/ai.module";
import { PrioritizationController } from "./prioritization.controller";
import { PrioritizationService } from "./services/prioritization.service";
import { AggregationService } from "./services/aggregation.service";
import { ScoringService } from "./services/scoring.service";
import { PrioritizationCacheService } from "./services/prioritization-cache.service";
import { ActionPlanService } from "./services/action-plan.service";
import { ExecutiveDashboardService } from "./services/executive-dashboard.service";
import { TrendAlertService } from "./services/trend-alert.service";
import { ThemeRankingEngine } from "./services/theme-ranking-engine.service";

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
    ThemeRankingEngine,
    ActionPlanService,
    TrendAlertService,
    ExecutiveDashboardService,
  ],
  exports: [PrioritizationService, AggregationService, ScoringService, PrioritizationCacheService, ThemeRankingEngine, ActionPlanService, TrendAlertService, ExecutiveDashboardService],
})
export class PrioritizationModule {}

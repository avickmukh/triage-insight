import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { DashboardController } from './dashboard.controller';
import { DashboardAggregationService } from './services/dashboard-aggregation.service';
import { ExecutiveInsightService } from './services/executive-insight.service';
import { DashboardCacheService } from './services/dashboard-cache.service';
import { DashboardRefreshWorker, DASHBOARD_QUEUE } from './workers/dashboard-refresh.worker';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
  ],
  controllers: [DashboardController],
  providers: [
    DashboardAggregationService,
    ExecutiveInsightService,
    DashboardCacheService,
  ],
  exports: [DashboardAggregationService, ExecutiveInsightService, DashboardCacheService],
})
export class DashboardModule {}

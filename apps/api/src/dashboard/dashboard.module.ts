import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardAggregationService } from './services/dashboard-aggregation.service';
import { ExecutiveInsightService } from './services/executive-insight.service';
import { DashboardCacheService } from './services/dashboard-cache.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DashboardController],
  providers: [
    DashboardAggregationService,
    ExecutiveInsightService,
    DashboardCacheService,
  ],
  exports: [
    DashboardAggregationService,
    ExecutiveInsightService,
    DashboardCacheService,
  ],
})
export class DashboardModule {}

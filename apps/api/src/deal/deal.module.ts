import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { DealController } from './deal.controller';
import { DealService } from './deal.service';
import { CUSTOMER_REVENUE_SIGNAL_QUEUE } from '../customer/processors/customer-revenue-signal.processor';
import { CIQ_SCORING_QUEUE } from '../ai/processors/ciq-scoring.processor';

@Module({
  imports: [
    PrismaModule,

  ],
  controllers: [DealController],
  providers: [DealService],
  exports: [DealService],
})
export class DealModule {}

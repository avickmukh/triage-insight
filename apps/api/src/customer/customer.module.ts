import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import {
  CUSTOMER_REVENUE_SIGNAL_QUEUE,
} from './processors/customer-revenue-signal.processor';
import {
  CUSTOMER_SIGNAL_AGGREGATION_QUEUE,
} from './processors/customer-signal-aggregation.processor';
import { CIQ_SCORING_QUEUE } from '../ai/processors/ciq-scoring.processor';

@Module({
  imports: [
    PrismaModule,

    // CIQ queue is needed so the revenue signal processor can enqueue re-scoring jobs
  ],
  controllers: [CustomerController],
  providers: [
    CustomerService,
  ],
  exports: [CustomerService],
})
export class CustomerModule {}

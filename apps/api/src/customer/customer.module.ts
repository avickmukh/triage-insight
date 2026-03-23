import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import {
  CUSTOMER_REVENUE_SIGNAL_QUEUE,
  CustomerRevenueSignalProcessor,
} from './processors/customer-revenue-signal.processor';
import { CIQ_SCORING_QUEUE } from '../ai/processors/ciq-scoring.processor';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: CUSTOMER_REVENUE_SIGNAL_QUEUE }),
    // CIQ queue is needed so the processor can enqueue re-scoring jobs
    BullModule.registerQueue({ name: CIQ_SCORING_QUEUE }),
  ],
  controllers: [CustomerController],
  providers: [CustomerService, CustomerRevenueSignalProcessor],
  exports: [CustomerService],
})
export class CustomerModule {}

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { BullModule } from '@nestjs/bull';
import { DigestModule } from '../digest/digest.module';
import { DIGEST_QUEUE } from '../digest/digest.processor';
import { DigestScheduler } from './digest.scheduler';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    DigestModule,
  ],
  providers: [DigestScheduler],
})
export class SchedulerModule {}

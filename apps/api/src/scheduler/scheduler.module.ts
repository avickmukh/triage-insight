import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { DigestModule } from '../digest/digest.module';
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

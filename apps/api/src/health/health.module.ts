
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { BullModule } from '@nestjs/bull';
import { HealthController } from './health.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { QUEUE_NAMES } from '../queue/queue.module';

/**
 * HealthModule
 *
 * Provides the GET /health endpoint for liveness and readiness probes.
 * Checks: PostgreSQL (via Prisma), Redis (via Bull queue client), and
 * queue depth for the two highest-volume queues.
 */
@Module({
  imports: [
    TerminusModule,
    PrismaModule,
  ],
  controllers: [HealthController],
})
export class HealthModule {}

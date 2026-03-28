import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { QueueHealthController } from './queue-health.controller';
import { QueueHealthService } from './queue-health.service';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * HealthModule
 *
 * Provides two health endpoints:
 *
 *   GET /health         — Terminus liveness/readiness probe (DB + Redis + two
 *                         high-volume queue depths). Used by k8s probes.
 *
 *   GET /health/queues  — Full queue-depth report for all 20 Bull queues.
 *                         Used by monitoring dashboards and on-call runbooks.
 *
 * Both endpoints are unauthenticated so that external probes can reach them
 * without credentials. Queue tokens are resolved from QueueModule, which is
 * @Global() and imported by AppModule → WorkerModule.
 */
@Module({
  imports: [
    TerminusModule,
    PrismaModule,
  ],
  controllers: [HealthController, QueueHealthController],
  providers: [QueueHealthService],
})
export class HealthModule {}

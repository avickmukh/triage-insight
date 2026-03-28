import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { PurgeService, PURGE_QUEUE } from './purge.service';
import { PurgeWorker } from './purge.worker';
import { PurgeWorkspaceController, PurgePlatformController } from './purge.controller';
import { WorkspaceFreezeGuard } from './workspace-freeze.guard';
import { StoragePurgeStep } from './steps/storage-purge.step';
import { DatabasePurgeStep } from './steps/database-purge.step';
import { QueuePurgeStep } from './steps/queue-purge.step';
import { TokenRevocationStep } from './steps/token-revocation.step';
import { QUEUE_NAMES } from '../queue/queue.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    // Register the purge queue
    // QueuePurgeStep needs to inject all existing queues to drain them

  ],
  controllers: [PurgeWorkspaceController, PurgePlatformController],
  providers: [
    PurgeService,
    WorkspaceFreezeGuard,
    StoragePurgeStep,
    DatabasePurgeStep,
    QueuePurgeStep,
    TokenRevocationStep,
  ],
  exports: [
    PurgeService,
    WorkspaceFreezeGuard,
    // Step services exported so PurgeWorker (in WorkerProcessorsModule) can resolve them
    StoragePurgeStep,
    DatabasePurgeStep,
    QueuePurgeStep,
    TokenRevocationStep,
  ],
})
export class PurgeModule {}

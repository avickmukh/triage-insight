import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { PurgeService } from './purge.service';
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

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { SupportController } from './support.controller';
import { IngestionService } from './services/ingestion.service';
import { TicketService } from './services/ticket.service';
import { ClusteringService } from './services/clustering.service';
import { SpikeDetectionService } from './services/spike-detection.service';
import { SentimentService } from './services/sentiment.service';

/**
 * SupportModule — provides support-ticket services and the HTTP controller.
 *
 * IMPORTANT: Processor classes (SyncProcessor, ClusteringProcessor,
 * SpikeDetectionProcessor, SentimentProcessor) are intentionally NOT listed
 * in providers[]. They are registered exclusively in WorkerProcessorsModule
 * (apps/worker/src/processors.module.ts).
 *
 * Registering a @Process() handler in two NestJS modules that are both
 * imported by WorkerModule causes Bull to throw:
 *   "Cannot define the same handler twice __default__"
 *
 * The queues are still registered here so that services in this module can
 * call queue.add() (e.g. IngestionService enqueues support-sync jobs).
 */
@Module({
  imports: [
    PrismaModule,
    IntegrationsModule,
    BullModule.registerQueue(
      { name: 'support-sync' },
      { name: 'support-clustering' },
      { name: 'support-spike-detection' },
      { name: 'support-sentiment' },
      // Required by ClusteringProcessor which enqueues CIQ re-scoring jobs
      // after correlateWithFeedback() links support clusters to themes.
      { name: 'ciq-scoring' },
    ),
  ],
  controllers: [SupportController],
  providers: [
    IngestionService,
    TicketService,
    ClusteringService,
    SpikeDetectionService,
    SentimentService,
    // Processors (SyncProcessor, ClusteringProcessor, SpikeDetectionProcessor,
    // SentimentProcessor) are NOT here — registered exclusively in
    // WorkerProcessorsModule to prevent Bull "same handler twice" crash.
  ],
  exports: [
    IngestionService,
    TicketService,
    ClusteringService,
    SpikeDetectionService,
    SentimentService,
  ],
})
export class SupportModule {}

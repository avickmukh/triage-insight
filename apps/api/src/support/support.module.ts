import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { SupportController } from './support.controller';
import { IngestionService } from './services/ingestion.service';
import { TicketService } from './services/ticket.service';
import { ClusteringService } from './services/clustering.service';
import { SpikeDetectionService } from './services/spike-detection.service';
import { SyncProcessor } from './processors/sync.processor';
import { ClusteringProcessor } from './processors/clustering.processor';
import { SpikeDetectionProcessor } from './processors/spike-detection.processor';
import { SentimentService } from './services/sentiment.service';
import { SentimentProcessor } from './processors/sentiment.processor';

@Module({
  imports: [
    PrismaModule,
    IntegrationsModule,
    BullModule.registerQueue(
      { name: 'support-sync' },
      { name: 'support-clustering' },
      { name: 'support-spike-detection' },
      { name: 'support-sentiment' },
    ),
  ],
  controllers: [SupportController],
  providers: [
    IngestionService,
    TicketService,
    ClusteringService,
    SpikeDetectionService,
    SentimentService,
    SyncProcessor,
    ClusteringProcessor,
    SpikeDetectionProcessor,
    SentimentProcessor,
  ],
  exports: [IngestionService, TicketService, ClusteringService, SpikeDetectionService, SentimentService],
})
export class SupportModule {}

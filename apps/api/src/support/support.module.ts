import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { FeedbackModule } from '../feedback/feedback.module';
import { SupportController } from './support.controller';
import { IngestionService } from './services/ingestion.service';
import { TicketService } from './services/ticket.service';
import { ClusteringService } from './services/clustering.service';
import { SpikeDetectionService } from './services/spike-detection.service';
import { SentimentService } from './services/sentiment.service';

/**
 * SupportModule — provides support-ticket services and the HTTP controller.
 *
 * Queue tokens (support-sync, support-clustering, support-spike-detection,
 * support-sentiment, ciq-scoring, ai-analysis) are resolved from the global
 * QueueModule — no BullModule.registerQueue() calls needed here.
 *
 * Processor classes are NOT in providers[]. They live exclusively in
 * WorkerProcessorsModule to prevent Bull "Cannot define the same handler twice".
 *
 * FeedbackModule is imported so IngestionService can inject the AI_ANALYSIS_QUEUE
 * token to bridge newly ingested SupportTickets into the unified Feedback pipeline.
 */
@Module({
  imports: [
    PrismaModule,
    IntegrationsModule,
    FeedbackModule,
  ],
  controllers: [SupportController],
  providers: [
    IngestionService,
    TicketService,
    ClusteringService,
    SpikeDetectionService,
    SentimentService,
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

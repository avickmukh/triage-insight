import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationService } from './services/integration.service';
import { SlackService } from './providers/slack.service';
import { SlackIngestionService } from './services/slack-ingestion.service';
import { SlackIngestionProcessor, SLACK_INGESTION_QUEUE } from './processors/slack-ingestion.processor';
import { AI_ANALYSIS_QUEUE } from '../ai/processors/analysis.processor';
import { CIQ_SCORING_QUEUE } from '../ai/processors/ciq-scoring.processor';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue(
      { name: 'support-sync' },
      { name: SLACK_INGESTION_QUEUE },
      { name: AI_ANALYSIS_QUEUE },
      { name: CIQ_SCORING_QUEUE },
    ),
  ],
  controllers: [IntegrationsController],
  providers: [
    IntegrationService,
    SlackService,
    SlackIngestionService,

  ],
  exports: [IntegrationService, SlackService, SlackIngestionService],
})
export class IntegrationsModule {}

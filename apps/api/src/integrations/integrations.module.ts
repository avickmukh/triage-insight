import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationService } from './services/integration.service';
import { SlackService } from './providers/slack.service';
import { SlackIngestionService } from './services/slack-ingestion.service';
@Module({
  imports: [PrismaModule],
  controllers: [IntegrationsController],
  providers: [IntegrationService, SlackService, SlackIngestionService],
  exports: [IntegrationService, SlackService, SlackIngestionService],
})
export class IntegrationsModule {}

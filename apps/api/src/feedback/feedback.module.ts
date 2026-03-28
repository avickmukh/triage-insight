import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';
import { AiModule } from '../ai/ai.module';
import { FeedbackService } from './feedback.service';
import { FeedbackController, PublicFeedbackController } from './feedback.controller';
import { PublicPortalService } from './ingestion/public-portal.service';
import { CsvImportService } from './ingestion/csv-import.service';
import { EmailIngestionService } from './ingestion/email.service';
import { SlackIngestionService } from './ingestion/slack.service';
import { VoiceIngestionService } from './ingestion/voice.service';
import { PlanLimitService } from '../billing/plan-limit.service';

@Module({
  imports: [
    PrismaModule,
    UploadsModule,
    AiModule,
  ],
  controllers: [FeedbackController, PublicFeedbackController],
  providers: [
    FeedbackService,
    PublicPortalService,
    CsvImportService,
    EmailIngestionService,
    SlackIngestionService,
    VoiceIngestionService,
    PlanLimitService,
  ],
  exports: [FeedbackService],
})
export class FeedbackModule {}

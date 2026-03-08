import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';
import { FeedbackService } from './feedback.service';
import { FeedbackController, PublicFeedbackController } from './feedback.controller';
import { PublicPortalService } from './ingestion/public-portal.service';
import { CsvImportService } from './ingestion/csv-import.service';
import { EmailIngestionService } from './ingestion/email.service';
import { SlackIngestionService } from './ingestion/slack.service';
import { VoiceIngestionService } from './ingestion/voice.service';
import { AI_ANALYSIS_QUEUE } from '../ai/processors/analysis.processor';

@Module({
  imports: [
    PrismaModule,
    UploadsModule,
    BullModule.registerQueue({ name: AI_ANALYSIS_QUEUE }),
  ],
  controllers: [FeedbackController, PublicFeedbackController],
  providers: [
    FeedbackService,
    PublicPortalService,
    CsvImportService,
    EmailIngestionService,
    SlackIngestionService,
    VoiceIngestionService,
  ],
})
export class FeedbackModule {}

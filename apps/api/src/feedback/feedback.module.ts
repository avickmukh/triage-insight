import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { FeedbackService } from './feedback.service';
import { FeedbackController, PublicFeedbackController } from './feedback.controller';
import { S3Service } from './s3/s3.service';
import { PublicPortalService } from './ingestion/public-portal.service';
import { CsvImportService } from './ingestion/csv-import.service';
import { EmailIngestionService } from './ingestion/email.service';
import { SlackIngestionService } from './ingestion/slack.service';
import { VoiceIngestionService } from './ingestion/voice.service';
import { AiAnalysisProcessor, AI_ANALYSIS_QUEUE } from './processors/analysis.processor';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: AI_ANALYSIS_QUEUE }),
  ],
  controllers: [FeedbackController, PublicFeedbackController],
  providers: [
    FeedbackService,
    S3Service,
    PublicPortalService,
    CsvImportService,
    EmailIngestionService,
    SlackIngestionService,
    VoiceIngestionService,
    AiAnalysisProcessor,
  ],
})
export class FeedbackModule {}

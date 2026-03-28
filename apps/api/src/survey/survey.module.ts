import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { SurveyService } from './services/survey.service';
import { SurveyIntelligenceService } from './services/survey-intelligence.service';
import { SURVEY_INTELLIGENCE_QUEUE } from './processors/survey-intelligence.processor';
import { SurveyController, PublicSurveyController } from './survey.controller';
import { CIQ_SCORING_QUEUE } from '../ai/processors/ciq-scoring.processor';

@Module({
  imports: [
    PrismaModule,
    AiModule,

  ],
  controllers: [SurveyController, PublicSurveyController],
  providers: [SurveyService, SurveyIntelligenceService],
  // SurveyIntelligenceService exported so WorkerProcessorsModule can resolve
  // SurveyIntelligenceProcessor's dependency.
  exports: [SurveyService, SurveyIntelligenceService],
})
export class SurveyModule {}

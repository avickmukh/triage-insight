import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { SurveyService } from './services/survey.service';
import { SurveyIntelligenceService } from './services/survey-intelligence.service';
import { SurveyIntelligenceProcessor, SURVEY_INTELLIGENCE_QUEUE } from './processors/survey-intelligence.processor';
import { SurveyController, PublicSurveyController } from './survey.controller';

@Module({
  imports: [
    PrismaModule,
    AiModule,
    BullModule.registerQueue({ name: SURVEY_INTELLIGENCE_QUEUE }),
  ],
  controllers: [SurveyController, PublicSurveyController],
  providers: [SurveyService, SurveyIntelligenceService, SurveyIntelligenceProcessor],
  exports: [SurveyService],
})
export class SurveyModule {}

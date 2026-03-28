import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { SurveyService } from './services/survey.service';
import { SurveyIntelligenceService } from './services/survey-intelligence.service';
import { SurveyController, PublicSurveyController } from './survey.controller';

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

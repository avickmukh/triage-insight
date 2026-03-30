import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { SurveyService } from './services/survey.service';
import { SurveyIntelligenceService } from './services/survey-intelligence.service';
import { SurveyEvidenceService } from './services/survey-evidence.service';
import { SurveyController, PublicSurveyController } from './survey.controller';

@Module({
  imports: [
    PrismaModule,
    AiModule,
  ],
  controllers: [SurveyController, PublicSurveyController],
  providers: [SurveyService, SurveyIntelligenceService, SurveyEvidenceService],
  // All three services exported so WorkerProcessorsModule can resolve
  // SurveyIntelligenceProcessor's dependencies.
  exports: [SurveyService, SurveyIntelligenceService, SurveyEvidenceService],
})
export class SurveyModule {}

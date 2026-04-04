import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { SurveyService } from './services/survey.service';
import { SurveyIntelligenceService } from './services/survey-intelligence.service';
import { SurveyEvidenceService } from './services/survey-evidence.service';
import {
  SurveyController,
  PublicSurveyController,
  SurveyAdminController,
} from './survey.controller';
import { SurveyBackfillService } from './scripts/survey-backfill.service';

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [
    SurveyController,
    PublicSurveyController,
    SurveyAdminController,
  ],
  providers: [
    SurveyService,
    SurveyIntelligenceService,
    SurveyEvidenceService,
    SurveyBackfillService,
  ],
  // All services exported so WorkerProcessorsModule can resolve
  // SurveyIntelligenceProcessor's dependencies.
  exports: [
    SurveyService,
    SurveyIntelligenceService,
    SurveyEvidenceService,
    SurveyBackfillService,
  ],
})
export class SurveyModule {}

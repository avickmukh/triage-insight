import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SurveyService } from './services/survey.service';
import { SurveyController, PublicSurveyController } from './survey.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SurveyController, PublicSurveyController],
  providers: [SurveyService],
  exports: [SurveyService],
})
export class SurveyModule {}

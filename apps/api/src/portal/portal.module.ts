import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { AI_ANALYSIS_QUEUE } from '../ai/processors/analysis.processor';
import { PORTAL_SIGNAL_QUEUE } from '../public/portal-signal.constants';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { VoiceModule } from '../voice/voice.module';

@Module({
  imports: [
    PrismaModule,

    VoiceModule,
  ],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}

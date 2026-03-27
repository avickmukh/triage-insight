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
    BullModule.registerQueue({ name: AI_ANALYSIS_QUEUE }),
    BullModule.registerQueue({ name: PORTAL_SIGNAL_QUEUE }),
    VoiceModule,
  ],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { PORTAL_SIGNAL_QUEUE } from './portal-signal.constants';
import { AI_ANALYSIS_QUEUE } from '../ai/processors/analysis.processor';
import { CIQ_SCORING_QUEUE } from '../ai/processors/ciq-scoring.processor';
import { PublicPortalController } from './public-portal.controller';
import { PublicPortalService } from './public-portal.service';
import { PortalSignalProcessor } from './processors/portal-signal.processor';
import { PortalSseGateway } from './gateway/portal-sse.gateway';

@Module({
  imports: [
    PrismaModule,

  ],
  controllers: [PublicPortalController],
  providers: [
    PublicPortalService,
    PortalSseGateway,
  ],
  exports: [PortalSseGateway],
})
export class PublicPortalModule {}

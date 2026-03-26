import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { PORTAL_SIGNAL_QUEUE } from './portal-signal.constants';
import { CIQ_SCORING_QUEUE } from '../ai/processors/ciq-scoring.processor';
import { PublicPortalController } from './public-portal.controller';
import { PublicPortalService } from './public-portal.service';
import { PortalSignalProcessor } from './processors/portal-signal.processor';
import { PortalSseGateway } from './gateway/portal-sse.gateway';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: PORTAL_SIGNAL_QUEUE }),
    BullModule.registerQueue({ name: CIQ_SCORING_QUEUE }),
  ],
  controllers: [PublicPortalController],
  providers: [
    PublicPortalService,
    
    PortalSseGateway,
  ],
  exports: [PortalSseGateway],
})
export class PublicPortalModule {}

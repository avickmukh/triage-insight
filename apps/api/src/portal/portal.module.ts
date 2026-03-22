import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { AI_ANALYSIS_QUEUE } from '../ai/processors/analysis.processor';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: AI_ANALYSIS_QUEUE }),
  ],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}

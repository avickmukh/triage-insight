import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
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

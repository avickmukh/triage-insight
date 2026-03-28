import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PrioritizationModule } from '../prioritization/prioritization.module';
import { CiqEngineService } from './ciq-engine.service';
import { CiqController } from './ciq.controller';

@Module({
  imports: [PrismaModule, PrioritizationModule],
  controllers: [CiqController],
  providers: [CiqEngineService],
  exports: [CiqEngineService],
})
export class CiqModule {}

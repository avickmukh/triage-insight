import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { DigestService } from './digest.service';
import { DigestProcessor, DIGEST_QUEUE } from './digest.processor';
import { DigestController } from './digest.controller';

@Module({
  imports: [
    PrismaModule,
    AiModule,
    BullModule.registerQueue({ name: DIGEST_QUEUE }),
  ],
  controllers: [DigestController],
  providers: [DigestService, DigestProcessor],
})
export class DigestModule {}

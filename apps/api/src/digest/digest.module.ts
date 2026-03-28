import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { DigestService } from './digest.service';
import { DigestProcessor, DIGEST_QUEUE } from './digest.processor';
import { DigestController } from './digest.controller';

// ConfigService is provided globally via ConfigModule.forRoot({ isGlobal: true }) in AppModule.
// DigestService calls OpenAI directly — AiModule is no longer needed here.
@Module({
  imports: [
    PrismaModule,
  ],
  controllers: [DigestController],
  providers: [DigestService],
  exports: [DigestService],
})
export class DigestModule {}

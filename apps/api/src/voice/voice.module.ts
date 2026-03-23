import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';
import { VoiceController } from './voice.controller';
import { VoiceService, VOICE_TRANSCRIPTION_QUEUE } from './services/voice.service';
import { TranscriptionService } from './services/transcription.service';
import { VoiceTranscriptionProcessor } from './processors/voice-transcription.processor';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    PrismaModule,
    UploadsModule,
    AiModule,
    BullModule.registerQueue({ name: VOICE_TRANSCRIPTION_QUEUE }),
  ],
  controllers: [VoiceController],
  providers: [VoiceService, TranscriptionService, VoiceTranscriptionProcessor],
  exports: [VoiceService],
})
export class VoiceModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';
import { VoiceController } from './voice.controller';
import { VoiceService } from './services/voice.service';
import { TranscriptionService } from './services/transcription.service';
import { VoiceIntelligenceService } from './services/voice-intelligence.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [PrismaModule, UploadsModule, AiModule],
  controllers: [VoiceController],
  providers: [VoiceService, TranscriptionService, VoiceIntelligenceService],
  // TranscriptionService exported so VoiceTranscriptionProcessor (in WorkerProcessorsModule) can resolve it
  exports: [VoiceService, TranscriptionService, VoiceIntelligenceService],
})
export class VoiceModule {}

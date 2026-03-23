import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';
import { VoiceController } from './voice.controller';
import { VoiceService, VOICE_TRANSCRIPTION_QUEUE } from './services/voice.service';
import { TranscriptionService } from './services/transcription.service';
import { VoiceIntelligenceService } from './services/voice-intelligence.service';
import { VoiceTranscriptionProcessor } from './processors/voice-transcription.processor';
import { VoiceExtractionProcessor, VOICE_EXTRACTION_QUEUE } from './processors/voice-extraction.processor';
import { AiModule } from '../ai/ai.module';
import { CIQ_SCORING_QUEUE } from '../ai/processors/ciq-scoring.processor';

@Module({
  imports: [
    PrismaModule,
    UploadsModule,
    AiModule,
    BullModule.registerQueue({ name: VOICE_TRANSCRIPTION_QUEUE }),
    BullModule.registerQueue({ name: VOICE_EXTRACTION_QUEUE }),
    // Register the CIQ queue so the extraction processor can trigger re-scoring
    BullModule.registerQueue({ name: CIQ_SCORING_QUEUE }),
  ],
  controllers: [VoiceController],
  providers: [
    VoiceService,
    TranscriptionService,
    VoiceIntelligenceService,
    VoiceTranscriptionProcessor,
    VoiceExtractionProcessor,
  ],
  exports: [VoiceService, VoiceIntelligenceService],
})
export class VoiceModule {}

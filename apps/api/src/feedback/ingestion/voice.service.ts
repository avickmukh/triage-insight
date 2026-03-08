import { Injectable } from '@nestjs/common';
import { FeedbackService } from '../feedback.service';
import { FeedbackSourceType } from '@prisma/client';

@Injectable()
export class VoiceIngestionService {
  constructor(private readonly feedbackService: FeedbackService) {}

  // This would be triggered after a voice file is transcribed.
  async processTranscript(workspaceId: string, transcript: string, customerId?: string) {
    // For now, we'll use the transcript as both title and description.
    // A more advanced implementation would summarize the transcript for the title.
    const title = transcript.length > 50 ? transcript.substring(0, 47) + '...' : transcript;

    return this.feedbackService.create(workspaceId, {
      title,
      description: transcript,
      sourceType: FeedbackSourceType.VOICE,
      customerId,
    });
  }
}

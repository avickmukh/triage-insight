import { Injectable } from '@nestjs/common';
import { FeedbackService } from '../feedback.service';
import { PlanLimitService } from '../../billing/plan-limit.service';
import { FeedbackSourceType } from '@prisma/client';

@Injectable()
export class VoiceIngestionService {
  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly planLimit: PlanLimitService,
  ) {}

  /**
   * Process a transcribed voice file as a feedback item.
   * Enforces the workspace's monthly voice upload limit before ingestion.
   */
  async processTranscript(workspaceId: string, transcript: string, customerId?: string) {
    // Guard: enforce monthly voice upload limit for the workspace's plan
    await this.planLimit.assertCanUploadVoice(workspaceId);

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

import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { Injectable } from '@nestjs/common';

export const AI_ANALYSIS_QUEUE = 'ai-analysis';

interface AnalysisJobPayload {
  feedbackId: string;
}

@Injectable()
@Processor(AI_ANALYSIS_QUEUE)
export class AiAnalysisProcessor {
  constructor(private readonly prisma: PrismaService) {}

  @Process()
  async handleAnalysis(job: Job<AnalysisJobPayload>) {
    const { feedbackId } = job.data;
    const feedback = await this.prisma.feedback.findUnique({ where: { id: feedbackId } });

    if (!feedback) {
      console.error(`Feedback with ID ${feedbackId} not found for analysis.`);
      return;
    }

    // Placeholder for actual AI analysis (e.g., call OpenAI, Cohere, etc.)
    const analysisResult = {
      normalizedText: feedback.description.toLowerCase(), // Simple normalization
      language: 'en', // Dummy language detection
      summary: `Summary of: ${feedback.title}`, // Dummy summary
    };

    await this.prisma.feedback.update({
      where: { id: feedbackId },
      data: analysisResult,
    });

    console.log(`Successfully analyzed feedback ${feedbackId}`);
  }
}

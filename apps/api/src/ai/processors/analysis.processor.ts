import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { EmbeddingService } from '../services/embedding.service';
import { SummarizationService } from '../services/summarization.service';
import { DuplicateDetectionService } from '../services/duplicate-detection.service';

export const AI_ANALYSIS_QUEUE = 'ai-analysis';

interface AnalysisJobPayload {
  feedbackId: string;
}

@Injectable()
@Processor(AI_ANALYSIS_QUEUE)
export class AiAnalysisProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    private readonly summarizationService: SummarizationService,
    private readonly duplicateDetectionService: DuplicateDetectionService,
  ) {}

  @Process()
  async handleAnalysis(job: Job<AnalysisJobPayload>) {
    const { feedbackId } = job.data;
    const feedback = await this.prisma.feedback.findUnique({ where: { id: feedbackId } });

    if (!feedback) {
      console.error(`Feedback with ID ${feedbackId} not found for analysis.`);
      return;
    }

    // 1. Generate Embedding
    const embedding = await this.embeddingService.generateEmbedding(feedback.description);

    // 2. Generate Summary
    const summary = await this.summarizationService.summarize(feedback.description);

    // 3. Update Feedback with AI data (embedding stored via raw query due to pgvector Unsupported type)
    await this.prisma.feedback.update({
      where: { id: feedbackId },
      data: {
        summary,
        normalizedText: feedback.description.toLowerCase(),
        language: 'en',
      },
    });

    // Store embedding using raw SQL
    const vectorStr = `[${embedding.join(',')}]`;
    await this.prisma.$executeRaw`
      UPDATE "Feedback"
      SET embedding = ${vectorStr}::vector
      WHERE id = ${feedbackId};
    `;

    // 4. Generate duplicate suggestions (embedding-based; heuristic fallback handled inside)
    await this.duplicateDetectionService.generateSuggestions(
      feedback.workspaceId,
      feedbackId,
      embedding,
    );

    console.log(`Successfully analyzed feedback ${feedbackId}`);
  }
}

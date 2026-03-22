import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from '../services/embedding.service';
import { SummarizationService } from '../services/summarization.service';
import { DuplicateDetectionService } from '../services/duplicate-detection.service';
import { ThemeClusteringService } from '../services/theme-clustering.service';

export const AI_ANALYSIS_QUEUE = 'ai-analysis';

interface AnalysisJobPayload {
  feedbackId: string;
}

@Injectable()
@Processor(AI_ANALYSIS_QUEUE)
export class AiAnalysisProcessor {
  private readonly logger = new Logger(AiAnalysisProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    private readonly summarizationService: SummarizationService,
    private readonly duplicateDetectionService: DuplicateDetectionService,
    private readonly themeClusteringService: ThemeClusteringService,
  ) {}

  @Process()
  async handleAnalysis(job: Job<AnalysisJobPayload>) {
    const { feedbackId } = job.data;
    const feedback = await this.prisma.feedback.findUnique({ where: { id: feedbackId } });

    if (!feedback) {
      this.logger.error(`Feedback ${feedbackId} not found for analysis`);
      return;
    }

    // 1. Generate Embedding
    let embedding: number[] = [];
    try {
      embedding = await this.embeddingService.generateEmbedding(feedback.description);
    } catch (err) {
      this.logger.warn(`Embedding generation failed for feedback ${feedbackId}: ${(err as Error).message}`);
    }

    // 2. Generate Summary
    let summary: string | null = null;
    try {
      summary = await this.summarizationService.summarize(feedback.description);
    } catch (err) {
      this.logger.warn(`Summarization failed for feedback ${feedbackId}: ${(err as Error).message}`);
    }

    // 3. Update Feedback with AI data
    await this.prisma.feedback.update({
      where: { id: feedbackId },
      data: {
        ...(summary && { summary }),
        normalizedText: feedback.description.toLowerCase(),
        language: 'en',
      },
    });

    // Store embedding using raw SQL (pgvector Unsupported type)
    if (embedding.length > 0) {
      const vectorStr = `[${embedding.join(',')}]`;
      await this.prisma.$executeRaw`
        UPDATE "Feedback"
        SET embedding = ${vectorStr}::vector
        WHERE id = ${feedbackId};
      `;
    }

    // 4. Generate duplicate suggestions (embedding-based; heuristic fallback handled inside)
    try {
      await this.duplicateDetectionService.generateSuggestions(
        feedback.workspaceId,
        feedbackId,
        embedding.length > 0 ? embedding : undefined,
      );
    } catch (err) {
      this.logger.warn(`Duplicate detection failed for feedback ${feedbackId}: ${(err as Error).message}`);
    }

    // 5. Assign feedback to a theme via clustering (heuristic; embedding upgrade-ready)
    try {
      await this.themeClusteringService.assignFeedbackToTheme(
        feedback.workspaceId,
        feedbackId,
        embedding.length > 0 ? embedding : undefined,
      );
    } catch (err) {
      this.logger.warn(`Theme clustering failed for feedback ${feedbackId}: ${(err as Error).message}`);
    }

    this.logger.log(`Successfully analyzed feedback ${feedbackId}`);
  }
}

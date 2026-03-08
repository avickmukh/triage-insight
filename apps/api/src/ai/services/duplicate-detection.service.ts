import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface SimilarFeedbackRow {
  id: string;
  title: string;
  similarity: number;
}

@Injectable()
export class DuplicateDetectionService {
  constructor(private readonly prisma: PrismaService) {}

  async findDuplicates(workspaceId: string, feedbackId: string, embedding: number[], threshold = 0.9) {
    const vectorStr = `[${embedding.join(',')}]`;

    // Use pgvector cosine similarity via raw SQL
    const similarFeedback = await this.prisma.$queryRaw<SimilarFeedbackRow[]>`
      SELECT
        id,
        title,
        1 - (embedding <=> ${vectorStr}::vector) AS similarity
      FROM "Feedback"
      WHERE "workspaceId" = ${workspaceId}
        AND id != ${feedbackId}
        AND embedding IS NOT NULL
        AND 1 - (embedding <=> ${vectorStr}::vector) > ${threshold}
      ORDER BY similarity DESC
      LIMIT 10;
    `;

    for (const item of similarFeedback) {
      await this.prisma.feedbackDuplicateSuggestion.upsert({
        where: {
          sourceId_targetId: { sourceId: feedbackId, targetId: item.id },
        },
        update: { similarity: item.similarity },
        create: {
          sourceId: feedbackId,
          targetId: item.id,
          similarity: item.similarity,
        },
      });
    }

    return similarFeedback;
  }
}

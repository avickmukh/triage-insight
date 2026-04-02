import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/**
 * Target embedding dimension.
 *
 * The pgvector columns in Feedback, Theme, and FeedbackDuplicateSuggestion are
 * all defined as vector(1536).  text-embedding-3-large natively produces 3072
 * dimensions, but the OpenAI API accepts a `dimensions` parameter to truncate
 * the output to any size ≤ 3072 while preserving the relative ordering of
 * cosine similarities.  We pin to 1536 so the output is always compatible with
 * the database schema without requiring a migration.
 */
const EMBEDDING_DIMENSIONS = 1536;

@Injectable()
export class EmbeddingService {
  private readonly openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY', ''),
    });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'AI features are not configured. Set OPENAI_API_KEY to enable embeddings.',
      );
    }
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: text.replace(/\n/g, ' '),
      dimensions: EMBEDDING_DIMENSIONS,
    });
    return response.data[0].embedding;
  }
}

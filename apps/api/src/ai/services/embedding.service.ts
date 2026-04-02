import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

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
    });
    return response.data[0].embedding;
  }
}

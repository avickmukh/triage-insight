import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class SummarizationService {
  private readonly openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY', ''),
    });
  }

  async summarize(text: string): Promise<string> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'AI features are not configured. Set OPENAI_API_KEY to enable summarization.',
      );
    }
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that summarizes user feedback into a concise, one-sentence title.',
        },
        {
          role: 'user',
          content: `Summarize the following feedback into a single, clear sentence that can be used as a title. Do not add any extra commentary or labels. Just provide the summary sentence.\n\nFeedback:\n"""${text}"""`,
        },
      ],
      temperature: 0.2,
      max_tokens: 60,
    });
    return response.choices[0].message.content?.trim() ?? 'Summary not available';
  }
}

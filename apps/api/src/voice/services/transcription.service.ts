import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as fs from 'fs';

/**
 * TranscriptionService
 *
 * Wraps the OpenAI Whisper API (model: whisper-1) to transcribe audio files.
 * The caller is responsible for providing a local file path; the service reads
 * the file, sends it to Whisper, and returns the transcript text.
 *
 * Provider abstraction note:
 *   - Currently backed by OpenAI Whisper (whisper-1).
 *   - OPENAI_API_KEY must be set in the environment.
 *   - If the key is absent the service throws a clear error at construction time
 *     so misconfiguration is surfaced immediately, not silently at job time.
 *   - A future provider (e.g. AWS Transcribe, Deepgram) can be swapped in by
 *     implementing the same `transcribeFile(path, mimeType)` interface.
 */
@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);
  private readonly openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.getOrThrow<string>('OPENAI_API_KEY');
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Transcribe a local audio file using OpenAI Whisper.
   *
   * @param filePath  Absolute path to the temporary audio file on disk.
   * @param mimeType  MIME type of the audio (e.g. audio/mpeg, audio/wav).
   * @returns         Plain-text transcript.
   */
  async transcribeFile(filePath: string, mimeType: string): Promise<string> {
    this.logger.log(`Transcribing file: ${filePath} (${mimeType})`);

    const fileStream = fs.createReadStream(filePath);

    const response = await this.openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: fileStream,
      response_format: 'text',
    });

    // When response_format is 'text', the SDK returns a plain string
    const transcript = typeof response === 'string' ? response : (response as { text: string }).text;
    this.logger.log(`Transcription complete. Length: ${transcript.length} chars`);
    return transcript.trim();
  }
}

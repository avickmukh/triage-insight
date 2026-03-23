import { Processor, Process, InjectQueue } from '@nestjs/bull';
import type { Job, Queue } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { PrismaService } from '../../prisma/prisma.service';
import { TranscriptionService } from '../services/transcription.service';
import { SummarizationService } from '../../ai/services/summarization.service';
import { VoiceTranscriptionJobPayload, VOICE_TRANSCRIPTION_QUEUE } from '../services/voice.service';
import { AiJobStatus, FeedbackSourceType, FeedbackStatus } from '@prisma/client';
import { VOICE_EXTRACTION_QUEUE, VoiceExtractionJobPayload } from './voice-extraction.processor';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Readable } from 'stream';

@Injectable()
@Processor(VOICE_TRANSCRIPTION_QUEUE)
export class VoiceTranscriptionProcessor {
  private readonly logger = new Logger(VoiceTranscriptionProcessor.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly transcriptionService: TranscriptionService,
    private readonly summarizationService: SummarizationService,
    private readonly configService: ConfigService,
    @InjectQueue(VOICE_EXTRACTION_QUEUE)
    private readonly extractionQueue: Queue<VoiceExtractionJobPayload>,
  ) {
    this.bucket = this.configService.getOrThrow<string>('AWS_S3_BUCKET');
    this.s3Client = new S3Client({
      region: this.configService.getOrThrow<string>('AWS_S3_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  @Process()
  async handleTranscription(job: Job<VoiceTranscriptionJobPayload>) {
    const { uploadAssetId, aiJobLogId, workspaceId, s3Key, s3Bucket, mimeType, label } = job.data;

    this.logger.log(`Starting transcription job ${aiJobLogId} for asset ${uploadAssetId}`);

    // ── Mark job as RUNNING ──────────────────────────────────────────────────
    await this.prisma.aiJobLog.update({
      where: { id: aiJobLogId },
      data: { status: AiJobStatus.RUNNING },
    });

    let tempFilePath: string | null = null;

    try {
      // ── 1. Download audio from S3 to a temp file ─────────────────────────
      tempFilePath = await this.downloadFromS3(s3Bucket, s3Key, mimeType);

      // ── 2. Transcribe with Whisper ────────────────────────────────────────
      const transcript = await this.transcriptionService.transcribeFile(tempFilePath, mimeType);

      if (!transcript || transcript.trim().length === 0) {
        throw new Error('Transcription returned empty result');
      }

      // ── 3. Generate a provisional title via summarization ─────────────────
      //      (VoiceIntelligenceService will produce a better title in step 5)
      let title = label ?? 'Voice Feedback';
      try {
        title = await this.summarizationService.summarize(transcript);
      } catch (err) {
        this.logger.warn(`Summarization failed, using label/default: ${(err as Error).message}`);
      }

      // ── 4. Create Feedback record with sourceType = VOICE ─────────────────
      const feedback = await this.prisma.feedback.create({
        data: {
          workspaceId,
          sourceType: FeedbackSourceType.VOICE,
          sourceRef: uploadAssetId,
          title,
          description: transcript,
          rawText: transcript,
          normalizedText: transcript.toLowerCase(),
          language: 'en',
          status: FeedbackStatus.NEW,
          metadata: {
            uploadAssetId,
            aiJobLogId,
            originalFileName: label ?? s3Key.split('/').pop(),
          },
        },
      });

      // ── 5. Mark transcription job as COMPLETED ────────────────────────────
      await this.prisma.aiJobLog.update({
        where: { id: aiJobLogId },
        data: {
          status: AiJobStatus.COMPLETED,
          output: {
            transcript,
            feedbackId: feedback.id,
            charCount: transcript.length,
          },
        },
      });

      this.logger.log(
        `Transcription job ${aiJobLogId} completed. Feedback created: ${feedback.id}`,
      );

      // ── 6. Enqueue voice intelligence extraction (async, non-blocking) ────
      await this.extractionQueue.add(
        {
          uploadAssetId,
          aiJobLogId,
          workspaceId,
          feedbackId: feedback.id,
          transcript,
          label,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: false,
          removeOnFail: false,
        },
      );

      this.logger.log(
        `Voice extraction job enqueued for feedback ${feedback.id}`,
      );
    } catch (err) {
      const errorMessage = (err as Error).message ?? 'Unknown error';
      this.logger.error(`Transcription job ${aiJobLogId} failed: ${errorMessage}`);

      await this.prisma.aiJobLog.update({
        where: { id: aiJobLogId },
        data: {
          status: AiJobStatus.FAILED,
          error: errorMessage,
        },
      });

      // Re-throw so Bull can retry according to job options
      throw err;
    } finally {
      // ── Cleanup temp file ─────────────────────────────────────────────────
      if (tempFilePath) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch {
          // Non-critical cleanup failure
        }
      }
    }
  }

  // ─── Private: download S3 object to a temp file ───────────────────────────

  private async downloadFromS3(bucket: string, key: string, mimeType: string): Promise<string> {
    const ext = this.mimeToExt(mimeType);
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `voice-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);

    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await this.s3Client.send(command);

    if (!response.Body) {
      throw new Error(`S3 object body is empty for key: ${key}`);
    }

    await new Promise<void>((resolve, reject) => {
      const writeStream = fs.createWriteStream(tempFile);
      (response.Body as Readable).pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    this.logger.log(`Downloaded S3 object to temp file: ${tempFile}`);
    return tempFile;
  }

  private mimeToExt(mimeType: string): string {
    const map: Record<string, string> = {
      'audio/mpeg': '.mp3',
      'audio/mp3': '.mp3',
      'audio/wav': '.wav',
      'audio/x-wav': '.wav',
      'audio/wave': '.wav',
      'audio/m4a': '.m4a',
      'audio/x-m4a': '.m4a',
      'audio/mp4': '.mp4',
      'audio/ogg': '.ogg',
      'audio/webm': '.webm',
      'audio/flac': '.flac',
    };
    return map[mimeType] ?? '.audio';
  }
}

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
    this.bucket = this.configService.get<string>('AWS_S3_BUCKET', '');
    this.s3Client = new S3Client({
      region: this.configService.get<string>('AWS_S3_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID', ''),
        secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY', ''),
      },
    });
  }

  @Process()
  async handleTranscription(job: Job<VoiceTranscriptionJobPayload>) {
    const { uploadAssetId, aiJobLogId, workspaceId, s3Key, s3Bucket, mimeType, label, portalUserId, submittedText, anonymousId } = job.data;

    this.logger.log(`Starting transcription job ${aiJobLogId} for asset ${uploadAssetId}`);

    await this.prisma.aiJobLog.update({
      where: { id: aiJobLogId },
      data: { status: AiJobStatus.RUNNING },
    });

    let tempFilePath: string | null = null;

    try {
      tempFilePath = await this.downloadFromS3(s3Bucket, s3Key, mimeType);
      const transcript = await this.transcriptionService.transcribeFile(tempFilePath, mimeType);

      if (!transcript || transcript.trim().length === 0) {
        throw new Error('Transcription returned empty result');
      }

      let title = label ?? 'Voice Feedback';
      try {
        title = await this.summarizationService.summarize(transcript);
      } catch (err) {
        this.logger.warn(`Summarization failed, using label/default: ${(err as Error).message}`);
      }

      // Combine submitted text with the transcript for a full record
      const fullDescription = submittedText
        ? `Submitted Comment:\n${submittedText}\n\n--- Transcript ---\n${transcript}`
        : transcript;

      const feedback = await this.prisma.feedback.create({
        data: {
          workspaceId,
          // If portalUserId is present, this came from the public portal
          sourceType: portalUserId ? FeedbackSourceType.PUBLIC_PORTAL : FeedbackSourceType.VOICE,
          sourceRef: uploadAssetId,
          title,
          description: fullDescription,
          rawText: fullDescription,
          normalizedText: fullDescription.toLowerCase(),
          language: 'en',
          status: FeedbackStatus.NEW,
          portalUserId: portalUserId ?? null,
          metadata: {
            uploadAssetId,
            aiJobLogId,
            originalFileName: label ?? s3Key.split('/').pop(),
            sourceChannel: 'voice',
            anonymousId: anonymousId ?? null,
          },
        },
      });

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

      throw err;
    } finally {
      if (tempFilePath) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch {
          // Non-critical cleanup failure
        }
      }
    }
  }

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

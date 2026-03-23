import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../uploads/services/s3.service';
import { FinalizeVoiceUploadDto, VoicePresignedUrlDto } from '../dto/voice.dto';
import { AiJobStatus, AiJobType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const VOICE_TRANSCRIPTION_QUEUE = 'voice-transcription';

/** Payload enqueued for the transcription worker */
export interface VoiceTranscriptionJobPayload {
  uploadAssetId: string;
  aiJobLogId: string;
  workspaceId: string;
  s3Key: string;
  s3Bucket: string;
  mimeType: string;
  label?: string;
}

/** Allowed audio MIME types */
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mpeg',        // .mp3
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mp4',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
]);

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly configService: ConfigService,
    @InjectQueue(VOICE_TRANSCRIPTION_QUEUE)
    private readonly transcriptionQueue: Queue<VoiceTranscriptionJobPayload>,
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

  // ─── Presigned PUT URL ─────────────────────────────────────────────────────

  async createPresignedUploadUrl(workspaceId: string, dto: VoicePresignedUrlDto) {
    const { fileName, contentType, sizeBytes } = dto;

    if (!ALLOWED_AUDIO_TYPES.has(contentType)) {
      throw new Error(
        `Unsupported audio type: ${contentType}. Allowed: mp3, wav, m4a, ogg, webm, flac.`,
      );
    }

    const key = `workspaces/${workspaceId}/voice/${uuidv4()}-${fileName}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
    });
    const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });

    return { signedUrl, key, bucket: this.bucket };
  }

  // ─── Finalize Upload ───────────────────────────────────────────────────────

  async finalizeUpload(workspaceId: string, dto: FinalizeVoiceUploadDto) {
    const { s3Key, fileName, contentType, sizeBytes, label } = dto;

    // 1. Create UploadAsset record
    const uploadAsset = await this.prisma.uploadAsset.create({
      data: {
        workspaceId,
        fileName,
        s3Key,
        s3Bucket: this.bucket,
        mimeType: contentType,
        sizeBytes,
      },
    });

    // 2. Create AiJobLog record (QUEUED state)
    const aiJobLog = await this.prisma.aiJobLog.create({
      data: {
        workspaceId,
        jobType: AiJobType.VOICE_TRANSCRIPTION,
        status: AiJobStatus.QUEUED,
        entityType: 'UploadAsset',
        entityId: uploadAsset.id,
        input: { s3Key, fileName, contentType, sizeBytes, label },
      },
    });

    // 3. Enqueue the transcription job
    await this.transcriptionQueue.add(
      {
        uploadAssetId: uploadAsset.id,
        aiJobLogId: aiJobLog.id,
        workspaceId,
        s3Key,
        s3Bucket: this.bucket,
        mimeType: contentType,
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
      `Voice upload finalized: asset=${uploadAsset.id}, job=${aiJobLog.id}, workspace=${workspaceId}`,
    );

    return {
      uploadAssetId: uploadAsset.id,
      aiJobLogId: aiJobLog.id,
      status: AiJobStatus.QUEUED,
    };
  }

  // ─── List uploads for a workspace ─────────────────────────────────────────

  async listUploads(workspaceId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [total, assets] = await Promise.all([
      this.prisma.uploadAsset.count({ where: { workspaceId } }),
      this.prisma.uploadAsset.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    // Enrich each asset with its latest AiJobLog status
    const enriched = await Promise.all(
      assets.map(async (asset) => {
        const job = await this.prisma.aiJobLog.findFirst({
          where: {
            workspaceId,
            entityType: 'UploadAsset',
            entityId: asset.id,
            jobType: AiJobType.VOICE_TRANSCRIPTION,
          },
          orderBy: { createdAt: 'desc' },
        });

        // Find feedback created from this upload (stored in metadata.uploadAssetId)
        const feedback = job?.output
          ? await this.prisma.feedback.findFirst({
              where: {
                workspaceId,
                metadata: { path: ['uploadAssetId'], equals: asset.id },
              },
              select: { id: true, title: true, status: true },
            })
          : null;

        return {
          ...asset,
          jobStatus: job?.status ?? null,
          jobId: job?.id ?? null,
          transcript: (job?.output as { transcript?: string } | null)?.transcript ?? null,
          feedbackId: feedback?.id ?? null,
          feedbackTitle: feedback?.title ?? null,
          error: job?.error ?? null,
        };
      }),
    );

    return {
      data: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── Get a single upload with full details ─────────────────────────────────

  async getUpload(workspaceId: string, uploadAssetId: string) {
    const asset = await this.prisma.uploadAsset.findFirst({
      where: { id: uploadAssetId, workspaceId },
    });
    if (!asset) return null;

    const job = await this.prisma.aiJobLog.findFirst({
      where: {
        workspaceId,
        entityType: 'UploadAsset',
        entityId: asset.id,
        jobType: AiJobType.VOICE_TRANSCRIPTION,
      },
      orderBy: { createdAt: 'desc' },
    });

    const feedback = job?.output
      ? await this.prisma.feedback.findFirst({
          where: {
            workspaceId,
            metadata: { path: ['uploadAssetId'], equals: asset.id },
          },
          select: { id: true, title: true, description: true, status: true, createdAt: true },
        })
      : null;

    // Generate a short-lived signed download URL for the audio player
    const downloadUrl = await this.getSignedDownloadUrl(asset.s3Key);

    return {
      ...asset,
      downloadUrl,
      jobStatus: job?.status ?? null,
      jobId: job?.id ?? null,
      transcript: (job?.output as { transcript?: string } | null)?.transcript ?? null,
      feedback,
      error: job?.error ?? null,
    };
  }

  // ─── Signed download URL ───────────────────────────────────────────────────

  private async getSignedDownloadUrl(s3Key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: s3Key });
    return getSignedUrl(this.s3Client, command, { expiresIn: 900 }); // 15 min
  }
}

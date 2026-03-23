import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../uploads/services/s3.service';
import {
  FinalizeVoiceUploadDto,
  VoicePresignedUrlDto,
  LinkVoiceThemeDto,
  LinkVoiceCustomerDto,
} from '../dto/voice.dto';
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

/** Intelligence output stored in the VOICE_EXTRACTION AiJobLog.output */
interface ExtractionOutput {
  title?: string;
  summary?: string;
  painPoints?: string[];
  featureRequests?: string[];
  keyTopics?: string[];
  sentiment?: number;
  confidenceScore?: number;
  linkedThemeId?: string | null;
  urgencySignal?: number | null;
  churnSignal?: boolean | null;
}

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
    this.bucket = this.configService.get<string>('AWS_S3_BUCKET', '');
    this.s3Client = new S3Client({
      region: this.configService.get<string>('AWS_S3_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID', ''),
        secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY', ''),
      },
    });
  }

  // ─── Presigned PUT URL ─────────────────────────────────────────────────────

  async createPresignedUploadUrl(workspaceId: string, dto: VoicePresignedUrlDto) {
    // Accept both mimeType and contentType for backwards-compat
    const mimeType = dto.mimeType ?? dto.contentType ?? 'audio/mpeg';
    const { fileName, sizeBytes } = dto;

    if (!ALLOWED_AUDIO_TYPES.has(mimeType)) {
      throw new Error(
        `Unsupported audio type: ${mimeType}. Allowed: mp3, wav, m4a, ogg, webm, flac.`,
      );
    }

    const key = `workspaces/${workspaceId}/voice/${uuidv4()}-${fileName}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
      ContentLength: sizeBytes,
    });
    const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });

    return { signedUrl, key, bucket: this.bucket };
  }

  // ─── Finalize Upload ───────────────────────────────────────────────────────

  async finalizeUpload(workspaceId: string, dto: FinalizeVoiceUploadDto) {
    // Accept both mimeType and contentType for backwards-compat
    const mimeType = dto.mimeType ?? dto.contentType ?? 'audio/mpeg';
    const { s3Key, fileName, sizeBytes, label, customerId, dealId } = dto;
    const s3Bucket = dto.s3Bucket ?? this.bucket;

    // 1. Create UploadAsset record
    const uploadAsset = await this.prisma.uploadAsset.create({
      data: {
        workspaceId,
        fileName,
        s3Key,
        s3Bucket,
        mimeType,
        sizeBytes,
        label: label ?? null,
        customerId: customerId ?? null,
        dealId: dealId ?? null,
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
        input: { s3Key, fileName, mimeType, sizeBytes, label },
      },
    });

    // 3. Enqueue the transcription job
    await this.transcriptionQueue.add(
      {
        uploadAssetId: uploadAsset.id,
        aiJobLogId: aiJobLog.id,
        workspaceId,
        s3Key,
        s3Bucket,
        mimeType,
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

  // ─── Reprocess an upload (re-enqueue transcription) ───────────────────────

  async reprocessUpload(workspaceId: string, uploadAssetId: string) {
    const asset = await this.prisma.uploadAsset.findFirst({
      where: { id: uploadAssetId, workspaceId },
    });
    if (!asset) throw new Error(`UploadAsset ${uploadAssetId} not found`);

    // Create a fresh AiJobLog for the new attempt
    const aiJobLog = await this.prisma.aiJobLog.create({
      data: {
        workspaceId,
        jobType: AiJobType.VOICE_TRANSCRIPTION,
        status: AiJobStatus.QUEUED,
        entityType: 'UploadAsset',
        entityId: asset.id,
        input: {
          s3Key: asset.s3Key,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
          label: asset.label,
          reprocess: true,
        },
      },
    });

    await this.transcriptionQueue.add(
      {
        uploadAssetId: asset.id,
        aiJobLogId: aiJobLog.id,
        workspaceId,
        s3Key: asset.s3Key,
        s3Bucket: asset.s3Bucket,
        mimeType: asset.mimeType,
        label: asset.label ?? undefined,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    );

    this.logger.log(`Reprocess enqueued: asset=${asset.id}, newJob=${aiJobLog.id}`);
    return { uploadAssetId: asset.id, aiJobLogId: aiJobLog.id, status: AiJobStatus.QUEUED };
  }

  // ─── Link a voice upload to a theme ───────────────────────────────────────

  async linkTheme(workspaceId: string, uploadAssetId: string, dto: LinkVoiceThemeDto) {
    const { themeId } = dto;
    const asset = await this.prisma.uploadAsset.findFirst({
      where: { id: uploadAssetId, workspaceId },
    });
    if (!asset) throw new Error(`UploadAsset ${uploadAssetId} not found`);

    // Find the feedback created from this upload and link it to the theme
    const feedback = await this.prisma.feedback.findFirst({
      where: { workspaceId, metadata: { path: ['uploadAssetId'], equals: asset.id } },
    });

    if (feedback) {
      // Upsert the ThemeFeedback link
      await this.prisma.themeFeedback.upsert({
        where: { themeId_feedbackId: { themeId, feedbackId: feedback.id } },
        create: { themeId, feedbackId: feedback.id, assignedBy: 'manual' },
        update: { assignedBy: 'manual' },
      });
    }

    return { uploadAssetId, themeId, feedbackId: feedback?.id ?? null };
  }

  // ─── Link a voice upload to a customer ────────────────────────────────────

  async linkCustomer(workspaceId: string, uploadAssetId: string, dto: LinkVoiceCustomerDto) {
    const { customerId } = dto;
    const asset = await this.prisma.uploadAsset.findFirst({
      where: { id: uploadAssetId, workspaceId },
    });
    if (!asset) throw new Error(`UploadAsset ${uploadAssetId} not found`);

    await this.prisma.uploadAsset.update({
      where: { id: uploadAssetId },
      data: { customerId },
    });

    // Also link the generated feedback to the customer
    const feedback = await this.prisma.feedback.findFirst({
      where: { workspaceId, metadata: { path: ['uploadAssetId'], equals: asset.id } },
    });
    if (feedback) {
      await this.prisma.feedback.update({
        where: { id: feedback.id },
        data: { customerId },
      });
    }

    return { uploadAssetId, customerId, feedbackId: feedback?.id ?? null };
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
        include: {
          customer: { select: { id: true, name: true, companyName: true, arrValue: true, churnRisk: true } },
          deal: { select: { id: true, title: true, stage: true, annualValue: true } },
        },
      }),
    ]);

    // Enrich each asset with its latest AiJobLog status + intelligence summary
    const enriched = await Promise.all(
      assets.map(async (asset) => {
        const transcriptionJob = await this.prisma.aiJobLog.findFirst({
          where: {
            workspaceId,
            entityType: 'UploadAsset',
            entityId: asset.id,
            jobType: AiJobType.VOICE_TRANSCRIPTION,
          },
          orderBy: { createdAt: 'desc' },
        });

        // Find feedback created from this upload
        const feedback = transcriptionJob?.output
          ? await this.prisma.feedback.findFirst({
              where: {
                workspaceId,
                metadata: { path: ['uploadAssetId'], equals: asset.id },
              },
              select: { id: true, title: true, status: true, sentiment: true, impactScore: true },
            })
          : null;

        // Find the extraction job for intelligence status
        const extractionJob = feedback
          ? await this.prisma.aiJobLog.findFirst({
              where: {
                workspaceId,
                entityType: 'Feedback',
                entityId: feedback.id,
                jobType: AiJobType.VOICE_EXTRACTION,
              },
              orderBy: { createdAt: 'desc' },
            })
          : null;

        const extractionOutput = extractionJob?.output as ExtractionOutput | null;

        return {
          ...asset,
          // Transcription state
          jobStatus: transcriptionJob?.status ?? null,
          jobId: transcriptionJob?.id ?? null,
          transcript: (transcriptionJob?.output as { transcript?: string } | null)?.transcript ?? null,
          error: transcriptionJob?.error ?? extractionJob?.error ?? null,
          // Feedback linkage
          feedbackId: feedback?.id ?? null,
          feedbackTitle: feedback?.title ?? null,
          // Intelligence summary (from extraction job)
          intelligenceStatus: extractionJob?.status ?? null,
          summary: extractionOutput?.summary ?? null,
          sentiment: extractionOutput?.sentiment ?? feedback?.sentiment ?? null,
          confidenceScore: extractionOutput?.confidenceScore ?? null,
          keyTopics: extractionOutput?.keyTopics ?? [],
          linkedThemeId: extractionOutput?.linkedThemeId ?? null,
          urgencySignal: extractionOutput?.urgencySignal ?? null,
          churnSignal: extractionOutput?.churnSignal ?? null,
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

  // ─── Get a single upload with full intelligence details ────────────────────

  async getUpload(workspaceId: string, uploadAssetId: string) {
    const asset = await this.prisma.uploadAsset.findFirst({
      where: { id: uploadAssetId, workspaceId },
      include: {
          customer: { select: { id: true, name: true, companyName: true, arrValue: true, churnRisk: true, lifecycleStage: true } },
          deal: { select: { id: true, title: true, stage: true, annualValue: true, expectedCloseDate: true } },
      },
    });
    if (!asset) return null;

    // Transcription job
    const transcriptionJob = await this.prisma.aiJobLog.findFirst({
      where: {
        workspaceId,
        entityType: 'UploadAsset',
        entityId: asset.id,
        jobType: AiJobType.VOICE_TRANSCRIPTION,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Feedback created by transcription
    const feedback = transcriptionJob?.output
      ? await this.prisma.feedback.findFirst({
          where: {
            workspaceId,
            metadata: { path: ['uploadAssetId'], equals: asset.id },
          },
          select: {
            id: true,
            title: true,
            description: true,
            summary: true,
            status: true,
            sentiment: true,
            impactScore: true,
            createdAt: true,
            themes: {
              select: {
                theme: {
                  select: {
                    id: true,
                    title: true,
                    status: true,
                    priorityScore: true,
                    revenueInfluence: true,
                  },
                },
              },
            },
          },
        })
      : null;

    // Extraction job (intelligence layer)
    const extractionJob = feedback
      ? await this.prisma.aiJobLog.findFirst({
          where: {
            workspaceId,
            entityType: 'Feedback',
            entityId: feedback.id,
            jobType: AiJobType.VOICE_EXTRACTION,
          },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    const extractionOutput = extractionJob?.output as ExtractionOutput | null;

    // Generate a short-lived signed download URL for the audio player
    const downloadUrl = await this.getSignedDownloadUrl(asset.s3Key);

    return {
      ...asset,
      downloadUrl,
      // Transcription state
      jobStatus: transcriptionJob?.status ?? null,
      jobId: transcriptionJob?.id ?? null,
      transcript: (transcriptionJob?.output as { transcript?: string } | null)?.transcript ?? null,
      error: transcriptionJob?.error ?? extractionJob?.error ?? null,
      // Feedback linkage
      feedback: feedback
        ? {
            id: feedback.id,
            title: feedback.title,
            description: feedback.description,
            summary: feedback.summary,
            status: feedback.status,
            sentiment: feedback.sentiment,
            impactScore: feedback.impactScore,
            createdAt: feedback.createdAt,
            themes: feedback.themes.map((tf) => tf.theme),
          }
        : null,
      // Intelligence outputs
      intelligenceStatus: extractionJob?.status ?? null,
      intelligence: extractionOutput
        ? {
            summary: extractionOutput.summary ?? null,
            painPoints: extractionOutput.painPoints ?? [],
            featureRequests: extractionOutput.featureRequests ?? [],
            keyTopics: extractionOutput.keyTopics ?? [],
            sentiment: extractionOutput.sentiment ?? null,
            confidenceScore: extractionOutput.confidenceScore ?? null,
            linkedThemeId: extractionOutput.linkedThemeId ?? null,
            urgencySignal: extractionOutput.urgencySignal ?? null,
            churnSignal: extractionOutput.churnSignal ?? null,
          }
        : null,
    };
  }

  // ─── Signed download URL ───────────────────────────────────────────────────

  private async getSignedDownloadUrl(s3Key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: s3Key });
    return getSignedUrl(this.s3Client, command, { expiresIn: 900 }); // 15 min
  }
}

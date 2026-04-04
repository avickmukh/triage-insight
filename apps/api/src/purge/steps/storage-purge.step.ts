import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  ObjectIdentifier,
} from '@aws-sdk/client-s3';
import { PurgeService } from '../purge.service';
import { PurgeStepStatus } from '@prisma/client';

/**
 * StoragePurgeStep
 *
 * Deletes all S3 objects under the prefix `workspaces/{workspaceId}/`.
 * Uses paginated ListObjectsV2 + batched DeleteObjects (max 1000 per call)
 * to handle workspaces with large file stores efficiently.
 *
 * If S3 is not configured (no AWS credentials), this step logs a skip
 * and continues — it is not treated as a failure.
 *
 * This step is idempotent: re-running after partial completion is safe
 * because ListObjectsV2 will simply return fewer objects each time.
 */
@Injectable()
export class StoragePurgeStep {
  private readonly logger = new Logger(StoragePurgeStep.name);
  private readonly s3Client: S3Client | null = null;
  private readonly bucket: string;
  private readonly configured: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly purgeService: PurgeService,
  ) {
    this.bucket = this.configService.get<string>('AWS_S3_BUCKET', '');
    const region = this.configService.get<string>('AWS_S3_REGION', 'us-east-1');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID', '');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
      '',
    );

    this.configured = !!(this.bucket && accessKeyId && secretAccessKey);

    if (this.configured) {
      this.s3Client = new S3Client({
        region,
        credentials: { accessKeyId, secretAccessKey },
      });
    }
  }

  async execute(deletionRequestId: string, workspaceId: string): Promise<void> {
    const startedAt = new Date();

    if (!this.configured || !this.s3Client) {
      this.logger.warn(
        `[StoragePurgeStep] S3 not configured — skipping storage purge for workspace ${workspaceId}`,
      );
      await this.purgeService.logStep(
        deletionRequestId,
        workspaceId,
        'PURGE_STORAGE',
        PurgeStepStatus.SUCCESS,
        { skipped: true, reason: 'S3 not configured' },
      );
      return;
    }

    const prefix = `workspaces/${workspaceId}/`;
    let totalDeleted = 0;
    let continuationToken: string | undefined;

    this.logger.log(
      `[StoragePurgeStep] Starting S3 purge for prefix: ${prefix}`,
    );

    do {
      // List up to 1000 objects per page
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      });

      const listResponse = await this.s3Client.send(listCommand);
      const objects = listResponse.Contents ?? [];

      if (objects.length === 0) {
        break;
      }

      // Build the delete batch
      const toDelete: ObjectIdentifier[] = objects
        .filter((o) => o.Key)
        .map((o) => ({ Key: o.Key! }));

      const deleteCommand = new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: toDelete, Quiet: true },
      });

      const deleteResponse = await this.s3Client.send(deleteCommand);

      if (deleteResponse.Errors && deleteResponse.Errors.length > 0) {
        const firstError = deleteResponse.Errors[0];
        throw new Error(
          `S3 DeleteObjects returned errors: ${firstError.Code} — ${firstError.Message} (key: ${firstError.Key})`,
        );
      }

      totalDeleted += toDelete.length;
      continuationToken = listResponse.NextContinuationToken;

      this.logger.log(
        `[StoragePurgeStep] Deleted ${toDelete.length} objects (total so far: ${totalDeleted})`,
      );
    } while (continuationToken);

    this.logger.log(
      `[StoragePurgeStep] S3 purge complete for workspace ${workspaceId}: ${totalDeleted} objects deleted`,
    );

    await this.purgeService.logStep(
      deletionRequestId,
      workspaceId,
      'PURGE_STORAGE',
      PurgeStepStatus.SUCCESS,
      {
        bucket: this.bucket,
        prefix,
        totalObjectsDeleted: totalDeleted,
        durationMs: Date.now() - startedAt.getTime(),
      },
    );
  }
}

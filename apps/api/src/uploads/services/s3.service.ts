import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class S3Service {
  private readonly s3Client: S3Client | null = null;
  private readonly bucket: string;
  private readonly configured: boolean;

  getBucketName() {
    return this.bucket;
  }

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.get<string>('AWS_S3_BUCKET', '');
    const region = this.configService.get<string>('AWS_S3_REGION', 'us-east-1');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID', '');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY', '');

    this.configured = !!(this.bucket && accessKeyId && secretAccessKey);

    if (this.configured) {
      this.s3Client = new S3Client({
        region,
        credentials: { accessKeyId, secretAccessKey },
      });
    }
  }

  async createPresignedUrl(workspaceId: string, fileName: string, contentType: string) {
    if (!this.configured || !this.s3Client) {
      throw new ServiceUnavailableException(
        'File uploads are not configured. Please set AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.',
      );
    }

    const key = `workspaces/${workspaceId}/feedback/attachments/${uuidv4()}-${fileName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });

    return { signedUrl, key };
  }
}

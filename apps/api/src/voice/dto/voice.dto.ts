import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsOptional,
  IsUUID,
} from 'class-validator';

// ─── Request: get a presigned PUT URL for audio upload ────────────────────────
export class VoicePresignedUrlDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  /** Accept both mimeType and contentType for backwards-compat */
  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsString()
  contentType?: string;

  @IsNumber()
  @IsPositive()
  sizeBytes: number;
}

// ─── Request: finalize an upload after the client PUT to S3 ──────────────────
export class FinalizeVoiceUploadDto {
  @IsString()
  @IsNotEmpty()
  s3Key: string;

  /** s3Bucket is optional — the service falls back to the configured bucket */
  @IsOptional()
  @IsString()
  s3Bucket?: string;

  @IsString()
  @IsNotEmpty()
  fileName: string;

  /** Accept both mimeType and contentType for backwards-compat */
  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsString()
  contentType?: string;

  @IsNumber()
  @IsPositive()
  sizeBytes: number;

  /** Optional human-readable label / title for the upload */
  @IsOptional()
  @IsString()
  label?: string;

  /** Optional customer to link this recording to */
  @IsOptional()
  @IsUUID()
  customerId?: string;

  /** Optional deal to link this recording to */
  @IsOptional()
  @IsUUID()
  dealId?: string;
}

// ─── Request: link a voice upload to a theme ─────────────────────────────────
export class LinkVoiceThemeDto {
  @IsUUID()
  @IsNotEmpty()
  themeId: string;
}

// ─── Request: link a voice upload to a customer ──────────────────────────────
export class LinkVoiceCustomerDto {
  @IsUUID()
  @IsNotEmpty()
  customerId: string;
}

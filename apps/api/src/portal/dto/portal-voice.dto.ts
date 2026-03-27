import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsOptional,
  IsEmail,
  MaxLength,
} from 'class-validator';

// ─── 1. Request: get a presigned PUT URL for public audio upload ───────────

export class PortalVoicePresignedUrlDto {
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

// ─── 2. Request: finalize a public upload after the client PUT to S3 ──────

export class PortalFinalizeVoiceUploadDto {
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

  /** Optional text comment submitted alongside the audio file */
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  submittedText?: string;

  /** Alias for submittedText — used by portal service */
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  /** Optional email to link the submission to a PortalUser record */
  @IsOptional()
  @IsEmail()
  email?: string;

  /** Optional display name for the submitter */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  /** Stable anonymous browser fingerprint (UUID from localStorage) */
  @IsOptional()
  @IsString()
  anonymousId?: string;
}

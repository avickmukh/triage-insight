import { IsString, IsNotEmpty, IsNumber, IsPositive, IsOptional } from 'class-validator';

// ─── Request: get a presigned PUT URL for audio upload ────────────────────────
export class VoicePresignedUrlDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsNotEmpty()
  contentType: string;

  @IsNumber()
  @IsPositive()
  sizeBytes: number;
}

// ─── Request: finalize an upload after the client PUT to S3 ──────────────────
export class FinalizeVoiceUploadDto {
  @IsString()
  @IsNotEmpty()
  s3Key: string;

  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsNotEmpty()
  contentType: string;

  @IsNumber()
  @IsPositive()
  sizeBytes: number;

  /** Optional human-readable label / title for the upload */
  @IsOptional()
  @IsString()
  label?: string;
}

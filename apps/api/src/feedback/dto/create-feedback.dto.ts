import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  MaxLength,
} from 'class-validator';
import {
  FeedbackStatus,
  FeedbackSourceType,
  FeedbackPrimarySource,
  FeedbackSecondarySource,
} from '@prisma/client';

export class CreateFeedbackDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  description: string;

  @IsOptional()
  @IsEnum(FeedbackStatus)
  status?: FeedbackStatus;

  @IsEnum(FeedbackSourceType)
  sourceType: FeedbackSourceType;

  /**
   * Unified primary source — product-facing category.
   * Set by all ingestion paths; defaults to FEEDBACK if omitted.
   * Drives top-level inbox filtering and source identity.
   */
  @IsOptional()
  @IsEnum(FeedbackPrimarySource)
  primarySource?: FeedbackPrimarySource;

  /**
   * Unified secondary source — operational ingestion channel.
   * Set by all ingestion paths; defaults to OTHER if omitted.
   * Drives source badges in the inbox and evidence labels in theme/CIQ views.
   */
  @IsOptional()
  @IsEnum(FeedbackSecondarySource)
  secondarySource?: FeedbackSecondarySource;

  @IsOptional()
  @IsString()
  customerId?: string;

  /**
   * Optional: links this feedback to a CSV import batch.
   * Set by CsvImportService; never exposed through the public API.
   */
  @IsOptional()
  @IsString()
  importBatchId?: string;
}

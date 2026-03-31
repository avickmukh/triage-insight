import { IsOptional, IsString, IsInt, Min, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import {
  FeedbackStatus,
  FeedbackSourceType,
  FeedbackPrimarySource,
  FeedbackSecondarySource,
} from '@prisma/client';

export class QueryFeedbackDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(FeedbackStatus)
  status?: FeedbackStatus;

  /**
   * Legacy filter — kept for backward compatibility.
   * Prefer `primarySource` for new UI filtering.
   */
  @IsOptional()
  @IsEnum(FeedbackSourceType)
  sourceType?: FeedbackSourceType;

  /**
   * Unified primary source filter (FEEDBACK | SUPPORT | VOICE | SURVEY).
   * Drives the top-level source tabs in the inbox.
   */
  @IsOptional()
  @IsEnum(FeedbackPrimarySource)
  primarySource?: FeedbackPrimarySource;

  /**
   * Unified secondary source filter (MANUAL | CSV_UPLOAD | PORTAL | EMAIL | SLACK | …).
   * Used for sub-channel filtering within a primary source.
   */
  @IsOptional()
  @IsEnum(FeedbackSecondarySource)
  secondarySource?: FeedbackSecondarySource;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;
}

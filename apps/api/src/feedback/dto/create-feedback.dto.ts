import { IsString, IsNotEmpty, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { FeedbackStatus, FeedbackSourceType } from '@prisma/client';

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

  @IsOptional()
  @IsString()
  customerId?: string;
}

import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { FeedbackStatus, FeedbackSourceType } from '@prisma/client';

export class CreateFeedbackDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
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

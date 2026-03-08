import { IsString, IsOptional, IsEnum } from 'class-validator';
import { FeedbackStatus } from '@prisma/client';

export class UpdateFeedbackDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(FeedbackStatus)
  status?: FeedbackStatus;

  @IsOptional()
  @IsString()
  customerId?: string;
}

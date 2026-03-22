import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { FeedbackStatus } from '@prisma/client';

export class UpdateFeedbackDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  description?: string;

  @IsOptional()
  @IsEnum(FeedbackStatus)
  status?: FeedbackStatus;

  @IsOptional()
  @IsString()
  customerId?: string;
}

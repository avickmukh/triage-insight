import { IsBoolean, IsOptional, IsString, IsDateString } from 'class-validator';

export class RequestWorkspaceDeletionDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsBoolean()
  includeExportBeforeDelete?: boolean;

  @IsOptional()
  @IsDateString()
  scheduledFor?: string;
}

export class ApproveWorkspaceDeletionDto {
  @IsOptional()
  @IsDateString()
  scheduledFor?: string;
}

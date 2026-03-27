import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { RoadmapStatus } from '@prisma/client';

/**
 * Optional override body for POST /roadmap/from-theme/:themeId
 * Allows the user to customise the title, description, and initial status
 * from the prefilled modal before creating the roadmap item.
 */
export class PromoteThemeDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(RoadmapStatus)
  status?: RoadmapStatus;
}

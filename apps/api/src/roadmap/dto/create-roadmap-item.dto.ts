import { IsString, IsNotEmpty, IsOptional, IsEnum, IsBoolean, IsInt, IsUUID, Min, Max } from 'class-validator';
import { RoadmapStatus } from '@prisma/client';

export class CreateRoadmapItemDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(RoadmapStatus)
  status?: RoadmapStatus;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsUUID()
  themeId?: string;

  @IsOptional()
  @IsString()
  targetQuarter?: string;

  @IsOptional()
  @IsInt()
  @Min(2020)
  @Max(2050)
  targetYear?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  manualRank?: number;
}

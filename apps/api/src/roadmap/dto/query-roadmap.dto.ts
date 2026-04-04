import { IsOptional, IsString, IsEnum, IsBoolean } from 'class-validator';
import { RoadmapStatus } from '@prisma/client';
import { Transform } from 'class-transformer';

export class QueryRoadmapDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(RoadmapStatus, { each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  status?: RoadmapStatus[];

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isPublic?: boolean;

  /**
   * Sort field for the list.
   * - `priorityScore`  — AI-computed CIQ priority (default for Prioritization Board)
   * - `feedbackCount`  — number of linked feedback items (feedback volume sort)
   * - `manualRank`     — user-set manual rank (1 = highest priority)
   * - `createdAt`      — creation date (default for Kanban board)
   * - `updatedAt`      — last update date
   */
  @IsOptional()
  @IsString()
  sortBy?:
    | 'createdAt'
    | 'updatedAt'
    | 'priorityScore'
    | 'manualRank'
    | 'feedbackCount' = 'createdAt';

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';

  /**
   * When true, return a flat array instead of the Kanban-grouped columns object.
   * Used by the Prioritization Board page.
   */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  flat?: boolean;
}

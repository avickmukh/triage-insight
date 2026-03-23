import { IsOptional, IsDateString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ReportingQueryDto {
  /** ISO date string – start of the reporting window (inclusive) */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** ISO date string – end of the reporting window (inclusive) */
  @IsOptional()
  @IsDateString()
  to?: string;

  /** Number of items to return for ranked/top-N lists (default 10, max 50) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

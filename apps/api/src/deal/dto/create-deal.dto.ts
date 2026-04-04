import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsArray,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { DealStage, DealStatus } from '@prisma/client';

export class CreateDealDto {
  @IsString()
  customerId: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  annualValue?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsEnum(DealStage)
  stage: DealStage;

  @IsOptional()
  @IsEnum(DealStatus)
  status?: DealStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Expected close date for pipeline forecasting (ISO 8601) */
  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;

  /**
   * Weight multiplier (0–1) for how strongly this deal influences theme priority.
   * Defaults to 1.0 (full weight).
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  influenceWeight?: number;

  /** Optional list of themeIds to link this deal to at creation */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  themeIds?: string[];
}

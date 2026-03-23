import { IsString, IsOptional, IsNumber, IsEnum, IsArray, Min } from 'class-validator';
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

  /** Optional list of themeIds to link this deal to at creation */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  themeIds?: string[];
}

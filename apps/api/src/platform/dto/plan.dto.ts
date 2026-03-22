import {
  IsEnum,
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  Min,
  MaxLength,
} from 'class-validator';
import { BillingPlan } from '@prisma/client';

export class CreatePlanDto {
  @IsEnum(BillingPlan)
  planType: BillingPlan;

  @IsString()
  @MaxLength(80)
  displayName: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** Trial duration in days. 0 = no trial. Only meaningful for STARTER/GROWTH. */
  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  seatLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  aiUsageLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  feedbackLimit?: number;

  @IsOptional()
  @IsBoolean()
  aiInsights?: boolean;

  @IsOptional()
  @IsBoolean()
  integrations?: boolean;

  @IsOptional()
  @IsBoolean()
  publicPortal?: boolean;

  @IsOptional()
  @IsBoolean()
  churnIntelligence?: boolean;

  @IsOptional()
  @IsBoolean()
  sso?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  seatLimit?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  aiUsageLimit?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  feedbackLimit?: number | null;

  @IsOptional()
  @IsBoolean()
  aiInsights?: boolean;

  @IsOptional()
  @IsBoolean()
  integrations?: boolean;

  @IsOptional()
  @IsBoolean()
  publicPortal?: boolean;

  @IsOptional()
  @IsBoolean()
  churnIntelligence?: boolean;

  @IsOptional()
  @IsBoolean()
  sso?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

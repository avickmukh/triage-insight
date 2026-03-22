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

  /** Monthly price in USD cents (0 = free). */
  @IsOptional()
  @IsInt()
  @Min(0)
  priceMonthly?: number;

  /** Trial duration in days. 0 = no trial. Only meaningful for PRO/BUSINESS. */
  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  /** Max number of ADMIN-role members (null = unlimited). */
  @IsOptional()
  @IsInt()
  @Min(1)
  adminLimit?: number | null;

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

  /** Monthly voice upload slots (0 = disabled, null = unlimited). */
  @IsOptional()
  @IsInt()
  @Min(0)
  voiceUploadLimit?: number | null;

  /** Monthly survey response slots (0 = disabled, null = unlimited). */
  @IsOptional()
  @IsInt()
  @Min(0)
  surveyResponseLimit?: number | null;

  @IsOptional()
  @IsBoolean()
  aiInsights?: boolean;

  @IsOptional()
  @IsBoolean()
  aiThemeClustering?: boolean;

  @IsOptional()
  @IsBoolean()
  ciqPrioritization?: boolean;

  @IsOptional()
  @IsBoolean()
  explainableAi?: boolean;

  @IsOptional()
  @IsBoolean()
  weeklyDigest?: boolean;

  @IsOptional()
  @IsBoolean()
  voiceFeedback?: boolean;

  @IsOptional()
  @IsBoolean()
  survey?: boolean;

  @IsOptional()
  @IsBoolean()
  integrations?: boolean;

  @IsOptional()
  @IsBoolean()
  publicPortal?: boolean;

  @IsOptional()
  @IsBoolean()
  csvImport?: boolean;

  @IsOptional()
  @IsBoolean()
  apiAccess?: boolean;

  @IsOptional()
  @IsBoolean()
  executiveReporting?: boolean;

  /** Custom domain — coming soon; always false for now. */
  @IsOptional()
  @IsBoolean()
  customDomain?: boolean;

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
  priceMonthly?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  adminLimit?: number | null;

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
  @IsInt()
  @Min(0)
  voiceUploadLimit?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  surveyResponseLimit?: number | null;

  @IsOptional()
  @IsBoolean()
  aiInsights?: boolean;

  @IsOptional()
  @IsBoolean()
  aiThemeClustering?: boolean;

  @IsOptional()
  @IsBoolean()
  ciqPrioritization?: boolean;

  @IsOptional()
  @IsBoolean()
  explainableAi?: boolean;

  @IsOptional()
  @IsBoolean()
  weeklyDigest?: boolean;

  @IsOptional()
  @IsBoolean()
  voiceFeedback?: boolean;

  @IsOptional()
  @IsBoolean()
  survey?: boolean;

  @IsOptional()
  @IsBoolean()
  integrations?: boolean;

  @IsOptional()
  @IsBoolean()
  publicPortal?: boolean;

  @IsOptional()
  @IsBoolean()
  csvImport?: boolean;

  @IsOptional()
  @IsBoolean()
  apiAccess?: boolean;

  @IsOptional()
  @IsBoolean()
  executiveReporting?: boolean;

  @IsOptional()
  @IsBoolean()
  customDomain?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

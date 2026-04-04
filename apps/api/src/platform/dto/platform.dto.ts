import {
  IsEnum,
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WorkspaceStatus, BillingPlan, BillingStatus } from '@prisma/client';

export class UpdateWorkspaceStatusDto {
  @IsEnum(WorkspaceStatus)
  status: WorkspaceStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class OverrideBillingPlanDto {
  @IsEnum(BillingPlan)
  plan: BillingPlan;

  @IsOptional()
  @IsEnum(BillingStatus)
  billingStatus?: BillingStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ExtendTrialDto {
  @IsInt()
  @Min(1)
  @Max(365)
  @Type(() => Number)
  days: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class SetFeatureOverrideDto {
  @IsString()
  feature: string;

  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ListWorkspacesQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(WorkspaceStatus)
  status?: WorkspaceStatus;

  @IsOptional()
  @IsEnum(BillingPlan)
  billingPlan?: BillingPlan;
}

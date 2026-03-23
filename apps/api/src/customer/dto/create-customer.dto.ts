import { IsString, IsOptional, IsNumber, IsEnum, Min, Max } from 'class-validator';
import { AccountPriority, CustomerLifecycleStage, CustomerSegment } from '@prisma/client';

export class CreateCustomerDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsEnum(CustomerSegment)
  segment?: CustomerSegment;

  @IsOptional()
  @IsNumber()
  @Min(0)
  arrValue?: number;

  /** Monthly Recurring Revenue (optional; derived from ARR/12 if not set) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  mrrValue?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsEnum(AccountPriority)
  accountPriority?: AccountPriority;

  @IsOptional()
  @IsEnum(CustomerLifecycleStage)
  lifecycleStage?: CustomerLifecycleStage;

  /** Churn risk score 0–100; populated by Churn Intelligence layer */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  churnRisk?: number;

  /** CRM owner / account manager name or email */
  @IsOptional()
  @IsString()
  accountOwner?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  /** External CRM identifier (e.g. Salesforce Account ID, HubSpot Contact ID) */
  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsString()
  externalRef?: string;
}

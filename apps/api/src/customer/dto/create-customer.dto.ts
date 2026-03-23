import { IsString, IsOptional, IsNumber, IsEnum, Min } from 'class-validator';
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

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsEnum(AccountPriority)
  accountPriority?: AccountPriority;

  @IsOptional()
  @IsEnum(CustomerLifecycleStage)
  lifecycleStage?: CustomerLifecycleStage;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  externalRef?: string;
}

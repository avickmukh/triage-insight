import { IsEnum, IsUrl, IsNotEmpty } from 'class-validator';
import { BillingPlan } from '@prisma/client';

export class CreateCheckoutSessionDto {
  @IsEnum(BillingPlan)
  targetPlan: BillingPlan;

  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  successUrl: string;

  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  cancelUrl: string;
}

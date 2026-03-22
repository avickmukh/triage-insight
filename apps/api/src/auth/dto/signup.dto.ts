import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BillingPlan } from '@prisma/client';

export class SignUpDto {
  @IsNotEmpty({ message: 'First name is required.' })
  @IsString()
  @MaxLength(100)
  firstName: string;

  @IsNotEmpty({ message: 'Last name is required.' })
  @IsString()
  @MaxLength(100)
  lastName: string;

  /**
   * The human-readable organization name.
   * Must be globally unique — used to derive the workspace slug/subdomain.
   * Example: "Acme Health" → slug "acme-health"
   */
  @IsNotEmpty({ message: 'Organization name is required.' })
  @IsString()
  @MaxLength(200)
  organizationName: string;

  @IsNotEmpty({ message: 'Email is required.' })
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  email: string;

  @IsNotEmpty({ message: 'Password is required.' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  password: string;

  /**
   * The plan the user selected on the pricing page.
   * Defaults to FREE if omitted.
   * Trial lifecycle (trialStartedAt, trialEndsAt) is applied automatically
   * for PRO and BUSINESS based on the Plan config trialDays value.
   */
  @IsOptional()
  @IsEnum(BillingPlan, { message: 'Invalid plan type.' })
  planType?: BillingPlan;
}

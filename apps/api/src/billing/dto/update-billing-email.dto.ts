import { IsEmail, IsNotEmpty } from 'class-validator';

export class UpdateBillingEmailDto {
  @IsEmail()
  @IsNotEmpty()
  billingEmail: string;
}

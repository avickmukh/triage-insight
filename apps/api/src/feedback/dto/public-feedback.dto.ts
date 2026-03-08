import { IsString, IsNotEmpty, IsOptional, IsEmail } from 'class-validator';

export class PublicFeedbackDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsEmail()
  email?: string; // To associate with a customer
}

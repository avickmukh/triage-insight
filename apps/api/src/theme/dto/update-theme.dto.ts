import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { ThemeStatus } from '@prisma/client';

export class UpdateThemeDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ThemeStatus)
  @IsOptional()
  status?: ThemeStatus;

  @IsBoolean()
  @IsOptional()
  pinned?: boolean;
}

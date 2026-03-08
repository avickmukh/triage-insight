import { IsOptional, IsString, IsEnum, IsBoolean, IsInt } from 'class-validator';
import { Transform } from 'class-transformer';
import { ThemeStatus } from '@prisma/client';

export class QueryThemeDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ThemeStatus)
  status?: ThemeStatus;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  pinned?: boolean;

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 20;
}

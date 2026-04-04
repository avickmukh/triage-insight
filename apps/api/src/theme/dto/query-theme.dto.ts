import {
  IsOptional,
  IsString,
  IsEnum,
  IsBoolean,
  IsInt,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ThemeStatus } from '@prisma/client';

export enum ThemeSortBy {
  CREATED_AT = 'createdAt',
  PRIORITY_SCORE = 'priorityScore',
  UPDATED_AT = 'updatedAt',
}

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
  @IsEnum(ThemeSortBy)
  sortBy?: ThemeSortBy = ThemeSortBy.CREATED_AT;

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 20;
}

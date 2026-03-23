import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsArray,
  IsNumber,
  IsInt,
  Min,
  Max,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SurveyQuestionType } from '@prisma/client';

// ─── Question DTOs ─────────────────────────────────────────────────────────────

export class CreateSurveyQuestionDto {
  @IsEnum(SurveyQuestionType)
  type: SurveyQuestionType;

  @IsString()
  label: string;

  @IsOptional()
  @IsString()
  placeholder?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;

  /** For SINGLE_CHOICE / MULTIPLE_CHOICE */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  /** For RATING — minimum value */
  @IsOptional()
  @IsInt()
  @Min(0)
  ratingMin?: number;

  /** For RATING / NPS — maximum value */
  @IsOptional()
  @IsInt()
  @Max(10)
  ratingMax?: number;
}

export class UpdateSurveyQuestionDto {
  @IsOptional()
  @IsEnum(SurveyQuestionType)
  type?: SurveyQuestionType;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  placeholder?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsInt()
  ratingMin?: number;

  @IsOptional()
  @IsInt()
  ratingMax?: number;
}

// ─── Survey DTOs ──────────────────────────────────────────────────────────────

export class CreateSurveyDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  convertToFeedback?: boolean;

  @IsOptional()
  @IsString()
  thankYouMessage?: string;

  @IsOptional()
  @IsString()
  redirectUrl?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSurveyQuestionDto)
  questions?: CreateSurveyQuestionDto[];
}

export class UpdateSurveyDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  convertToFeedback?: boolean;

  @IsOptional()
  @IsString()
  thankYouMessage?: string;

  @IsOptional()
  @IsString()
  redirectUrl?: string;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export class SurveyAnswerDto {
  @IsString()
  questionId: string;

  @IsOptional()
  @IsString()
  textValue?: string;

  @IsOptional()
  @IsNumber()
  numericValue?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  choiceValues?: string[];
}

export class SubmitSurveyResponseDto {
  @IsOptional()
  @IsString()
  respondentEmail?: string;

  @IsOptional()
  @IsString()
  respondentName?: string;

  @IsOptional()
  @IsString()
  portalUserId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => SurveyAnswerDto)
  answers: SurveyAnswerDto[];
}

// ─── Query DTOs ───────────────────────────────────────────────────────────────

export class SurveyQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}

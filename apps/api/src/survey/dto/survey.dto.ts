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
import { SurveyQuestionType, SurveyType } from '@prisma/client';
import { IsDateString } from 'class-validator';

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

  /** Survey purpose / template type */
  @IsOptional()
  @IsEnum(SurveyType)
  surveyType?: SurveyType;

  /** Link this survey to a specific theme for targeted signal collection */
  @IsOptional()
  @IsString()
  linkedThemeId?: string;

  /** Link this survey to a roadmap item for validation */
  @IsOptional()
  @IsString()
  linkedRoadmapItemId?: string;

  /** Target customer segment (e.g. "ENTERPRISE", "SMB") */
  @IsOptional()
  @IsString()
  customerSegment?: string;

  /** Target segment for revenue-weighted intelligence */
  @IsOptional()
  @IsString()
  targetSegment?: string;

  /** Multiple linked theme IDs for multi-theme validation */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedThemeIds?: string[];

  /** Multiple linked roadmap item IDs for multi-item validation */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedRoadmapIds?: string[];

  /** When the survey should automatically close */
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

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

  @IsOptional()
  @IsEnum(SurveyType)
  surveyType?: SurveyType;

  @IsOptional()
  @IsString()
  linkedThemeId?: string;

  @IsOptional()
  @IsString()
  linkedRoadmapItemId?: string;

  @IsOptional()
  @IsString()
  customerSegment?: string;

  @IsOptional()
  @IsString()
  targetSegment?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedThemeIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedRoadmapIds?: string[];

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
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

  /** Anonymous session identifier for deduplication */
  @IsOptional()
  @IsString()
  anonymousId?: string;

  /** Link response to a known customer */
  @IsOptional()
  @IsString()
  customerId?: string;

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
  @IsEnum(SurveyType)
  surveyType?: SurveyType;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}

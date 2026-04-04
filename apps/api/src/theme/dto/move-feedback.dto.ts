import {
  IsArray,
  IsUUID,
  ArrayMinSize,
  IsOptional,
  IsString,
} from 'class-validator';

export class MoveFeedbackDto {
  @IsArray()
  @IsUUID('all', { each: true })
  @ArrayMinSize(1)
  feedbackIds: string[];

  @IsString()
  @IsUUID()
  @IsOptional()
  sourceThemeId?: string;

  @IsString()
  @IsUUID()
  @IsOptional()
  targetThemeId?: string;
}

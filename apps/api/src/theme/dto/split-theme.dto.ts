import { IsString, IsNotEmpty, IsArray, IsUUID, ArrayMinSize, IsOptional } from 'class-validator';

export class SplitThemeDto {
  @IsString()
  @IsNotEmpty()
  newThemeTitle: string;

  @IsString()
  @IsOptional()
  newThemeDescription?: string;

  @IsArray()
  @IsUUID('all', { each: true })
  @ArrayMinSize(1)
  feedbackIdsToMove: string[];
}

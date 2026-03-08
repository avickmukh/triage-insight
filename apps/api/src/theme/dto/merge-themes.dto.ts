import { IsArray, IsUUID, ArrayMinSize } from 'class-validator';

export class MergeThemesDto {
  @IsArray()
  @IsUUID('all', { each: true })
  @ArrayMinSize(1)
  sourceThemeIds: string[];
}

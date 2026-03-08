import { IsString, IsNotEmpty, IsArray, ArrayMinSize } from 'class-validator';

export class MergeFeedbackDto {
  @IsString()
  @IsNotEmpty()
  targetId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  sourceIds: string[];
}

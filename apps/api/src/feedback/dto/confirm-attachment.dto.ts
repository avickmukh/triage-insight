import { IsString, IsNotEmpty, IsInt, Min } from 'class-validator';

export class ConfirmAttachmentDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @IsInt()
  @Min(1)
  sizeBytes: number;
}

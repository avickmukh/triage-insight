import { IsString, IsNotEmpty } from 'class-validator';

export class CreateUploadDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsNotEmpty()
  contentType: string;
}

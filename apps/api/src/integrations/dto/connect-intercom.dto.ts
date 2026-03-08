import { IsString, IsNotEmpty } from 'class-validator';

export class ConnectIntercomDto {
  @IsString()
  @IsNotEmpty()
  accessToken: string;
}

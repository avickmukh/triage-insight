import { IsString, IsNotEmpty } from 'class-validator';

export class ConnectZendeskDto {
  @IsString()
  @IsNotEmpty()
  subdomain: string;

  @IsString()
  @IsNotEmpty()
  accessToken: string;
}

import { IsUrl, IsNotEmpty } from 'class-validator';

export class CreatePortalSessionDto {
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  returnUrl: string;
}

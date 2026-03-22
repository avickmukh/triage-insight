import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

/**
 * Payload for connecting a Slack workspace.
 *
 * In a full OAuth flow the `accessToken` would be the bot token obtained
 * after the OAuth callback.  The `teamId` and `teamName` are returned by
 * Slack's oauth.v2.access response and stored in `metadata` for display.
 */
export class ConnectSlackDto {
  @IsString()
  @IsNotEmpty()
  accessToken: string;

  @IsString()
  @IsOptional()
  teamId?: string;

  @IsString()
  @IsOptional()
  teamName?: string;
}

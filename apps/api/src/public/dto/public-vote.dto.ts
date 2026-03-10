import { IsOptional, IsString, IsEmail } from 'class-validator';

/**
 * Body for POST /public/:workspaceSlug/feedback/:id/vote
 * All fields are optional — anonymous votes are allowed.
 */
export class PublicVoteDto {
  /** Stable anonymous browser fingerprint (e.g. UUID stored in localStorage) */
  @IsOptional()
  @IsString()
  anonymousId?: string;

  /** Optional email to associate the vote with a PortalUser */
  @IsOptional()
  @IsEmail()
  email?: string;

  /** Optional display name for the portal user */
  @IsOptional()
  @IsString()
  name?: string;
}

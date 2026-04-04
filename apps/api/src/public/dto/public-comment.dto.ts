import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  MaxLength,
} from 'class-validator';

/**
 * Body for POST /public/:workspaceSlug/feedback/:id/comments
 */
export class PublicCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body: string;

  /** Optional email — used to look up or create a PortalUser */
  @IsOptional()
  @IsEmail()
  email?: string;

  /** Optional display name shown alongside the comment */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  /** Stable anonymous browser fingerprint */
  @IsOptional()
  @IsString()
  anonymousId?: string;
}

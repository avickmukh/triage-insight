import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  MaxLength,
} from 'class-validator';

/**
 * Body for POST /portal/:orgSlug/feedback
 *
 * Supports both PortalUser (email provided) and Anonymous submissions.
 * `sourceType` is always set to PUBLIC_PORTAL by the service.
 */
export class PortalCreateFeedbackDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  description: string;

  /** Optional — links the submission to a PortalUser record */
  @IsOptional()
  @IsEmail()
  email?: string;

  /** Optional display name for the submitter */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  /** Stable anonymous browser fingerprint (UUID from localStorage) */
  @IsOptional()
  @IsString()
  anonymousId?: string;
}

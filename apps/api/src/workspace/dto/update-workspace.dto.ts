import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PublicPortalVisibility } from '@prisma/client';

/**
 * Fields an ADMIN may update on the workspace.
 *
 * Covers all mutable columns on the Workspace model that are not managed by
 * billing/Stripe webhooks:
 *   - name, description
 *   - timezone, defaultLocale, defaultCurrency
 *   - portalVisibility
 *   - billingEmail (display only — no Stripe side-effect here)
 */
export class UpdateWorkspaceDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** IANA timezone string, e.g. "America/New_York" */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  /** BCP-47 locale tag, e.g. "en", "fr", "de" */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  defaultLocale?: string;

  /** ISO 4217 currency code, e.g. "USD", "EUR" */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  defaultCurrency?: string;

  /** Whether the public portal is visible to unauthenticated visitors */
  @IsOptional()
  @IsEnum(PublicPortalVisibility)
  portalVisibility?: PublicPortalVisibility;

  /** Billing contact email — stored on the workspace, not synced to Stripe here */
  @IsOptional()
  @IsString()
  @MaxLength(254)
  billingEmail?: string;
}

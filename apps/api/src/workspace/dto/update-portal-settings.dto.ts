import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PublicPortalVisibility } from '@prisma/client';

/**
 * Fields an ADMIN may update on the workspace's public portal configuration.
 *
 * Covers the portal-specific subset of Workspace fields:
 *   - portalVisibility (PUBLIC | PRIVATE)
 *   - name (used as portal title — shared with workspace name)
 *   - description (shown on portal header)
 *
 * This DTO is intentionally narrow: it only touches portal-visible fields
 * and does not expose billing, regional, or domain settings.
 */
export class UpdatePortalSettingsDto {
  /** Whether the public portal is visible to unauthenticated visitors */
  @IsOptional()
  @IsEnum(PublicPortalVisibility)
  portalVisibility?: PublicPortalVisibility;

  /**
   * Portal display title — maps to workspace.name.
   * Shown in the portal header and browser tab.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  /**
   * Portal tagline / description — maps to workspace.description.
   * Shown below the portal title in the public portal header.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

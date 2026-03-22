import { IsString, Matches, MaxLength } from 'class-validator';

/**
 * DTO for setting or updating the workspace custom domain.
 *
 * Accepts a fully-qualified hostname such as "feedback.acme.com".
 * Protocol prefixes (https://, http://) and trailing slashes are rejected
 * so the stored value is always a bare hostname.
 */
export class SetDomainDto {
  /**
   * Bare hostname — no protocol, no path, no trailing slash.
   * Examples: "feedback.acme.com", "portal.example.io"
   */
  @IsString()
  @MaxLength(253)
  @Matches(
    /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z0-9-]{1,63})*\.[a-zA-Z]{2,}$/,
    {
      message:
        'customDomain must be a valid hostname (e.g. "feedback.acme.com"). ' +
        'Do not include a protocol prefix or trailing slash.',
    },
  )
  customDomain!: string;
}

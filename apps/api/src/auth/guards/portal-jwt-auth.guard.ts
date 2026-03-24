import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * PortalJwtAuthGuard
 *
 * Use this guard on routes that require an authenticated portal user.
 * It uses the 'portal-jwt' Passport strategy which:
 *   1. Only accepts tokens with `type: 'portal'`
 *   2. Validates the sub against the PortalUser table
 *
 * This prevents workspace users from accessing portal-only endpoints
 * and portal users from accessing workspace/platform endpoints.
 */
@Injectable()
export class PortalJwtAuthGuard extends AuthGuard('portal-jwt') {}

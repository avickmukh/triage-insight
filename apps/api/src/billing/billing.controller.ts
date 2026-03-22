import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Headers,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { BillingService } from './billing.service';
import { UpdateBillingEmailDto } from './dto/update-billing-email.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../workspace/guards/roles.guard';
import { Roles } from '../workspace/decorators/roles.decorator';
import { WorkspaceRole } from '@prisma/client';

interface AuthenticatedRequest extends Request {
  user: { sub: string; email: string };
}

/**
 * BillingController
 *
 * All authenticated routes live under /billing.
 *
 * Route summary:
 *   GET  /billing/status        — any authenticated member (ADMIN/EDITOR/VIEWER)
 *   PATCH /billing/email        — ADMIN only
 *   POST /billing/webhook       — public (no JWT); Stripe calls this directly
 *
 * The Stripe-ready checkout and portal session endpoints are stubbed here
 * and will be activated once the Stripe SDK is installed.
 */
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // ── Read-only ──────────────────────────────────────────────────────────────

  /**
   * GET /billing/status
   *
   * Returns the workspace billing snapshot: plan, status, trial state,
   * current period dates, and static plan limits.
   * Accessible to all authenticated workspace members.
   */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  getStatus(@Req() req: AuthenticatedRequest) {
    return this.billingService.getStatus(req.user.sub);
  }

  // ── Mutations (ADMIN only) ─────────────────────────────────────────────────

  /**
   * PATCH /billing/email
   *
   * Updates the billing contact email address for the workspace.
   */
  @Patch('email')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(WorkspaceRole.ADMIN)
  updateBillingEmail(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateBillingEmailDto,
  ) {
    return this.billingService.updateBillingEmail(req.user.sub, dto);
  }

  // ── Stripe-ready stubs ─────────────────────────────────────────────────────

  /**
   * POST /billing/checkout
   *
   * TODO: Create a Stripe Checkout Session for plan upgrades.
   * Returns a redirect URL to the Stripe-hosted checkout page.
   *
   * Requires: stripe.checkout.sessions.create({ ... })
   */
  // @Post('checkout')
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles(WorkspaceRole.ADMIN)
  // createCheckoutSession(@Req() req: AuthenticatedRequest, @Body() dto: CreateCheckoutSessionDto) {
  //   return this.billingService.createCheckoutSession(req.user.sub, dto);
  // }

  /**
   * POST /billing/portal
   *
   * TODO: Create a Stripe Customer Portal session for self-service
   * subscription management (cancel, update payment method, view invoices).
   *
   * Requires: stripe.billingPortal.sessions.create({ customer: stripeCustomerId })
   */
  // @Post('portal')
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles(WorkspaceRole.ADMIN)
  // createPortalSession(@Req() req: AuthenticatedRequest) {
  //   return this.billingService.createPortalSession(req.user.sub);
  // }

  /**
   * POST /billing/webhook
   *
   * Stripe webhook endpoint.  Must receive the raw (un-parsed) request body
   * for signature verification.  No JWT guard — Stripe calls this directly.
   *
   * In production:
   *   - Register this URL in the Stripe Dashboard as a webhook endpoint.
   *   - Enable raw body parsing for this route in main.ts:
   *       app.use('/api/v1/billing/webhook', express.raw({ type: 'application/json' }));
   *   - Set STRIPE_WEBHOOK_SECRET in environment.
   */
  @Post('webhook')
  handleStripeWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') stripeSignature: string | undefined,
  ) {
    return this.billingService.handleStripeWebhook(
      req.rawBody ?? Buffer.alloc(0),
      stripeSignature,
    );
  }
}

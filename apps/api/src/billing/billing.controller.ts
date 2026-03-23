import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Headers,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { BillingService } from './billing.service';
import { UpdateBillingEmailDto } from './dto/update-billing-email.dto';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { CreatePortalSessionDto } from './dto/create-portal-session.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../workspace/guards/roles.guard';
import { Roles } from '../workspace/decorators/roles.decorator';
import { WorkspaceRole } from '@prisma/client';

interface AuthenticatedRequest extends Request {
  user: { sub: string; email: string };
}

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('status')
  @UseGuards(JwtAuthGuard)
  getStatus(@Req() req: AuthenticatedRequest) {
    return this.billingService.getStatus(req.user.sub);
  }

  @Get('plans')
  @UseGuards(JwtAuthGuard)
  listPlans() {
    return this.billingService.listPlans();
  }

  @Get('invoices')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(WorkspaceRole.ADMIN)
  listInvoices(@Req() req: AuthenticatedRequest) {
    return this.billingService.listInvoices(req.user.sub);
  }

  /**
   * POST /billing/checkout
   * Creates a Stripe Checkout Session for plan upgrade/downgrade.
   * Returns { url: string } — redirect the user to this URL.
   * Body: { targetPlan, successUrl, cancelUrl }
   */
  @Post('checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(WorkspaceRole.ADMIN)
  createCheckoutSession(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    return this.billingService.createCheckoutSession(req.user.sub, {
      targetPlan: dto.targetPlan,
      successUrl: dto.successUrl,
      cancelUrl: dto.cancelUrl,
    });
  }

  /**
   * POST /billing/portal
   * Creates a Stripe Customer Portal session for self-service management.
   * Returns { url: string } — redirect the user to this URL.
   * Body: { returnUrl }
   */
  @Post('portal')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(WorkspaceRole.ADMIN)
  createPortalSession(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreatePortalSessionDto,
  ) {
    return this.billingService.createPortalSession(req.user.sub, dto.returnUrl);
  }

  @Patch('email')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(WorkspaceRole.ADMIN)
  updateBillingEmail(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateBillingEmailDto,
  ) {
    return this.billingService.updateBillingEmail(req.user.sub, dto);
  }

  /**
   * POST /billing/webhook
   * Stripe webhook endpoint. Raw body required for signature verification.
   * No JWT guard — Stripe calls this directly.
   * Handled events:
   *   checkout.session.completed
   *   customer.subscription.created / updated / deleted
   *   invoice.paid / invoice.payment_failed
   *   customer.subscription.trial_will_end
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  handleStripeWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') stripeSignature: string | undefined,
  ) {
    return this.billingService.handleStripeWebhook(
      req.rawBody ?? Buffer.from(JSON.stringify(req.body)),
      stripeSignature,
    );
  }
}

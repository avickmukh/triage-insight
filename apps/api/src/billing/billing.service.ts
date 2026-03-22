import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingPlan, BillingStatus, WorkspaceRole } from '@prisma/client';
import { UpdateBillingEmailDto } from './dto/update-billing-email.dto';

/**
 * BillingService
 *
 * Owns all billing-related reads and writes against the Workspace model.
 * Stripe integration will be added here once the Stripe SDK is wired in.
 *
 * Current capabilities:
 *   - getStatus          — returns the full billing snapshot for a workspace
 *   - updateBillingEmail — ADMIN-only update of the billing contact email
 *   - handleStripeWebhook — placeholder for incoming Stripe webhook events
 */
@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Resolve the workspace for the calling user (first membership). */
  private async resolveWorkspace(userId: string) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId },
      include: { workspace: true },
    });
    if (!membership) {
      throw new NotFoundException('You are not a member of any workspace.');
    }
    return membership.workspace;
  }

  /** Assert the calling user holds the ADMIN role in the workspace. */
  private async assertAdmin(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    if (!membership || membership.role !== WorkspaceRole.ADMIN) {
      throw new ForbiddenException(
        'Only workspace admins can manage billing.',
      );
    }
  }

  // ── Plan limits catalogue ──────────────────────────────────────────────────

  /**
   * Static plan limits.  These will eventually be driven by a database table
   * or a Stripe Product metadata lookup; for now they are hard-coded to match
   * the PRD pricing tiers.
   */
  static readonly PLAN_LIMITS: Record<
    BillingPlan,
    {
      seats: number | null;
      feedbackPerMonth: number | null;
      aiInsights: boolean;
      integrations: boolean;
      publicPortal: boolean;
      churnIntelligence: boolean;
      sso: boolean;
    }
  > = {
    FREE: {
      seats: 3,
      feedbackPerMonth: 200,
      aiInsights: false,
      integrations: false,
      publicPortal: true,
      churnIntelligence: false,
      sso: false,
    },
    STARTER: {
      seats: 5,
      feedbackPerMonth: 1000,
      aiInsights: true,
      integrations: false,
      publicPortal: true,
      churnIntelligence: false,
      sso: false,
    },
    PRO: {
      seats: null, // unlimited
      feedbackPerMonth: null,
      aiInsights: true,
      integrations: true,
      publicPortal: true,
      churnIntelligence: false,
      sso: false,
    },
    ENTERPRISE: {
      seats: null,
      feedbackPerMonth: null,
      aiInsights: true,
      integrations: true,
      publicPortal: true,
      churnIntelligence: true,
      sso: true,
    },
  };

  // ── Public methods ─────────────────────────────────────────────────────────

  /**
   * GET /billing/status
   *
   * Returns the current billing snapshot for the calling user's workspace.
   * Accessible to ADMIN, EDITOR, and VIEWER.
   */
  async getStatus(userId: string) {
    const workspace = await this.resolveWorkspace(userId);

    const trialDaysRemaining =
      workspace.trialEndsAt && workspace.billingStatus === BillingStatus.TRIALING
        ? Math.max(
            0,
            Math.ceil(
              (new Date(workspace.trialEndsAt).getTime() - Date.now()) /
                (1000 * 60 * 60 * 24),
            ),
          )
        : null;

    return {
      workspaceId: workspace.id,
      billingPlan: workspace.billingPlan,
      billingStatus: workspace.billingStatus,
      billingEmail: workspace.billingEmail ?? null,
      trialEndsAt: workspace.trialEndsAt?.toISOString() ?? null,
      trialDaysRemaining,
      currentPeriodStart: workspace.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: workspace.currentPeriodEnd?.toISOString() ?? null,
      /** Whether a Stripe customer record exists (true = billing is active). */
      hasStripeCustomer: !!workspace.stripeCustomerId,
      planLimits: BillingService.PLAN_LIMITS[workspace.billingPlan],
    };
  }

  /**
   * PATCH /billing/email
   *
   * Updates the billing contact email.  ADMIN only.
   */
  async updateBillingEmail(userId: string, dto: UpdateBillingEmailDto) {
    const workspace = await this.resolveWorkspace(userId);
    await this.assertAdmin(userId, workspace.id);

    const updated = await this.prisma.workspace.update({
      where: { id: workspace.id },
      data: { billingEmail: dto.billingEmail },
    });

    return {
      billingEmail: updated.billingEmail,
    };
  }

  /**
   * POST /billing/webhook
   *
   * Stripe webhook receiver.  The raw request body must be forwarded here
   * without JSON parsing so the Stripe SDK can verify the signature.
   *
   * Current implementation: logs the event type and returns 200.
   * Production implementation should:
   *   1. Verify the Stripe-Signature header with stripe.webhooks.constructEvent()
   *   2. Handle checkout.session.completed → activate subscription
   *   3. Handle invoice.payment_succeeded → update currentPeriodStart/End
   *   4. Handle invoice.payment_failed    → set billingStatus = PAST_DUE
   *   5. Handle customer.subscription.deleted → set billingStatus = CANCELED
   */
  async handleStripeWebhook(
    rawBody: Buffer,
    stripeSignature: string | undefined,
  ): Promise<{ received: boolean }> {
    // TODO: const event = stripe.webhooks.constructEvent(rawBody, stripeSignature, process.env.STRIPE_WEBHOOK_SECRET);
    // TODO: switch (event.type) { ... }
    console.log(
      '[BillingService] Stripe webhook received. Signature header present:',
      !!stripeSignature,
    );
    return { received: true };
  }
}

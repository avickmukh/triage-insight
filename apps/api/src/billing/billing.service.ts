import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingPlan, BillingStatus, TrialStatus, WorkspaceRole } from '@prisma/client';
import { UpdateBillingEmailDto } from './dto/update-billing-email.dto';

/**
 * BillingService
 *
 * Owns all billing-related reads and writes against the Workspace model.
 * Plan limits are now read from the Plan config table (managed by SUPER_ADMIN
 * via /platform/plans) rather than being hard-coded.
 *
 * Current capabilities:
 *   - getStatus          — returns the full billing snapshot for a workspace
 *   - requestPlanChange  — records a plan-change request (mock; no Stripe yet)
 *   - updateBillingEmail — ADMIN-only update of the billing contact email
 *   - handleStripeWebhook — placeholder for incoming Stripe webhook events
 */
@Injectable()
export class BillingService implements OnModuleInit {
  private readonly logger = new Logger(BillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Auto-seed default Plan rows on startup so the app works on a fresh DB
   * without requiring a manual seed call.
   */
  async onModuleInit() {
    const DEFAULT_PLANS = [
      {
        planType: BillingPlan.FREE,
        displayName: 'Free',
        description: 'Forever free for small teams',
        trialDays: 0,
        seatLimit: 3,
        aiUsageLimit: 0,
        feedbackLimit: 200,
        aiInsights: false,
        integrations: false,
        publicPortal: true,
        churnIntelligence: false,
        sso: false,
        isDefault: true,
      },
      {
        planType: BillingPlan.STARTER,
        displayName: 'Starter',
        description: '14-day trial, then $29/mo',
        trialDays: 14,
        seatLimit: 5,
        aiUsageLimit: 500,
        feedbackLimit: 1000,
        aiInsights: true,
        integrations: false,
        publicPortal: true,
        churnIntelligence: false,
        sso: false,
        isDefault: false,
      },
      {
        planType: BillingPlan.GROWTH,
        displayName: 'Growth',
        description: '14-day trial, then $79/mo',
        trialDays: 14,
        seatLimit: 15,
        aiUsageLimit: 2000,
        feedbackLimit: null,
        aiInsights: true,
        integrations: true,
        publicPortal: true,
        churnIntelligence: false,
        sso: false,
        isDefault: false,
      },
      {
        planType: BillingPlan.ENTERPRISE,
        displayName: 'Enterprise',
        description: 'Custom pricing for large teams',
        trialDays: 0,
        seatLimit: null,
        aiUsageLimit: null,
        feedbackLimit: null,
        aiInsights: true,
        integrations: true,
        publicPortal: true,
        churnIntelligence: true,
        sso: true,
        isDefault: false,
      },
    ];

    for (const plan of DEFAULT_PLANS) {
      await this.prisma.plan.upsert({
        where: { planType: plan.planType },
        update: {},
        create: plan,
      });
    }
    this.logger.log('Default plans seeded/verified.');
  }

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

  /**
   * Resolve the Plan config row for a given BillingPlan.
   * Falls back to a safe default object if the row is missing (e.g. fresh DB).
   */
  private async resolvePlanConfig(planType: BillingPlan) {
    const plan = await this.prisma.plan.findUnique({ where: { planType } });
    if (plan) return plan;
    // Safe fallback — should not happen after migration seed
    return {
      planType,
      displayName: planType,
      description: null,
      trialDays: 0,
      seatLimit: planType === BillingPlan.FREE ? 3 : null,
      aiUsageLimit: 0,
      feedbackLimit: planType === BillingPlan.FREE ? 200 : null,
      aiInsights: planType !== BillingPlan.FREE,
      integrations: planType === BillingPlan.ENTERPRISE,
      publicPortal: true,
      churnIntelligence: planType === BillingPlan.ENTERPRISE,
      sso: planType === BillingPlan.ENTERPRISE,
      isActive: true,
      isDefault: planType === BillingPlan.FREE,
    };
  }

  // ── Public methods ─────────────────────────────────────────────────────────

  /**
   * GET /billing/status
   *
   * Returns the current billing snapshot for the calling user's workspace,
   * including DB-driven plan limits and all trial/plan lifecycle fields.
   * Accessible to ADMIN, EDITOR, and VIEWER.
   */
  async getStatus(userId: string) {
    const workspace = await this.resolveWorkspace(userId);
    const planConfig = await this.resolvePlanConfig(workspace.billingPlan);

    // Compute trial days remaining
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

    // Auto-detect expired trials (read-only; a background job should update the DB)
    const effectiveTrialStatus: TrialStatus =
      workspace.trialStatus === TrialStatus.ACTIVE &&
      workspace.trialEndsAt &&
      new Date(workspace.trialEndsAt) < new Date()
        ? TrialStatus.EXPIRED
        : workspace.trialStatus;

    return {
      workspaceId: workspace.id,
      // Plan identity
      billingPlan: workspace.billingPlan,
      billingStatus: workspace.billingStatus,
      planStatus: workspace.planStatus,
      // Trial lifecycle
      trialStatus: effectiveTrialStatus,
      trialStartedAt: workspace.trialStartedAt?.toISOString() ?? null,
      trialEndsAt: workspace.trialEndsAt?.toISOString() ?? null,
      trialDaysRemaining,
      // Billing period (populated by Stripe webhooks)
      currentPeriodStart: workspace.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: workspace.currentPeriodEnd?.toISOString() ?? null,
      // Contact
      billingEmail: workspace.billingEmail ?? null,
      hasStripeCustomer: !!workspace.stripeCustomerId,
      // Workspace-level overrides (may differ from plan defaults)
      seatLimit: workspace.seatLimit,
      aiUsageLimit: workspace.aiUsageLimit,
      // DB-driven plan config
      planConfig: {
        displayName: planConfig.displayName,
        description: planConfig.description,
        trialDays: planConfig.trialDays,
        seatLimit: planConfig.seatLimit,
        aiUsageLimit: planConfig.aiUsageLimit,
        feedbackLimit: planConfig.feedbackLimit,
        aiInsights: planConfig.aiInsights,
        integrations: planConfig.integrations,
        publicPortal: planConfig.publicPortal,
        churnIntelligence: planConfig.churnIntelligence,
        sso: planConfig.sso,
      },
    };
  }

  /**
   * GET /billing/plans
   *
   * Returns all active Plan config rows so the billing page can render
   * the feature comparison table without a separate platform API call.
   * Accessible to all authenticated workspace members.
   */
  async listPlans() {
    const ORDER: BillingPlan[] = [
      BillingPlan.FREE,
      BillingPlan.STARTER,
      BillingPlan.GROWTH,
      BillingPlan.ENTERPRISE,
    ];
    const plans = await this.prisma.plan.findMany({ where: { isActive: true } });
    return plans.sort(
      (a, b) => ORDER.indexOf(a.planType) - ORDER.indexOf(b.planType),
    );
  }

  /**
   * POST /billing/request-plan-change
   *
   * Records a plan-change intent from the workspace admin.
   * MVP: logs the request and returns a confirmation.
   * Production: this will create a Stripe Checkout Session.
   */
  async requestPlanChange(userId: string, targetPlan: BillingPlan) {
    const workspace = await this.resolveWorkspace(userId);
    await this.assertAdmin(userId, workspace.id);
    // TODO: replace with Stripe checkout session creation
    console.log(
      `[BillingService] Plan change requested: workspace=${workspace.id} from=${workspace.billingPlan} to=${targetPlan}`,
    );
    return {
      requested: true,
      currentPlan: workspace.billingPlan,
      targetPlan,
      message: 'Plan change request received. Our team will be in touch shortly.',
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
   *   2. Handle checkout.session.completed → activate subscription, set billingPlan
   *   3. Handle invoice.payment_succeeded → update currentPeriodStart/End
   *   4. Handle invoice.payment_failed    → set billingStatus = PAST_DUE
   *   5. Handle customer.subscription.deleted → set billingStatus = CANCELED, planStatus = CANCELLED
   *   6. Handle customer.subscription.trial_will_end → notify workspace admin
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

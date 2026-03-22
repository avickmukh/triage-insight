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
 * Plan limits are read from the Plan config table (managed by SUPER_ADMIN
 * via /platform/plans) rather than being hard-coded.
 *
 * Plans: FREE | PRO ($29/mo) | BUSINESS ($49/mo)
 *
 * Current capabilities:
 *   - getStatus          — returns the full billing snapshot for a workspace
 *   - listPlans          — returns all active Plan config rows
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
      // ── FREE ──────────────────────────────────────────────────────────────
      {
        planType: BillingPlan.FREE,
        displayName: 'Free',
        description: 'Forever free for solo PMs and small teams',
        priceMonthly: 0,
        trialDays: 0,
        adminLimit: 1,
        seatLimit: 3,
        aiUsageLimit: 0,
        feedbackLimit: 100,
        voiceUploadLimit: 0,
        surveyResponseLimit: 0,
        aiInsights: false,
        aiThemeClustering: false,
        ciqPrioritization: false,
        explainableAi: false,
        weeklyDigest: false,
        voiceFeedback: false,
        survey: false,
        integrations: false,
        publicPortal: true,
        csvImport: true,
        apiAccess: false,
        executiveReporting: false,
        customDomain: false,
        isDefault: true,
      },
      // ── PRO ($29/mo) ───────────────────────────────────────────────────────
      {
        planType: BillingPlan.PRO,
        displayName: 'Pro',
        description: 'For growing teams ready to close the feedback loop',
        priceMonthly: 2900,
        trialDays: 14,
        adminLimit: 1,
        seatLimit: 5,
        aiUsageLimit: 500,
        feedbackLimit: 1000,
        voiceUploadLimit: 100,
        surveyResponseLimit: 300,
        aiInsights: true,
        aiThemeClustering: true,
        ciqPrioritization: true,
        explainableAi: true,
        weeklyDigest: false,
        voiceFeedback: true,
        survey: true,
        integrations: true,
        publicPortal: true,
        csvImport: true,
        apiAccess: true,
        executiveReporting: false,
        customDomain: false,
        isDefault: false,
      },
      // ── BUSINESS ($49/mo) ─────────────────────────────────────────────────
      {
        planType: BillingPlan.BUSINESS,
        displayName: 'Business',
        description: 'For teams that need integrations and deeper insights',
        priceMonthly: 4900,
        trialDays: 14,
        adminLimit: 3,
        seatLimit: 15,
        aiUsageLimit: null,
        feedbackLimit: null,
        voiceUploadLimit: -1,  // -1 = unlimited (column is NOT NULL)
        surveyResponseLimit: -1, // -1 = unlimited (column is NOT NULL)
        aiInsights: true,
        aiThemeClustering: true,
        ciqPrioritization: true,
        explainableAi: true,
        weeklyDigest: true,
        voiceFeedback: true,
        survey: true,
        integrations: true,
        publicPortal: true,
        csvImport: true,
        apiAccess: true,
        executiveReporting: true,
        customDomain: false, // coming soon
        isDefault: false,
      },
    ];

    for (const plan of DEFAULT_PLANS) {
      await this.prisma.plan.upsert({
        where: { planType: plan.planType },
        update: {
          // Update all fields on every restart so config stays in sync
          displayName: plan.displayName,
          description: plan.description,
          priceMonthly: plan.priceMonthly,
          trialDays: plan.trialDays,
          adminLimit: plan.adminLimit,
          seatLimit: plan.seatLimit,
          aiUsageLimit: plan.aiUsageLimit,
          feedbackLimit: plan.feedbackLimit,
          voiceUploadLimit: plan.voiceUploadLimit,
          surveyResponseLimit: plan.surveyResponseLimit,
          aiInsights: plan.aiInsights,
          aiThemeClustering: plan.aiThemeClustering,
          ciqPrioritization: plan.ciqPrioritization,
          explainableAi: plan.explainableAi,
          weeklyDigest: plan.weeklyDigest,
          voiceFeedback: plan.voiceFeedback,
          survey: plan.survey,
          integrations: plan.integrations,
          publicPortal: plan.publicPortal,
          csvImport: plan.csvImport,
          apiAccess: plan.apiAccess,
          executiveReporting: plan.executiveReporting,
          customDomain: plan.customDomain,
          isDefault: plan.isDefault,
        },
        create: plan,
      });
    }
    this.logger.log('Default plans (FREE / PRO / BUSINESS) seeded/verified.');
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
      priceMonthly: 0,
      trialDays: 0,
      adminLimit: 1,
      seatLimit: planType === BillingPlan.FREE ? 3 : null,
      aiUsageLimit: 0,
      feedbackLimit: planType === BillingPlan.FREE ? 100 : null,
      voiceUploadLimit: 0,
      surveyResponseLimit: 0,
      aiInsights: planType !== BillingPlan.FREE,
      aiThemeClustering: planType !== BillingPlan.FREE,
      ciqPrioritization: planType !== BillingPlan.FREE,
      explainableAi: planType !== BillingPlan.FREE,
      weeklyDigest: planType === BillingPlan.BUSINESS,
      voiceFeedback: planType !== BillingPlan.FREE,
      survey: planType !== BillingPlan.FREE,
      integrations: planType !== BillingPlan.FREE,
      publicPortal: true,
      csvImport: true,
      apiAccess: planType !== BillingPlan.FREE,
      executiveReporting: planType === BillingPlan.BUSINESS,
      customDomain: false,
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
        priceMonthly: planConfig.priceMonthly,
        trialDays: planConfig.trialDays,
        adminLimit: planConfig.adminLimit,
        seatLimit: planConfig.seatLimit,
        aiUsageLimit: planConfig.aiUsageLimit,
        feedbackLimit: planConfig.feedbackLimit,
        voiceUploadLimit: planConfig.voiceUploadLimit,
        surveyResponseLimit: planConfig.surveyResponseLimit,
        aiInsights: planConfig.aiInsights,
        aiThemeClustering: planConfig.aiThemeClustering,
        ciqPrioritization: planConfig.ciqPrioritization,
        explainableAi: planConfig.explainableAi,
        weeklyDigest: planConfig.weeklyDigest,
        voiceFeedback: planConfig.voiceFeedback,
        survey: planConfig.survey,
        integrations: planConfig.integrations,
        publicPortal: planConfig.publicPortal,
        csvImport: planConfig.csvImport,
        apiAccess: planConfig.apiAccess,
        executiveReporting: planConfig.executiveReporting,
        customDomain: planConfig.customDomain,
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
      BillingPlan.PRO,
      BillingPlan.BUSINESS,
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
   */
  async handleStripeWebhook(
    rawBody: Buffer,
    stripeSignature: string | undefined,
  ): Promise<{ received: boolean }> {
    // TODO: verify signature and handle event types
    console.log(
      '[BillingService] Stripe webhook received. Signature header present:',
      !!stripeSignature,
    );
    return { received: true };
  }
}

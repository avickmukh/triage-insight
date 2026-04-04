import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  BillingPlan,
  BillingStatus,
  TrialStatus,
  WorkspaceRole,
} from '@prisma/client';
import Stripe from 'stripe';
import { UpdateBillingEmailDto } from './dto/update-billing-email.dto';

/**
 * BillingService — Full Stripe billing implementation
 *
 *   - getStatus              — billing snapshot for a workspace
 *   - listPlans              — all active Plan config rows
 *   - createCheckoutSession  — Stripe Checkout for new subscriptions / upgrades
 *   - createPortalSession    — Stripe Customer Portal for self-service management
 *   - handleStripeWebhook    — processes all Stripe webhook events
 *   - listInvoices           — cached invoices from the Invoice table
 *   - updateBillingEmail     — ADMIN-only billing contact update
 *
 * Plan pricing is defined by the platform admin via /platform/plans.
 * Each Plan row must have a stripePriceId set for Stripe Checkout to work.
 */
@Injectable()
export class BillingService implements OnModuleInit {
  private readonly logger = new Logger(BillingService.name);
  private stripe: Stripe | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async onModuleInit() {
    const stripeKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (stripeKey) {
      this.stripe = new Stripe(stripeKey, { apiVersion: '2026-02-25.clover' });
      this.logger.log('Stripe SDK initialised');
    } else {
      this.logger.warn(
        'STRIPE_SECRET_KEY not set — Stripe features disabled. Set it in .env to enable billing.',
      );
    }
    await this.seedDefaultPlans();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException(
        'Stripe is not configured. Please contact your platform administrator.',
      );
    }
    return this.stripe;
  }

  private async resolveWorkspace(userId: string) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId },
      include: { workspace: true },
    });
    if (!membership)
      throw new NotFoundException('You are not a member of any workspace.');
    return membership.workspace;
  }

  private async assertAdmin(userId: string, workspaceId: string) {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    if (!member || member.role !== WorkspaceRole.ADMIN) {
      throw new ForbiddenException('Only workspace admins can manage billing.');
    }
  }

  private async resolvePlanConfig(planType: BillingPlan) {
    const plan = await this.prisma.plan.findUnique({ where: { planType } });
    if (plan) return plan;
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
      stripePriceId: null,
      stripeProductId: null,
    };
  }

  // ── Plan seeding ───────────────────────────────────────────────────────────

  private async seedDefaultPlans() {
    const DEFAULT_PLANS = [
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
        voiceUploadLimit: -1,
        surveyResponseLimit: -1,
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
        customDomain: false,
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
    this.logger.log('Default plans (FREE / PRO / BUSINESS) seeded/verified.');
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  async getStatus(userId: string) {
    const workspace = await this.resolveWorkspace(userId);
    const planConfig = await this.resolvePlanConfig(workspace.billingPlan);

    // Auto-expire trial if trialEndsAt has passed
    if (
      workspace.billingStatus === BillingStatus.TRIALING &&
      workspace.trialEndsAt &&
      workspace.trialEndsAt < new Date()
    ) {
      await this.prisma.workspace.update({
        where: { id: workspace.id },
        data: {
          billingStatus: BillingStatus.ACTIVE,
          trialStatus: TrialStatus.EXPIRED,
        },
      });
      workspace.billingStatus = BillingStatus.ACTIVE;
    }

    const trialDaysRemaining =
      workspace.trialEndsAt &&
      workspace.billingStatus === BillingStatus.TRIALING
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
      planStatus: workspace.planStatus,
      trialStatus: workspace.trialStatus,
      trialStartedAt: workspace.trialStartedAt?.toISOString() ?? null,
      trialEndsAt: workspace.trialEndsAt?.toISOString() ?? null,
      trialDaysRemaining,
      currentPeriodStart: workspace.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: workspace.currentPeriodEnd?.toISOString() ?? null,
      billingEmail: workspace.billingEmail ?? null,
      hasStripeCustomer: !!workspace.stripeCustomerId,
      stripeSubscriptionId: workspace.stripeSubscriptionId ?? null,
      seatLimit: workspace.seatLimit,
      aiUsageLimit: workspace.aiUsageLimit,
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
        stripePriceId: planConfig.stripePriceId,
      },
    };
  }

  // ── Plans ──────────────────────────────────────────────────────────────────

  async listPlans() {
    const ORDER: BillingPlan[] = [
      BillingPlan.FREE,
      BillingPlan.PRO,
      BillingPlan.BUSINESS,
    ];
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
    });
    return plans.sort(
      (a, b) => ORDER.indexOf(a.planType) - ORDER.indexOf(b.planType),
    );
  }

  // ── Stripe Checkout ────────────────────────────────────────────────────────

  /**
   * POST /billing/checkout
   *
   * Creates a Stripe Checkout Session for a new subscription or plan upgrade.
   * If the workspace already has a Stripe subscription, redirects to Customer Portal instead.
   * Returns { url, mode } — frontend redirects the user to this URL.
   */
  async createCheckoutSession(
    userId: string,
    dto: { targetPlan: BillingPlan; successUrl: string; cancelUrl: string },
  ) {
    const stripe = this.requireStripe();
    const workspace = await this.resolveWorkspace(userId);
    await this.assertAdmin(userId, workspace.id);

    const plan = await this.prisma.plan.findUnique({
      where: { planType: dto.targetPlan },
    });
    if (!plan) throw new NotFoundException(`Plan ${dto.targetPlan} not found`);
    if (!plan.stripePriceId) {
      throw new BadRequestException(
        `Plan ${dto.targetPlan} does not have a Stripe Price ID configured. ` +
          'Please contact your platform administrator to set it up via /platform/plans.',
      );
    }
    if (plan.priceMonthly === 0) {
      throw new BadRequestException(
        'Cannot create a Stripe Checkout session for a free plan.',
      );
    }

    const stripeCustomerId = await this.getOrCreateStripeCustomer(
      workspace,
      stripe,
    );

    // If already subscribed, use Customer Portal for plan changes
    if (workspace.stripeSubscriptionId) {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: dto.successUrl,
      });
      return { url: portalSession.url, mode: 'portal' as const };
    }

    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData =
      {
        metadata: { workspaceId: workspace.id, targetPlan: dto.targetPlan },
      };
    if (plan.trialDays > 0 && workspace.trialStatus !== TrialStatus.EXPIRED) {
      subscriptionData.trial_period_days = plan.trialDays;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      subscription_data: subscriptionData,
      success_url: `${dto.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: dto.cancelUrl,
      metadata: { workspaceId: workspace.id, targetPlan: dto.targetPlan },
      allow_promotion_codes: true,
    });

    return {
      url: session.url,
      sessionId: session.id,
      mode: 'checkout' as const,
    };
  }

  // ── Stripe Customer Portal ─────────────────────────────────────────────────

  /**
   * POST /billing/portal
   *
   * Creates a Stripe Customer Portal session for self-service subscription
   * management (cancel, update payment method, view invoices, upgrade/downgrade).
   */
  async createPortalSession(userId: string, returnUrl: string) {
    const stripe = this.requireStripe();
    const workspace = await this.resolveWorkspace(userId);
    await this.assertAdmin(userId, workspace.id);

    if (!workspace.stripeCustomerId) {
      throw new BadRequestException(
        'No Stripe customer found for this workspace. Please subscribe first.',
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: workspace.stripeCustomerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  // ── Invoices ───────────────────────────────────────────────────────────────

  /**
   * GET /billing/invoices
   *
   * Returns cached invoices from the Invoice table.
   * Falls back to fetching directly from Stripe if the cache is empty.
   */
  async listInvoices(userId: string) {
    const workspace = await this.resolveWorkspace(userId);

    const cached = await this.prisma.invoice.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: 'desc' },
      take: 24,
    });
    if (cached.length > 0) return cached;

    if (!this.stripe || !workspace.stripeCustomerId) return [];

    try {
      const stripeInvoices = await this.stripe.invoices.list({
        customer: workspace.stripeCustomerId,
        limit: 24,
      });
      await Promise.all(
        stripeInvoices.data.map((inv) =>
          this.prisma.invoice.upsert({
            where: { stripeInvoiceId: inv.id },
            update: this.stripeInvoiceToDb(workspace.id, inv) as any,
            create: {
              workspaceId: workspace.id,
              ...this.stripeInvoiceToDb(workspace.id, inv),
            } as any,
          }),
        ),
      );
      return this.prisma.invoice.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: 'desc' },
        take: 24,
      });
    } catch (err) {
      this.logger.error('Failed to fetch invoices from Stripe', err);
      return [];
    }
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  /**
   * POST /billing/webhook
   *
   * Stripe webhook endpoint. Verifies the signature and processes events.
   * Raw body must be forwarded without JSON parsing.
   *
   * Handled events:
   *   checkout.session.completed         — activate subscription after checkout
   *   customer.subscription.updated      — sync plan/status changes
   *   customer.subscription.deleted      — downgrade to FREE on cancellation
   *   invoice.payment_succeeded          — cache invoice, mark ACTIVE
   *   invoice.payment_failed             — mark PAST_DUE
   *   invoice.created / finalized        — cache invoice
   */
  async handleStripeWebhook(
    rawBody: Buffer,
    stripeSignature: string | undefined,
  ): Promise<{ received: boolean }> {
    const stripe = this.requireStripe();
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');

    let event: Stripe.Event;
    try {
      if (webhookSecret && stripeSignature) {
        event = stripe.webhooks.constructEvent(
          rawBody,
          stripeSignature,
          webhookSecret,
        );
      } else {
        event = JSON.parse(rawBody.toString()) as Stripe.Event;
        this.logger.warn(
          'Stripe webhook received without signature verification (dev mode)',
        );
      }
    } catch (err) {
      this.logger.error('Stripe webhook signature verification failed', err);
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    this.logger.log(`Stripe webhook: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object);
        break;
      case 'invoice.created':
      case 'invoice.finalized':
        await this.upsertInvoiceFromStripe(event.data.object);
        break;
      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }

    return { received: true };
  }

  // ── Webhook event handlers ─────────────────────────────────────────────────

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const workspaceId = session.metadata?.workspaceId;
    const targetPlan = session.metadata?.targetPlan as BillingPlan | undefined;
    if (!workspaceId || !targetPlan) {
      this.logger.warn(
        'checkout.session.completed missing metadata',
        session.id,
      );
      return;
    }

    const subscription = session.subscription
      ? await this.requireStripe().subscriptions.retrieve(
          session.subscription as string,
        )
      : null;

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        billingPlan: targetPlan,
        billingStatus: BillingStatus.ACTIVE,
        trialStatus: TrialStatus.CONVERTED,
        stripeCustomerId: session.customer as string,
        stripeSubscriptionId: subscription?.id ?? null,
        currentPeriodStart: subscription
          ? new Date(subscription.billing_cycle_anchor * 1000)
          : null,
        currentPeriodEnd: subscription?.trial_end
          ? new Date(subscription.trial_end * 1000)
          : subscription
            ? new Date((subscription.billing_cycle_anchor + 2592000) * 1000)
            : null,
      },
    });
    this.logger.log(`Workspace ${workspaceId} upgraded to ${targetPlan}`);
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const workspace = await this.prisma.workspace.findFirst({
      where: { stripeSubscriptionId: subscription.id },
    });
    if (!workspace) {
      this.logger.warn(
        `No workspace found for subscription ${subscription.id}`,
      );
      return;
    }

    const priceId = subscription.items.data[0]?.price?.id;
    const plan = priceId
      ? await this.prisma.plan.findFirst({ where: { stripePriceId: priceId } })
      : null;

    const billingStatus = this.stripeToBillingStatus(subscription.status);

    await this.prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        billingPlan: plan?.planType ?? workspace.billingPlan,
        billingStatus,
        trialStatus:
          subscription.status === 'trialing'
            ? TrialStatus.ACTIVE
            : workspace.trialStatus,
        trialEndsAt: subscription.trial_end
          ? new Date(subscription.trial_end * 1000)
          : workspace.trialEndsAt,
        currentPeriodStart: new Date(subscription.billing_cycle_anchor * 1000),
        currentPeriodEnd: subscription.trial_end
          ? new Date(subscription.trial_end * 1000)
          : new Date((subscription.billing_cycle_anchor + 2592000) * 1000),
      },
    });
    this.logger.log(
      `Workspace ${workspace.id} subscription updated: ${subscription.status}`,
    );
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const workspace = await this.prisma.workspace.findFirst({
      where: { stripeSubscriptionId: subscription.id },
    });
    if (!workspace) return;

    await this.prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        billingPlan: BillingPlan.FREE,
        billingStatus: BillingStatus.CANCELED,
        stripeSubscriptionId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
      },
    });
    this.logger.log(
      `Workspace ${workspace.id} subscription canceled — downgraded to FREE`,
    );
  }

  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    await this.upsertInvoiceFromStripe(invoice);
    const _subId =
      invoice.parent?.type === 'subscription_details'
        ? invoice.parent.subscription_details?.subscription
        : null;
    if (_subId) {
      const workspace = await this.prisma.workspace.findFirst({
        where: { stripeSubscriptionId: _subId as string },
      });
      if (workspace && workspace.billingStatus === BillingStatus.PAST_DUE) {
        await this.prisma.workspace.update({
          where: { id: workspace.id },
          data: { billingStatus: BillingStatus.ACTIVE },
        });
      }
    }
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
    await this.upsertInvoiceFromStripe(invoice);
    const _subId =
      invoice.parent?.type === 'subscription_details'
        ? invoice.parent.subscription_details?.subscription
        : null;
    if (_subId) {
      const workspace = await this.prisma.workspace.findFirst({
        where: { stripeSubscriptionId: _subId as string },
      });
      if (workspace) {
        await this.prisma.workspace.update({
          where: { id: workspace.id },
          data: { billingStatus: BillingStatus.PAST_DUE },
        });
        this.logger.warn(
          `Workspace ${workspace.id} marked PAST_DUE after failed payment`,
        );
      }
    }
  }

  private async upsertInvoiceFromStripe(invoice: Stripe.Invoice) {
    if (!invoice.customer) return;
    const workspace = await this.prisma.workspace.findFirst({
      where: { stripeCustomerId: invoice.customer as string },
    });
    if (!workspace) return;

    const data = this.stripeInvoiceToDb(workspace.id, invoice);
    await this.prisma.invoice.upsert({
      where: { stripeInvoiceId: invoice.id },
      update: data as any,
      create: { workspaceId: workspace.id, ...data } as any,
    });
  }

  // ── Billing email ──────────────────────────────────────────────────────────

  async updateBillingEmail(userId: string, dto: UpdateBillingEmailDto) {
    const workspace = await this.resolveWorkspace(userId);
    await this.assertAdmin(userId, workspace.id);
    const updated = await this.prisma.workspace.update({
      where: { id: workspace.id },
      data: { billingEmail: dto.billingEmail },
    });
    return { billingEmail: updated.billingEmail };
  }

  // ── Utility ────────────────────────────────────────────────────────────────

  private async getOrCreateStripeCustomer(
    workspace: {
      id: string;
      billingEmail: string | null;
      name: string;
      stripeCustomerId: string | null;
    },
    stripe: Stripe,
  ): Promise<string> {
    if (workspace.stripeCustomerId) return workspace.stripeCustomerId;

    const customer = await stripe.customers.create({
      email: workspace.billingEmail ?? undefined,
      name: workspace.name,
      metadata: { workspaceId: workspace.id },
    });

    await this.prisma.workspace.update({
      where: { id: workspace.id },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  private stripeToBillingStatus(
    status: Stripe.Subscription.Status,
  ): BillingStatus {
    switch (status) {
      case 'active':
        return BillingStatus.ACTIVE;
      case 'trialing':
        return BillingStatus.TRIALING;
      case 'past_due':
        return BillingStatus.PAST_DUE;
      case 'canceled':
      case 'unpaid':
        return BillingStatus.CANCELED;
      default:
        return BillingStatus.ACTIVE;
    }
  }

  private stripeInvoiceToDb(workspaceId: string, invoice: Stripe.Invoice) {
    return {
      stripeInvoiceId: invoice.id,
      stripeSubscriptionId:
        invoice.parent?.type === 'subscription_details'
          ? (invoice.parent.subscription_details?.subscription as string | null)
          : null,
      number: invoice.number ?? null,
      status: invoice.status ?? 'open',
      amountDue: invoice.amount_due,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
      invoicePdfUrl: invoice.invoice_pdf ?? null,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      periodStart: invoice.period_start
        ? new Date(invoice.period_start * 1000)
        : null,
      periodEnd: invoice.period_end
        ? new Date(invoice.period_end * 1000)
        : null,
      paidAt: invoice.status_transitions?.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000)
        : null,
    };
  }
}

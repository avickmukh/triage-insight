import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  BillingPlan,
  BillingStatus,
  PlanStatus,
  WorkspaceStatus,
  TrialStatus,
  AiJobStatus,
  PlatformRole,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import {
  UpdateWorkspaceStatusDto,
  OverrideBillingPlanDto,
  ExtendTrialDto,
  SetFeatureOverrideDto,
  ListWorkspacesQueryDto,
} from './dto/platform.dto';

const PLAN_ORDER: BillingPlan[] = [
  BillingPlan.FREE,
  BillingPlan.PRO,
  BillingPlan.BUSINESS,
];

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ── Audit helper ─────────────────────────────────────────────────────────────

  private async audit(
    actorId: string | undefined,
    action: string,
    workspaceId: string | undefined,
    details: Record<string, unknown>,
  ) {
    await this.prisma.platformAuditLog.create({
      data: {
        actorId: actorId ?? null,
        action,
        workspaceId: workspaceId ?? null,
        details: details as Prisma.InputJsonValue,
      },
    });
  }

  // ── Plan catalogue ────────────────────────────────────────────────────────────

  async listPlans() {
    const plans = await this.prisma.plan.findMany();
    return plans.sort(
      (a, b) => PLAN_ORDER.indexOf(a.planType) - PLAN_ORDER.indexOf(b.planType),
    );
  }

  async getPlan(planType: BillingPlan) {
    const plan = await this.prisma.plan.findUnique({ where: { planType } });
    if (!plan) throw new NotFoundException(`Plan '${planType}' not found.`);
    return plan;
  }

  async createPlan(dto: CreatePlanDto) {
    const existing = await this.prisma.plan.findUnique({
      where: { planType: dto.planType },
    });
    if (existing) {
      throw new ConflictException(
        `A plan config for '${dto.planType}' already exists. Use PATCH to update it.`,
      );
    }
    if (dto.isDefault) {
      await this.prisma.plan.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }
    return this.prisma.plan.create({ data: dto as any });
  }

  async updatePlan(planType: BillingPlan, dto: UpdatePlanDto) {
    await this.getPlan(planType);
    if (dto.isDefault === true) {
      await this.prisma.plan.updateMany({
        where: { isDefault: true, planType: { not: planType } },
        data: { isDefault: false },
      });
    }
    return this.prisma.plan.update({ where: { planType }, data: dto as any });
  }

  async deletePlan(planType: BillingPlan) {
    await this.getPlan(planType);
    const inUse = await this.prisma.workspace.count({
      where: { billingPlan: planType },
    });
    if (inUse > 0) {
      return this.prisma.plan.update({
        where: { planType },
        data: { isActive: false },
      });
    }
    return this.prisma.plan.delete({ where: { planType } });
  }

  async updateTrialDuration(planType: BillingPlan, trialDays: number) {
    if (trialDays < 0) throw new BadRequestException('trialDays must be >= 0.');
    if (
      trialDays > 0 &&
      planType !== BillingPlan.PRO &&
      planType !== BillingPlan.BUSINESS
    ) {
      throw new BadRequestException(
        'Trials are only supported for PRO and BUSINESS plans.',
      );
    }
    await this.getPlan(planType);
    return this.prisma.plan.update({ where: { planType }, data: { trialDays } });
  }

  // ── Workspace management ──────────────────────────────────────────────────────

  async listWorkspaces(query: ListWorkspacesQueryDto) {
    const { page = 1, limit = 50, search, status, billingPlan } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;
    if (billingPlan) where.billingPlan = billingPlan;

    const [data, total] = await Promise.all([
      this.prisma.workspace.findMany({
        skip,
        take: limit,
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          billingPlan: true,
          billingStatus: true,
          planStatus: true,
          trialStatus: true,
          trialEndsAt: true,
          seatLimit: true,
          aiUsageLimit: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { members: true, feedbacks: true },
          },
        },
      }),
      this.prisma.workspace.count({ where }),
    ]);

    return {
      workspaces: data.map((w) => ({
        ...w,
        memberCount: w._count.members,
        feedbackCount: w._count.feedbacks,
        _count: undefined,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getWorkspaceDetail(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        _count: {
          select: {
            members: true,
            feedbacks: true,
            themes: true,
            supportTickets: true,
            customers: true,
          },
        },
        members: {
          take: 5,
          orderBy: { joinedAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                status: true,
              },
            },
          },
        },
        invoices: { take: 5, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!workspace)
      throw new NotFoundException(`Workspace '${workspaceId}' not found.`);

    const lastFeedback = await this.prisma.feedback.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    return {
      ...workspace,
      memberCount: workspace._count.members,
      feedbackCount: workspace._count.feedbacks,
      themeCount: workspace._count.themes,
      supportTicketCount: workspace._count.supportTickets,
      customerCount: workspace._count.customers,
      lastActivityAt: lastFeedback?.createdAt ?? null,
      _count: undefined,
    };
  }

  async updateWorkspaceStatus(
    workspaceId: string,
    dto: UpdateWorkspaceStatusDto,
    actorId: string,
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace)
      throw new NotFoundException(`Workspace '${workspaceId}' not found.`);

    const before = workspace.status;
    const updated = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { status: dto.status },
    });

    await this.audit(actorId, 'WORKSPACE_STATUS_CHANGED', workspaceId, {
      before,
      after: dto.status,
      reason: dto.reason ?? null,
    });

    return updated;
  }

  async deleteWorkspace(workspaceId: string, actorId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace)
      throw new NotFoundException(`Workspace '${workspaceId}' not found.`);

    const updated = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { status: WorkspaceStatus.DISABLED },
    });

    await this.audit(actorId, 'WORKSPACE_DELETED', workspaceId, {
      name: workspace.name,
      slug: workspace.slug,
    });

    return { success: true, workspace: updated };
  }

  // ── Billing control ───────────────────────────────────────────────────────────

  async getBillingHealth() {
    const [
      totalWorkspaces,
      activeCount,
      suspendedCount,
      trialingCount,
      pastDueCount,
      canceledCount,
      planBreakdown,
    ] = await Promise.all([
      this.prisma.workspace.count(),
      this.prisma.workspace.count({
        where: { billingStatus: BillingStatus.ACTIVE },
      }),
      this.prisma.workspace.count({
        where: { status: WorkspaceStatus.SUSPENDED },
      }),
      this.prisma.workspace.count({
        where: { billingStatus: BillingStatus.TRIALING },
      }),
      this.prisma.workspace.count({
        where: { billingStatus: BillingStatus.PAST_DUE },
      }),
      this.prisma.workspace.count({
        where: { billingStatus: BillingStatus.CANCELED },
      }),
      this.prisma.workspace.groupBy({
        by: ['billingPlan'],
        _count: { id: true },
      }),
    ]);

    return {
      totalWorkspaces,
      // Alias fields to match frontend expectations
      paidWorkspaces: activeCount,
      trialWorkspaces: trialingCount,
      failedPayments: pastDueCount,
      cancelledWorkspaces: canceledCount,
      freeWorkspaces: planBreakdown.find((p) => p.billingPlan === BillingPlan.FREE)?._count.id ?? 0,
      suspendedWorkspaces: suspendedCount,
      // MRR/ARR/churnRate are Stripe-derived; return null when Stripe is not configured
      mrr: null,
      arr: null,
      churnRate: null,
      planDistribution: planBreakdown.map((p) => ({
        plan: p.billingPlan,
        count: p._count.id,
      })),
      // Legacy field names kept for backwards compatibility
      activeCount,
      trialingCount,
      pastDueCount,
      canceledCount,
      planBreakdown: planBreakdown.map((p) => ({
        plan: p.billingPlan,
        count: p._count.id,
      })),
    };
  }

  async listAllSubscriptions(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.workspace.findMany({
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          billingPlan: true,
          billingStatus: true,
          planStatus: true,
          trialStatus: true,
          trialEndsAt: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          billingEmail: true,
          createdAt: true,
        },
      }),
      this.prisma.workspace.count(),
    ]);
    return { workspaces: data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async overrideBillingPlan(
    workspaceId: string,
    dto: OverrideBillingPlanDto,
    actorId: string,
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace)
      throw new NotFoundException(`Workspace '${workspaceId}' not found.`);

    const planConfig = await this.prisma.plan.findUnique({
      where: { planType: dto.plan },
    });

    const before = { plan: workspace.billingPlan, status: workspace.billingStatus };

    const updated = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        billingPlan: dto.plan,
        billingStatus: dto.billingStatus ?? BillingStatus.ACTIVE,
        planStatus: PlanStatus.ACTIVE,
        planId: planConfig?.id ?? null,
        ...(planConfig?.seatLimit !== undefined && {
          seatLimit: planConfig.seatLimit ?? 3,
        }),
        ...(planConfig?.aiUsageLimit !== undefined && {
          aiUsageLimit: planConfig.aiUsageLimit ?? 0,
        }),
      },
    });

    await this.audit(actorId, 'BILLING_PLAN_OVERRIDE', workspaceId, {
      before,
      after: { plan: dto.plan, status: dto.billingStatus },
      reason: dto.reason ?? null,
    });

    return updated;
  }

  async extendTrial(
    workspaceId: string,
    dto: ExtendTrialDto,
    actorId: string,
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace)
      throw new NotFoundException(`Workspace '${workspaceId}' not found.`);

    const base =
      workspace.trialEndsAt && workspace.trialEndsAt > new Date()
        ? workspace.trialEndsAt
        : new Date();

    const newTrialEndsAt = new Date(
      base.getTime() + dto.days * 24 * 60 * 60 * 1000,
    );

    const updated = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        trialEndsAt: newTrialEndsAt,
        trialStatus: TrialStatus.ACTIVE,
        billingStatus: BillingStatus.TRIALING,
      },
    });

    await this.audit(actorId, 'TRIAL_EXTENDED', workspaceId, {
      days: dto.days,
      newTrialEndsAt,
      reason: dto.reason ?? null,
    });

    return updated;
  }

  async cancelSubscription(workspaceId: string, actorId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace)
      throw new NotFoundException(`Workspace '${workspaceId}' not found.`);

    const updated = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        billingStatus: BillingStatus.CANCELED,
        planStatus: PlanStatus.CANCELLED,
        stripeSubscriptionId: null,
      },
    });

    await this.audit(actorId, 'SUBSCRIPTION_CANCELLED', workspaceId, {
      previousPlan: workspace.billingPlan,
      previousStatus: workspace.billingStatus,
    });

    return updated;
  }

  async reactivateSubscription(workspaceId: string, actorId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace)
      throw new NotFoundException(`Workspace '${workspaceId}' not found.`);

    if (workspace.billingStatus !== BillingStatus.CANCELED) {
      throw new BadRequestException('Subscription is not cancelled.');
    }

    const updated = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        billingStatus: BillingStatus.ACTIVE,
        planStatus: PlanStatus.ACTIVE,
        status: WorkspaceStatus.ACTIVE,
      },
    });

    await this.audit(actorId, 'SUBSCRIPTION_REACTIVATED', workspaceId, {
      plan: workspace.billingPlan,
    });

    return updated;
  }

  // ── Feature flag overrides ────────────────────────────────────────────────────

  readonly VALID_FEATURES = [
    'aiInsights',
    'aiThemeClustering',
    'ciqPrioritization',
    'explainableAi',
    'weeklyDigest',
    'voiceFeedback',
    'survey',
    'integrations',
    'publicPortal',
    'csvImport',
    'apiAccess',
    'executiveReporting',
    'customDomain',
  ] as const;

  async listFeatureOverrides(workspaceId: string) {
    return this.prisma.workspaceFeatureOverride.findMany({
      where: { workspaceId },
      orderBy: { feature: 'asc' },
    });
  }

  async setFeatureOverride(
    workspaceId: string,
    dto: SetFeatureOverrideDto,
    actorId: string,
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace)
      throw new NotFoundException(`Workspace '${workspaceId}' not found.`);

    if (!(this.VALID_FEATURES as readonly string[]).includes(dto.feature)) {
      throw new BadRequestException(`Unknown feature key '${dto.feature}'.`);
    }

    const override = await this.prisma.workspaceFeatureOverride.upsert({
      where: { workspaceId_feature: { workspaceId, feature: dto.feature } },
      create: {
        workspaceId,
        feature: dto.feature,
        enabled: dto.enabled,
        setById: actorId,
      },
      update: { enabled: dto.enabled, setById: actorId },
    });

    await this.audit(actorId, 'FEATURE_FLAG_OVERRIDE', workspaceId, {
      feature: dto.feature,
      enabled: dto.enabled,
      reason: dto.reason ?? null,
    });

    return override;
  }

  async deleteFeatureOverride(
    workspaceId: string,
    feature: string,
    actorId: string,
  ) {
    const existing = await this.prisma.workspaceFeatureOverride.findUnique({
      where: { workspaceId_feature: { workspaceId, feature } },
    });
    if (!existing)
      throw new NotFoundException(`No override found for feature '${feature}'.`);

    await this.prisma.workspaceFeatureOverride.delete({
      where: { workspaceId_feature: { workspaceId, feature } },
    });

    await this.audit(actorId, 'FEATURE_FLAG_OVERRIDE_REMOVED', workspaceId, {
      feature,
    });

    return { success: true };
  }

  // ── System health / metrics ───────────────────────────────────────────────────

  async getSystemHealth() {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalWorkspaces,
      activeWorkspaces,
      suspendedWorkspaces,
      totalFeedback,
      feedbackLast24h,
      feedbackLast7d,
      totalAiJobs,
      runningAiJobs,
      failedAiJobs,
      integrationErrors,
      totalUsers,
      activeUsersThisMonth,
      feedbackLast30d,
    ] = await Promise.all([
      this.prisma.workspace.count(),
      this.prisma.workspace.count({ where: { status: WorkspaceStatus.ACTIVE } }),
      this.prisma.workspace.count({
        where: { status: WorkspaceStatus.SUSPENDED },
      }),
      this.prisma.feedback.count(),
      this.prisma.feedback.count({ where: { createdAt: { gte: last24h } } }),
      this.prisma.feedback.count({ where: { createdAt: { gte: last7d } } }),
      this.prisma.aiJobLog.count(),
      this.prisma.aiJobLog.count({ where: { status: AiJobStatus.RUNNING } }),
      this.prisma.aiJobLog.count({ where: { status: AiJobStatus.FAILED } }),
      this.prisma.integrationConnection.count({
        where: { healthState: 'ERROR' as any },
      }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { updatedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
      this.prisma.feedback.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
    ]);

    // Probe infrastructure health
    const dbStatus = await this.prisma.$queryRaw`SELECT 1`
      .then(() => 'healthy')
      .catch(() => 'down');

    const redisHost = this.config.get<string>('REDIS_HOST', 'localhost');
    const redisPort = this.config.get<number>('REDIS_PORT', 6379);
    let redisStatus = 'down';
    let redisLatency: number | null = null;
    try {
      const net = await import('net');
      await new Promise<void>((resolve, reject) => {
        const t0 = Date.now();
        const sock = net.createConnection({ host: redisHost, port: redisPort }, () => {
          redisLatency = Date.now() - t0;
          redisStatus = 'healthy';
          sock.destroy();
          resolve();
        });
        sock.setTimeout(2000);
        sock.on('error', reject);
        sock.on('timeout', reject);
      });
    } catch { /* redisStatus stays 'down' */ }

    const openAiKey = this.config.get<string>('OPENAI_API_KEY', '');
    const aiStatus = openAiKey ? 'healthy' : 'degraded';

    const s3Bucket = this.config.get<string>('AWS_S3_BUCKET', '');
    const storageStatus = s3Bucket ? 'healthy' : 'degraded';

    const stripeKey = this.config.get<string>('STRIPE_SECRET_KEY', '');
    const stripeStatus = stripeKey ? 'healthy' : 'degraded';

    // Email: no dedicated env var yet — mark degraded until configured
    const emailStatus = 'degraded';

    return {
      services: {
        database: dbStatus,
        redis: redisStatus,
        queue: redisStatus, // queue runs on Redis
        ai: aiStatus,
        storage: storageStatus,
        email: emailStatus,
        stripe: stripeStatus,
      },
      latencies: {
        database: null,
        redis: redisLatency,
      },
      workspaces: {
        total: totalWorkspaces,
        active: activeWorkspaces,
        suspended: suspendedWorkspaces,
      },
      feedback: {
        total: totalFeedback,
        last24h: feedbackLast24h,
        last7d: feedbackLast7d,
        last30Days: feedbackLast30d,
        ingestionRatePerHour: Math.round(feedbackLast24h / 24),
      },
      aiJobs: {
        total: totalAiJobs,
        running: runningAiJobs,
        failed: failedAiJobs,
        failureRate:
          totalAiJobs > 0
            ? Math.round((failedAiJobs / totalAiJobs) * 100)
            : 0,
      },
      // queue metrics are not directly queryable without Bull injection; return nulls
      queue: {
        waiting: null,
        active: null,
        completed: null,
        failed: null,
        delayed: null,
      },
      integrations: { errorCount: integrationErrors },
      users: { total: totalUsers, activeThisMonth: activeUsersThisMonth },
    };
  }

  // ── Platform audit log ────────────────────────────────────────────────────────

  async listPlatformAuditLogs(
    page = 1,
    limit = 50,
    workspaceId?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (workspaceId) where.workspaceId = workspaceId;

    const [data, total] = await Promise.all([
      this.prisma.platformAuditLog.findMany({
        skip,
        take: limit,
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          workspace: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.platformAuditLog.count({ where }),
    ]);

    return { logs: data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── Platform users management ─────────────────────────────────────────────────

  async listPlatformUsers(page = 1, limit = 50, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = { platformRole: { not: null } };
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          platformRole: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { users, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updatePlatformUser(
    userId: string,
    data: { platformRole?: PlatformRole | null; status?: string },
    actorId: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User '${userId}' not found.`);

    const before = { platformRole: user.platformRole, status: user.status };
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: data as any,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        platformRole: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await this.audit(actorId, 'PLATFORM_USER_UPDATED', undefined, {
      targetUserId: userId,
      before,
      after: data,
    });

    return updated;
  }
}

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingPlan } from '@prisma/client';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';

@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Plan catalogue ─────────────────────────────────────────────────────────

  /** Return all plan config rows, ordered by plan tier. */
  async listPlans() {
    const ORDER: BillingPlan[] = [
      BillingPlan.FREE,
      BillingPlan.STARTER,
      BillingPlan.GROWTH,
      BillingPlan.ENTERPRISE,
    ];
    const plans = await this.prisma.plan.findMany();
    return plans.sort(
      (a, b) => ORDER.indexOf(a.planType) - ORDER.indexOf(b.planType),
    );
  }

  /** Return a single plan config row by planType. */
  async getPlan(planType: BillingPlan) {
    const plan = await this.prisma.plan.findUnique({ where: { planType } });
    if (!plan) throw new NotFoundException(`Plan '${planType}' not found.`);
    return plan;
  }

  /** Create a new plan config row. Fails if planType already exists. */
  async createPlan(dto: CreatePlanDto) {
    const existing = await this.prisma.plan.findUnique({
      where: { planType: dto.planType },
    });
    if (existing) {
      throw new ConflictException(
        `A plan config for '${dto.planType}' already exists. Use PATCH to update it.`,
      );
    }
    // Only one plan can be the default
    if (dto.isDefault) {
      await this.prisma.plan.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }
    return this.prisma.plan.create({ data: dto as any });
  }

  /** Update an existing plan config row. */
  async updatePlan(planType: BillingPlan, dto: UpdatePlanDto) {
    await this.getPlan(planType); // throws 404 if missing
    // Only one plan can be the default
    if (dto.isDefault === true) {
      await this.prisma.plan.updateMany({
        where: { isDefault: true, planType: { not: planType } },
        data: { isDefault: false },
      });
    }
    return this.prisma.plan.update({
      where: { planType },
      data: dto as any,
    });
  }

  /**
   * Safe delete: marks the plan as inactive rather than hard-deleting it.
   * Hard delete is blocked if any workspace is currently on this plan.
   */
  async deletePlan(planType: BillingPlan) {
    await this.getPlan(planType);
    const inUse = await this.prisma.workspace.count({
      where: { billingPlan: planType },
    });
    if (inUse > 0) {
      // Soft-delete: deactivate so no new signups can choose it
      return this.prisma.plan.update({
        where: { planType },
        data: { isActive: false },
      });
    }
    return this.prisma.plan.delete({ where: { planType } });
  }

  /**
   * Convenience endpoint: update only the trial duration for a given plan.
   * Validates that trials only apply to STARTER and GROWTH.
   */
  async updateTrialDuration(planType: BillingPlan, trialDays: number) {
    if (trialDays < 0) {
      throw new BadRequestException('trialDays must be >= 0.');
    }
    if (
      trialDays > 0 &&
      planType !== BillingPlan.STARTER &&
      planType !== BillingPlan.GROWTH
    ) {
      throw new BadRequestException(
        'Trials are only supported for STARTER and GROWTH plans.',
      );
    }
    await this.getPlan(planType);
    return this.prisma.plan.update({
      where: { planType },
      data: { trialDays },
    });
  }

  // ── Workspace overview (super-admin read) ──────────────────────────────────

  /** Return a paginated list of all workspaces with their billing state. */
  async listWorkspaces(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.workspace.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          billingPlan: true,
          billingStatus: true,
          planStatus: true,
          trialStatus: true,
          trialEndsAt: true,
          seatLimit: true,
          aiUsageLimit: true,
          createdAt: true,
        },
      }),
      this.prisma.workspace.count(),
    ]);
    return { data, total, page, limit };
  }
}

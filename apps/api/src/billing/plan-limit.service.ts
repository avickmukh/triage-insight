import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingPlan, WorkspaceRole } from '@prisma/client';

/**
 * PlanLimitService
 *
 * Provides reusable helpers for enforcing plan-based limits.
 * Imported by WorkspaceService, FeedbackService, VoiceService, etc.
 *
 * Convention for INT limits:
 *   null  = unlimited (aiUsageLimit, feedbackLimit, seatLimit on BUSINESS)
 *   -1    = unlimited (voiceUploadLimit, surveyResponseLimit on BUSINESS)
 *   0     = feature disabled
 *   N > 0 = hard cap per month
 */
@Injectable()
export class PlanLimitService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Internal helpers ───────────────────────────────────────────────────────

  /** Resolve the Plan config row for the workspace's current billing plan. */
  private async getPlanConfig(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { billingPlan: true },
    });
    if (!workspace) return null;
    return this.prisma.plan.findUnique({
      where: { planType: workspace.billingPlan },
    });
  }

  /** Returns true if a limit value means "unlimited" (-1 or null). */
  private isUnlimited(limit: number | null): boolean {
    return limit === null || limit === -1;
  }

  // ── Seat / Admin limit ─────────────────────────────────────────────────────

  /**
   * Throws ForbiddenException if adding one more member would exceed the
   * workspace's seatLimit or adminLimit (for ADMIN-role invites).
   */
  async assertCanAddMember(
    workspaceId: string,
    newRole: WorkspaceRole,
  ): Promise<void> {
    const plan = await this.getPlanConfig(workspaceId);
    if (!plan) return; // no plan config = no enforcement

    // Count current active members
    const currentTotal = await this.prisma.workspaceMember.count({
      where: { workspaceId },
    });

    // Check total seat limit
    if (!this.isUnlimited(plan.seatLimit) && currentTotal >= (plan.seatLimit as number)) {
      throw new ForbiddenException(
        `Your ${plan.displayName} plan allows up to ${plan.seatLimit} staff seats. ` +
          `Please upgrade to add more members.`,
      );
    }

    // Check admin limit for ADMIN-role invites
    if (newRole === WorkspaceRole.ADMIN) {
      const adminLimit = plan.adminLimit;
      if (!this.isUnlimited(adminLimit) && adminLimit !== null) {
        const currentAdmins = await this.prisma.workspaceMember.count({
          where: { workspaceId, role: WorkspaceRole.ADMIN },
        });
        if (currentAdmins >= adminLimit) {
          throw new ForbiddenException(
            `Your ${plan.displayName} plan allows up to ${adminLimit} admin${adminLimit === 1 ? '' : 's'}. ` +
              `Please upgrade to add more admins.`,
          );
        }
      }
    }
  }

  // ── Feedback limit ─────────────────────────────────────────────────────────

  /**
   * Throws ForbiddenException if the workspace has reached its monthly
   * feedback item limit.  Counts items created in the current calendar month.
   */
  async assertCanAddFeedback(workspaceId: string): Promise<void> {
    const plan = await this.getPlanConfig(workspaceId);
    if (!plan) return;
    if (this.isUnlimited(plan.feedbackLimit)) return;

    const limit = plan.feedbackLimit as number;
    if (limit === 0) {
      throw new ForbiddenException(
        `Your ${plan.displayName} plan does not allow feedback ingestion.`,
      );
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const count = await this.prisma.feedback.count({
      where: {
        workspaceId,
        createdAt: { gte: startOfMonth },
      },
    });

    if (count >= limit) {
      throw new ForbiddenException(
        `Your ${plan.displayName} plan allows up to ${limit.toLocaleString()} feedback items per month. ` +
          `You have reached this limit. Please upgrade to continue.`,
      );
    }
  }

  // ── Voice upload limit ─────────────────────────────────────────────────────

  /**
   * Throws ForbiddenException if the workspace has reached its monthly
   * voice upload limit.
   */
  async assertCanUploadVoice(workspaceId: string): Promise<void> {
    const plan = await this.getPlanConfig(workspaceId);
    if (!plan) return;

    if (!plan.voiceFeedback) {
      throw new ForbiddenException(
        `Voice feedback is not available on the ${plan.displayName} plan. Please upgrade to PRO or BUSINESS.`,
      );
    }

    if (this.isUnlimited(plan.voiceUploadLimit)) return;

    const limit = plan.voiceUploadLimit;
    if (limit === 0) {
      throw new ForbiddenException(
        `Voice feedback is not available on the ${plan.displayName} plan.`,
      );
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Count voice feedback items this month
    const count = await this.prisma.feedback.count({
      where: {
        workspaceId,
        sourceType: 'VOICE',
        createdAt: { gte: startOfMonth },
      },
    });

    if (count >= limit) {
      throw new ForbiddenException(
        `Your ${plan.displayName} plan allows up to ${limit} voice uploads per month. ` +
          `You have reached this limit. Upgrade to BUSINESS for unlimited voice feedback.`,
      );
    }
  }

  // ── Survey response limit ──────────────────────────────────────────────────

  /**
   * Throws ForbiddenException if the workspace has reached its monthly
   * survey response limit.
   */
  async assertCanAddSurveyResponse(workspaceId: string): Promise<void> {
    const plan = await this.getPlanConfig(workspaceId);
    if (!plan) return;

    if (!plan.survey) {
      throw new ForbiddenException(
        `Surveys are not available on the ${plan.displayName} plan. Please upgrade to PRO or BUSINESS.`,
      );
    }

    if (this.isUnlimited(plan.surveyResponseLimit)) return;

    const limit = plan.surveyResponseLimit;
    if (limit === 0) {
      throw new ForbiddenException(
        `Surveys are not available on the ${plan.displayName} plan.`,
      );
    }

    // Note: survey response counting would use a SurveyResponse model.
    // For now we return without counting since the Survey module is a stub.
    // When the Survey module is built, add the count query here.
  }

  // ── Feature flag checks ────────────────────────────────────────────────────

  /**
   * Throws ForbiddenException if a boolean feature flag is disabled for the plan.
   * Usage: await planLimitService.assertFeatureEnabled(workspaceId, 'weeklyDigest');
   */
  async assertFeatureEnabled(
    workspaceId: string,
    feature: keyof {
      aiInsights: boolean;
      aiThemeClustering: boolean;
      ciqPrioritization: boolean;
      explainableAi: boolean;
      weeklyDigest: boolean;
      voiceFeedback: boolean;
      survey: boolean;
      integrations: boolean;
      publicPortal: boolean;
      csvImport: boolean;
      apiAccess: boolean;
      executiveReporting: boolean;
    },
  ): Promise<void> {
    const plan = await this.getPlanConfig(workspaceId);
    if (!plan) return;
    if (!plan[feature]) {
      throw new ForbiddenException(
        `The "${feature}" feature is not available on the ${plan.displayName} plan. Please upgrade.`,
      );
    }
  }

  // ── Limit summary (for frontend display) ──────────────────────────────────

  /**
   * Returns a summary of current usage vs limits for the workspace.
   * Used by GET /workspace/current/limits.
   */
  async getLimitSummary(workspaceId: string) {
    const plan = await this.getPlanConfig(workspaceId);
    if (!plan) return null;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [totalMembers, adminCount, feedbackThisMonth, voiceThisMonth] =
      await Promise.all([
        this.prisma.workspaceMember.count({ where: { workspaceId } }),
        this.prisma.workspaceMember.count({
          where: { workspaceId, role: WorkspaceRole.ADMIN },
        }),
        this.prisma.feedback.count({
          where: { workspaceId, createdAt: { gte: startOfMonth } },
        }),
        this.prisma.feedback.count({
          where: { workspaceId, sourceType: 'VOICE', createdAt: { gte: startOfMonth } },
        }),
      ]);

    const fmt = (used: number, limit: number | null) => ({
      used,
      limit: this.isUnlimited(limit) ? null : limit,
      unlimited: this.isUnlimited(limit),
    });

    return {
      seats: fmt(totalMembers, plan.seatLimit),
      admins: fmt(adminCount, plan.adminLimit),
      feedbackThisMonth: fmt(feedbackThisMonth, plan.feedbackLimit),
      voiceThisMonth: fmt(voiceThisMonth, plan.voiceUploadLimit),
      // survey responses — stub until Survey module is built
      surveyResponsesThisMonth: {
        used: 0,
        limit: this.isUnlimited(plan.surveyResponseLimit) ? null : plan.surveyResponseLimit,
        unlimited: this.isUnlimited(plan.surveyResponseLimit),
      },
      plan: {
        planType: plan.planType as BillingPlan,
        displayName: plan.displayName,
        priceMonthly: plan.priceMonthly,
      },
    };
  }
}

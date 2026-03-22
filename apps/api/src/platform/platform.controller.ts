import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { PlatformService } from './platform.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  PlatformRoleGuard,
  PlatformRoles,
} from '../auth/guards/platform-role.guard';
import { PlatformRole, BillingPlan } from '@prisma/client';

/**
 * PlatformController
 *
 * All routes are guarded by JwtAuthGuard + PlatformRoleGuard(SUPER_ADMIN).
 * No workspace-scoped guard is needed — these are global platform operations.
 *
 * Route summary:
 *   GET    /platform/plans                  — list all plan configs
 *   GET    /platform/plans/:planType        — get single plan config
 *   POST   /platform/plans                  — create plan config
 *   PATCH  /platform/plans/:planType        — update plan config
 *   DELETE /platform/plans/:planType        — safe-delete plan config
 *   PATCH  /platform/plans/:planType/trial  — update trial duration only
 *   GET    /platform/workspaces             — paginated workspace billing overview
 */
@Controller('platform')
@UseGuards(JwtAuthGuard, PlatformRoleGuard)
@PlatformRoles(PlatformRole.SUPER_ADMIN)
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  // ── Plan catalogue ─────────────────────────────────────────────────────────

  @Get('plans')
  listPlans() {
    return this.platformService.listPlans();
  }

  @Get('plans/:planType')
  getPlan(@Param('planType') planType: BillingPlan) {
    return this.platformService.getPlan(planType);
  }

  @Post('plans')
  createPlan(@Body() dto: CreatePlanDto) {
    return this.platformService.createPlan(dto);
  }

  @Patch('plans/:planType')
  updatePlan(
    @Param('planType') planType: BillingPlan,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.platformService.updatePlan(planType, dto);
  }

  @Delete('plans/:planType')
  deletePlan(@Param('planType') planType: BillingPlan) {
    return this.platformService.deletePlan(planType);
  }

  /**
   * PATCH /platform/plans/:planType/trial
   *
   * Convenience endpoint for super admins to adjust trial duration without
   * having to send the full plan update payload.
   */
  @Patch('plans/:planType/trial')
  updateTrialDuration(
    @Param('planType') planType: BillingPlan,
    @Body('trialDays', ParseIntPipe) trialDays: number,
  ) {
    return this.platformService.updateTrialDuration(planType, trialDays);
  }

  // ── Workspace overview ─────────────────────────────────────────────────────

  @Get('workspaces')
  listWorkspaces(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.platformService.listWorkspaces(page, limit);
  }
}

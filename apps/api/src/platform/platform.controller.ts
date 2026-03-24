import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PlatformService } from './platform.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import {
  UpdateWorkspaceStatusDto,
  OverrideBillingPlanDto,
  ExtendTrialDto,
  SetFeatureOverrideDto,
  ListWorkspacesQueryDto,
} from './dto/platform.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  PlatformRoleGuard,
  PlatformRoles,
} from '../auth/guards/platform-role.guard';
import { PlatformRole, BillingPlan } from '@prisma/client';

@Controller('platform')
@UseGuards(JwtAuthGuard, PlatformRoleGuard)
@PlatformRoles(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('plans') listPlans() { return this.platformService.listPlans(); }
  @Get('plans/:planType') getPlan(@Param('planType') p: BillingPlan) { return this.platformService.getPlan(p); }
  @Post('plans') createPlan(@Body() dto: CreatePlanDto) { return this.platformService.createPlan(dto); }
  @Patch('plans/:planType') updatePlan(@Param('planType') p: BillingPlan, @Body() dto: UpdatePlanDto) { return this.platformService.updatePlan(p, dto); }
  @Delete('plans/:planType') deletePlan(@Param('planType') p: BillingPlan) { return this.platformService.deletePlan(p); }
  @Patch('plans/:planType/trial') updateTrialDuration(@Param('planType') p: BillingPlan, @Body('trialDays', ParseIntPipe) d: number) { return this.platformService.updateTrialDuration(p, d); }

  @Get('workspaces') listWorkspaces(@Query() q: ListWorkspacesQueryDto) { return this.platformService.listWorkspaces(q); }
  @Get('workspaces/:id') getWorkspaceDetail(@Param('id') id: string) { return this.platformService.getWorkspaceDetail(id); }
  @Patch('workspaces/:id/status') updateWorkspaceStatus(@Param('id') id: string, @Body() dto: UpdateWorkspaceStatusDto, @Req() req: any) { return this.platformService.updateWorkspaceStatus(id, dto, req.user.sub); }
  @Delete('workspaces/:id') deleteWorkspace(@Param('id') id: string, @Req() req: any) { return this.platformService.deleteWorkspace(id, req.user.sub); }

  @Get('billing/health') getBillingHealth() { return this.platformService.getBillingHealth(); }
  @Get('billing/subscriptions') listAllSubscriptions(@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number, @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number) { return this.platformService.listAllSubscriptions(page, limit); }
  @Post('billing/workspaces/:id/override-plan') overrideBillingPlan(@Param('id') id: string, @Body() dto: OverrideBillingPlanDto, @Req() req: any) { return this.platformService.overrideBillingPlan(id, dto, req.user.sub); }
  @Post('billing/workspaces/:id/extend-trial') extendTrial(@Param('id') id: string, @Body() dto: ExtendTrialDto, @Req() req: any) { return this.platformService.extendTrial(id, dto, req.user.sub); }
  @Post('billing/workspaces/:id/cancel') @HttpCode(HttpStatus.OK) cancelSubscription(@Param('id') id: string, @Req() req: any) { return this.platformService.cancelSubscription(id, req.user.sub); }
  @Post('billing/workspaces/:id/reactivate') @HttpCode(HttpStatus.OK) reactivateSubscription(@Param('id') id: string, @Req() req: any) { return this.platformService.reactivateSubscription(id, req.user.sub); }

  @Get('workspaces/:id/feature-overrides') listFeatureOverrides(@Param('id') id: string) { return this.platformService.listFeatureOverrides(id); }
  @Post('workspaces/:id/feature-overrides') setFeatureOverride(@Param('id') id: string, @Body() dto: SetFeatureOverrideDto, @Req() req: any) { return this.platformService.setFeatureOverride(id, dto, req.user.sub); }
  @Delete('workspaces/:id/feature-overrides/:feature') deleteFeatureOverride(@Param('id') id: string, @Param('feature') feature: string, @Req() req: any) { return this.platformService.deleteFeatureOverride(id, feature, req.user.sub); }

  @Get('health') getSystemHealth() { return this.platformService.getSystemHealth(); }
  @Get('audit-log') listPlatformAuditLogs(@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number, @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number, @Query('workspaceId') workspaceId?: string) { return this.platformService.listPlatformAuditLogs(page, limit, workspaceId); }

  // Platform users management
  @Get('users') listPlatformUsers(@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number, @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number, @Query('search') search?: string) { return this.platformService.listPlatformUsers(page, limit, search); }
  @Patch('users/:id') @PlatformRoles(PlatformRole.SUPER_ADMIN) updatePlatformUser(@Param('id') id: string, @Body() body: { platformRole?: PlatformRole | null; status?: string }, @Req() req: any) { return this.platformService.updatePlatformUser(id, body, req.user.sub); }
}

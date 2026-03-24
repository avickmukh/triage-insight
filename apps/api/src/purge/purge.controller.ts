import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PurgeService } from './purge.service';
import { RequestWorkspaceDeletionDto, ApproveWorkspaceDeletionDto } from './dto/purge.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../workspace/guards/roles.guard';
import { Roles } from '../workspace/decorators/roles.decorator';
import { PlatformRoleGuard, PlatformRoles } from '../auth/guards/platform-role.guard';
import { WorkspaceRole, PlatformRole } from '@prisma/client';

// ─── Workspace-Admin Endpoints ───────────────────────────────────────────────
// Mounted under /workspaces/:workspaceId/purge
// Only workspace ADMIN role can request deletion of their own workspace.

@Controller('workspaces/:workspaceId/purge')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(WorkspaceRole.ADMIN)
export class PurgeWorkspaceController {
  constructor(private readonly purgeService: PurgeService) {}

  /**
   * POST /workspaces/:workspaceId/purge/request
   * Workspace admin requests deletion of their workspace.
   * Creates a WorkspaceDeletionRequest in REQUESTED status.
   * A platform SUPER_ADMIN must approve before execution begins.
   */
  @Post('request')
  async requestDeletion(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: RequestWorkspaceDeletionDto,
    @Req() req: any,
  ) {
    return this.purgeService.requestDeletion(workspaceId, req.user.sub, dto);
  }

  /**
   * DELETE /workspaces/:workspaceId/purge/request/:requestId
   * Workspace admin cancels a pending deletion request.
   */
  @Delete('request/:requestId')
  @HttpCode(HttpStatus.OK)
  async cancelDeletion(
    @Param('requestId') requestId: string,
    @Req() req: any,
  ) {
    return this.purgeService.cancelDeletion(requestId, req.user.sub);
  }

  /**
   * GET /workspaces/:workspaceId/purge/request
   * List all deletion requests for this workspace.
   */
  @Get('request')
  async listRequests(@Param('workspaceId') workspaceId: string) {
    return this.purgeService.listDeletionRequests(workspaceId);
  }

  /**
   * GET /workspaces/:workspaceId/purge/request/:requestId
   * Get a specific deletion request with its audit log.
   */
  @Get('request/:requestId')
  async getRequest(@Param('requestId') requestId: string) {
    return this.purgeService.getDeletionRequest(requestId);
  }
}

// ─── Platform-Admin Endpoints ────────────────────────────────────────────────
// Mounted under /platform/purge
// Only platform SUPER_ADMIN can approve and execute purges.

@Controller('platform/purge')
@UseGuards(JwtAuthGuard, PlatformRoleGuard)
@PlatformRoles(PlatformRole.SUPER_ADMIN)
export class PurgePlatformController {
  constructor(private readonly purgeService: PurgeService) {}

  /**
   * GET /platform/purge/requests
   * List all deletion requests across all workspaces.
   */
  @Get('requests')
  async listAllRequests() {
    return this.purgeService.listDeletionRequests();
  }

  /**
   * GET /platform/purge/requests/:requestId
   * Get a specific deletion request with full audit log.
   */
  @Get('requests/:requestId')
  async getRequest(@Param('requestId') requestId: string) {
    return this.purgeService.getDeletionRequest(requestId);
  }

  /**
   * PATCH /platform/purge/requests/:requestId/approve
   * Platform SUPER_ADMIN approves a deletion request.
   * Four-eyes: approver must be different from requester.
   */
  @Patch('requests/:requestId/approve')
  async approveDeletion(
    @Param('requestId') requestId: string,
    @Body() dto: ApproveWorkspaceDeletionDto,
    @Req() req: any,
  ) {
    return this.purgeService.approveDeletion(requestId, req.user.sub, dto);
  }

  /**
   * POST /platform/purge/requests/:requestId/execute
   * Platform SUPER_ADMIN triggers immediate execution of an approved purge.
   * Freezes the workspace and enqueues the purge job.
   */
  @Post('requests/:requestId/execute')
  @HttpCode(HttpStatus.OK)
  async executePurge(@Param('requestId') requestId: string) {
    return this.purgeService.schedulePurge(requestId);
  }

  /**
   * DELETE /platform/purge/requests/:requestId
   * Platform SUPER_ADMIN cancels a pending or approved deletion request.
   */
  @Delete('requests/:requestId')
  @HttpCode(HttpStatus.OK)
  async cancelDeletion(
    @Param('requestId') requestId: string,
    @Req() req: any,
  ) {
    return this.purgeService.cancelDeletion(requestId, req.user.sub);
  }
}

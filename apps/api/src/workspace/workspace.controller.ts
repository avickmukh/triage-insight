import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { WorkspaceRole } from '@prisma/client';

interface AuthenticatedRequest {
  user: { sub: string; email: string };
}

/**
 * All routes in this controller require a valid JWT (JwtAuthGuard applied at
 * class level).  Mutating routes additionally require the calling user to hold
 * the ADMIN role in the resolved workspace (RolesGuard + @Roles decorator).
 *
 * The RolesGuard resolves the workspace from URL params (`:id`) when present,
 * or falls back to the user's first membership for "current" routes.
 */
@Controller('workspace')
@UseGuards(JwtAuthGuard)
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  // ── Read-only ──────────────────────────────────────────────────────────────

  /** GET /workspace/current — accessible to all authenticated members */
  @Get('current')
  getCurrentWorkspace(@Req() req: AuthenticatedRequest) {
    return this.workspaceService.getCurrentWorkspace(req.user.sub);
  }

  /**
   * GET /workspace/:id/members — accessible to ADMIN, EDITOR, and VIEWER.
   * RolesGuard resolves the workspace from the :id param.
   */
  @Get(':id/members')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getWorkspaceMembers(@Param('id') id: string) {
    return this.workspaceService.getWorkspaceMembers(id);
  }

  /**
   * GET /workspace/current/invites — ADMIN only.
   * RolesGuard resolves workspace from the calling user's membership.
   */
  @Get('current/invites')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.ADMIN)
  getPendingInvites(@Req() req: AuthenticatedRequest) {
    return this.workspaceService.getPendingInvites(req.user.sub);
  }

  // ── Mutating — ADMIN only ──────────────────────────────────────────────────

  /**
   * PATCH /workspace/current — update workspace settings.
   * Requires ADMIN role at the controller level (defence-in-depth on top of
   * the service-level check).
   */
  @Patch('current')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.ADMIN)
  updateCurrentWorkspace(
    @Req() req: AuthenticatedRequest,
    @Body() updateWorkspaceDto: UpdateWorkspaceDto,
  ) {
    return this.workspaceService.updateCurrentWorkspace(req.user.sub, updateWorkspaceDto);
  }

  /**
   * POST /workspace/current/invite — invite a new member.
   * ADMIN only at both controller and service layers.
   */
  @Post('current/invite')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.ADMIN)
  inviteMember(@Req() req: AuthenticatedRequest, @Body() dto: InviteMemberDto) {
    return this.workspaceService.inviteMember(req.user.sub, dto);
  }

  /**
   * DELETE /workspace/current/invites/:inviteId — revoke a pending invite.
   * ADMIN only.
   */
  @Delete('current/invites/:inviteId')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.ADMIN)
  revokeInvite(@Req() req: AuthenticatedRequest, @Param('inviteId') inviteId: string) {
    return this.workspaceService.revokeInvite(req.user.sub, inviteId);
  }

  /**
   * DELETE /workspace/current/members/:userId — remove a member.
   * ADMIN only.
   */
  @Delete('current/members/:userId')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.ADMIN)
  removeMember(@Req() req: AuthenticatedRequest, @Param('userId') userId: string) {
    return this.workspaceService.removeMember(req.user.sub, userId);
  }

  /**
   * PATCH /workspace/current/members/:userId/role — change a member's role.
   * ADMIN only.
   */
  @Patch('current/members/:userId/role')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.ADMIN)
  updateMemberRole(
    @Req() req: AuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.workspaceService.updateMemberRole(req.user.sub, userId, dto);
  }
}

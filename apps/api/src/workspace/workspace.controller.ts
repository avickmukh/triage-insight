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

@Controller('workspace')
@UseGuards(JwtAuthGuard)
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get('current')
  getCurrentWorkspace(@Req() req: AuthenticatedRequest) {
    return this.workspaceService.getCurrentWorkspace(req.user.sub);
  }

  @Patch('current')
  updateCurrentWorkspace(
    @Req() req: AuthenticatedRequest,
    @Body() updateWorkspaceDto: UpdateWorkspaceDto,
  ) {
    return this.workspaceService.updateCurrentWorkspace(req.user.sub, updateWorkspaceDto);
  }

  @Get(':id/members')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getWorkspaceMembers(@Param('id') id: string) {
    return this.workspaceService.getWorkspaceMembers(id);
  }

  /** Invite a new member (admin only) */
  @Post('current/invite')
  inviteMember(@Req() req: AuthenticatedRequest, @Body() dto: InviteMemberDto) {
    return this.workspaceService.inviteMember(req.user.sub, dto);
  }

  /** List pending invites (admin only) */
  @Get('current/invites')
  getPendingInvites(@Req() req: AuthenticatedRequest) {
    return this.workspaceService.getPendingInvites(req.user.sub);
  }

  /** Revoke a pending invite (admin only) */
  @Delete('current/invites/:inviteId')
  revokeInvite(@Req() req: AuthenticatedRequest, @Param('inviteId') inviteId: string) {
    return this.workspaceService.revokeInvite(req.user.sub, inviteId);
  }

  /** Remove a member from the workspace (admin only) */
  @Delete('current/members/:userId')
  removeMember(@Req() req: AuthenticatedRequest, @Param('userId') userId: string) {
    return this.workspaceService.removeMember(req.user.sub, userId);
  }

  /** Change a member's role (admin only) */
  @Patch('current/members/:userId/role')
  updateMemberRole(
    @Req() req: AuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.workspaceService.updateMemberRole(req.user.sub, userId, dto);
  }
}

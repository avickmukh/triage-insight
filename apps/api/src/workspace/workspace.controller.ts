import { Controller, Get, Patch, Body, UseGuards, Req, Param } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
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
    return this.workspaceService.updateCurrentWorkspace(
      req.user.sub,
      updateWorkspaceDto,
    );
  }

  @Get(':id/members')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getWorkspaceMembers(@Param('id') id: string) {
    return this.workspaceService.getWorkspaceMembers(id);
  }
}

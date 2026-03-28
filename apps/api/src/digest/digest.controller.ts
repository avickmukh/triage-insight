import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../workspace/guards/roles.guard';
import { Roles } from '../workspace/decorators/roles.decorator';
import { WorkspaceRole } from '@prisma/client';
import { DigestService } from './digest.service';

@Controller('workspaces/:workspaceId/digest')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DigestController {
  constructor(private readonly digestService: DigestService) {}

  /**
   * Manually trigger digest generation for a workspace.
   * Restricted to ADMIN only — the scheduler handles automatic runs.
   */
  @Post('generate')
  @Roles(WorkspaceRole.ADMIN)
  async generateDigest(@Param('workspaceId') workspaceId: string) {
    return this.digestService.generateDigest(workspaceId);
  }

  /**
   * Returns the most recently generated digest for a workspace.
   * Returns null (HTTP 200) if no digest has been generated yet.
   * Accessible to all workspace members (VIEWER+).
   */
  @Get('latest')
  @Roles(WorkspaceRole.VIEWER, WorkspaceRole.EDITOR, WorkspaceRole.ADMIN)
  async getLatest(@Param('workspaceId') workspaceId: string) {
    return this.digestService.getLatest(workspaceId);
  }

  /**
   * Returns the last N digest runs for a workspace (newest first).
   * Accepts an optional `limit` query param (default: 10, max: 50).
   * Accessible to all workspace members (VIEWER+).
   */
  @Get('history')
  @Roles(WorkspaceRole.VIEWER, WorkspaceRole.EDITOR, WorkspaceRole.ADMIN)
  async getHistory(
    @Param('workspaceId') workspaceId: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = Math.min(parseInt(limit ?? '10', 10) || 10, 50);
    return this.digestService.getHistory(workspaceId, parsedLimit);
  }
}

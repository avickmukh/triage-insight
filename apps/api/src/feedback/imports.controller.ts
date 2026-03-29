import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../workspace/guards/roles.guard';
import { Roles } from '../workspace/decorators/roles.decorator';
import { WorkspaceRole } from '@prisma/client';
import { ImportBatchService } from './ingestion/import-batch.service';

/**
 * ImportsController
 *
 * Provides batch-scoped pipeline status so the frontend can track
 * progress for a specific CSV upload rather than workspace-wide history.
 *
 * Route: GET /workspaces/:workspaceId/imports/:batchId/status
 */
@Controller('workspaces/:workspaceId/imports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ImportsController {
  constructor(private readonly importBatchService: ImportBatchService) {}

  /**
   * GET /workspaces/:workspaceId/imports/:batchId/status
   *
   * Returns:
   *   { batchId, stage, isRunning, total, completed, failed, pending, pct }
   *
   * - total = number of feedback rows in this batch (e.g. 50, NOT 2307)
   * - completed = rows whose FEEDBACK_SUMMARY AiJobLog is COMPLETED
   * - isDone = pending === 0 AND BullMQ queue is drained
   */
  @Get(':batchId/status')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getBatchStatus(
    @Param('workspaceId') workspaceId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.importBatchService.getBatchStatus(batchId, workspaceId);
  }
}

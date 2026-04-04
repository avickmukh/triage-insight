import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import {
  WorkspaceDeletionStatus,
  WorkspaceStatus,
  PurgeStepStatus,
} from '@prisma/client';
import {
  RequestWorkspaceDeletionDto,
  ApproveWorkspaceDeletionDto,
} from './dto/purge.dto';

export const PURGE_QUEUE = 'workspace-purge';

/** Job name for the BullMQ purge worker */
export const PURGE_JOB_NAME = 'execute-workspace-purge';

export interface PurgeJobPayload {
  deletionRequestId: string;
  workspaceId: string;
}

@Injectable()
export class PurgeService {
  private readonly logger = new Logger(PurgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(PURGE_QUEUE) private readonly purgeQueue: Queue,
  ) {}

  // ─── Request ────────────────────────────────────────────────────────────────

  /**
   * Workspace ADMIN requests deletion of their own workspace.
   * Creates a WorkspaceDeletionRequest in REQUESTED status.
   * A platform SUPER_ADMIN must approve before execution begins.
   */
  async requestDeletion(
    workspaceId: string,
    requestedByUserId: string,
    dto: RequestWorkspaceDeletionDto,
  ) {
    // Block if an active request already exists
    const existing = await this.prisma.workspaceDeletionRequest.findFirst({
      where: {
        workspaceId,
        status: {
          notIn: [
            WorkspaceDeletionStatus.COMPLETED,
            WorkspaceDeletionStatus.CANCELLED,
          ],
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `A deletion request already exists for this workspace (status: ${existing.status}).`,
      );
    }

    const request = await this.prisma.workspaceDeletionRequest.create({
      data: {
        workspaceId,
        requestedByUserId,
        reason: dto.reason,
        includeExportBeforeDelete: dto.includeExportBeforeDelete ?? false,
        scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : null,
        status: WorkspaceDeletionStatus.REQUESTED,
      },
    });

    this.logger.log(
      `[Purge] Deletion requested for workspace ${workspaceId} by user ${requestedByUserId} (request: ${request.id})`,
    );

    return request;
  }

  // ─── Approve ────────────────────────────────────────────────────────────────

  /**
   * Platform SUPER_ADMIN approves a deletion request.
   * Four-eyes: the approver must not be the same person who requested.
   * Transitions status: REQUESTED → APPROVED.
   */
  async approveDeletion(
    deletionRequestId: string,
    approvedByUserId: string,
    dto: ApproveWorkspaceDeletionDto,
  ) {
    const request = await this.prisma.workspaceDeletionRequest.findUnique({
      where: { id: deletionRequestId },
    });
    if (!request) {
      throw new NotFoundException('Deletion request not found');
    }
    if (request.status !== WorkspaceDeletionStatus.REQUESTED) {
      throw new ConflictException(
        `Cannot approve a request in status: ${request.status}`,
      );
    }
    // Four-eyes principle
    if (request.requestedByUserId === approvedByUserId) {
      throw new ForbiddenException(
        'The approver must be a different user from the requester.',
      );
    }

    const updated = await this.prisma.workspaceDeletionRequest.update({
      where: { id: deletionRequestId },
      data: {
        status: WorkspaceDeletionStatus.APPROVED,
        approvedByUserId,
        approvedAt: new Date(),
        scheduledFor: dto.scheduledFor
          ? new Date(dto.scheduledFor)
          : request.scheduledFor,
      },
    });

    this.logger.log(
      `[Purge] Deletion approved for workspace ${request.workspaceId} by user ${approvedByUserId}`,
    );

    return updated;
  }

  // ─── Cancel ─────────────────────────────────────────────────────────────────

  /**
   * Cancel a deletion request that has not yet started execution.
   * Can be called by the requester or a platform admin.
   */
  async cancelDeletion(deletionRequestId: string, cancelledByUserId: string) {
    const request = await this.prisma.workspaceDeletionRequest.findUnique({
      where: { id: deletionRequestId },
    });
    if (!request) {
      throw new NotFoundException('Deletion request not found');
    }
    const cancellable: WorkspaceDeletionStatus[] = [
      WorkspaceDeletionStatus.REQUESTED,
      WorkspaceDeletionStatus.APPROVED,
      WorkspaceDeletionStatus.SCHEDULED,
    ];
    if (!cancellable.includes(request.status)) {
      throw new ConflictException(
        `Cannot cancel a request in status: ${request.status}`,
      );
    }

    // If the workspace was frozen, unfreeze it
    await this.prisma.workspace.update({
      where: { id: request.workspaceId },
      data: { status: WorkspaceStatus.ACTIVE },
    });

    const updated = await this.prisma.workspaceDeletionRequest.update({
      where: { id: deletionRequestId },
      data: {
        status: WorkspaceDeletionStatus.CANCELLED,
        failureReason: `Cancelled by user ${cancelledByUserId}`,
      },
    });

    this.logger.log(
      `[Purge] Deletion cancelled for workspace ${request.workspaceId} by user ${cancelledByUserId}`,
    );

    return updated;
  }

  // ─── Schedule / Execute ─────────────────────────────────────────────────────

  /**
   * Freeze the workspace and enqueue the purge job.
   * Called by the platform admin or by a scheduled trigger.
   * Transitions status: APPROVED → SCHEDULED → IN_PROGRESS (inside worker).
   */
  async schedulePurge(deletionRequestId: string) {
    const request = await this.prisma.workspaceDeletionRequest.findUnique({
      where: { id: deletionRequestId },
    });
    if (!request) {
      throw new NotFoundException('Deletion request not found');
    }
    if (request.status !== WorkspaceDeletionStatus.APPROVED) {
      throw new ConflictException(
        `Cannot schedule a request in status: ${request.status}`,
      );
    }

    // Step 1: Freeze the workspace — blocks all mutations immediately
    await this.prisma.workspace.update({
      where: { id: request.workspaceId },
      data: { status: WorkspaceStatus.FROZEN },
    });

    // Step 2: Mark as SCHEDULED
    await this.prisma.workspaceDeletionRequest.update({
      where: { id: deletionRequestId },
      data: { status: WorkspaceDeletionStatus.SCHEDULED },
    });

    // Step 3: Enqueue the purge job
    const payload: PurgeJobPayload = {
      deletionRequestId,
      workspaceId: request.workspaceId,
    };
    await this.purgeQueue.add(PURGE_JOB_NAME, payload, {
      attempts: 1, // purge worker handles its own retry logic per step
      removeOnComplete: false,
      removeOnFail: false,
    });

    this.logger.log(
      `[Purge] Purge job enqueued for workspace ${request.workspaceId} (request: ${deletionRequestId})`,
    );

    return { scheduled: true, deletionRequestId };
  }

  // ─── Audit log helpers ──────────────────────────────────────────────────────

  async logStep(
    deletionRequestId: string,
    workspaceId: string,
    stepName: string,
    status: PurgeStepStatus,
    details?: Record<string, unknown>,
    errorMessage?: string,
  ) {
    await this.prisma.workspaceDeletionAuditLog.create({
      data: {
        deletionRequestId,
        workspaceId,
        stepName,
        status,
        detailsJson: (details ?? {}) as object,
        errorMessage,
        completedAt: new Date(),
      },
    });
  }

  // ─── Read ────────────────────────────────────────────────────────────────────

  async getDeletionRequest(deletionRequestId: string) {
    const request = await this.prisma.workspaceDeletionRequest.findUnique({
      where: { id: deletionRequestId },
      include: { auditLogs: { orderBy: { startedAt: 'asc' } } },
    });
    if (!request) {
      throw new NotFoundException('Deletion request not found');
    }
    return request;
  }

  async listDeletionRequests(workspaceId?: string) {
    return this.prisma.workspaceDeletionRequest.findMany({
      where: workspaceId ? { workspaceId } : undefined,
      orderBy: { requestedAt: 'desc' },
      include: { auditLogs: { orderBy: { startedAt: 'asc' } } },
    });
  }
}

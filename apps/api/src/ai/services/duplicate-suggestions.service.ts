import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from './audit.service';
import { MergeService } from './merge.service';
import {
  DuplicateSuggestionStatus,
  FeedbackStatus,
  AuditLogAction,
} from '@prisma/client';

/**
 * DuplicateSuggestionsService
 *
 * Handles the accept/reject workflow for FeedbackDuplicateSuggestion rows.
 * All operations are workspace-scoped; cross-workspace access raises 403.
 */
@Injectable()
export class DuplicateSuggestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly mergeService: MergeService,
  ) {}

  // ─── List ──────────────────────────────────────────────────────────────────

  /**
   * List all PENDING duplicate suggestions for a workspace.
   * Optionally filter by status.
   */
  async listForWorkspace(
    workspaceId: string,
    status?: DuplicateSuggestionStatus,
  ) {
    const rows = await this.prisma.feedbackDuplicateSuggestion.findMany({
      where: {
        sourceFeedback: { workspaceId },
        ...(status ? { status } : { status: DuplicateSuggestionStatus.PENDING }),
        // Only surface actionable match classes — never RELATED_SAME_THEME
        matchType: { in: ['EXACT_DUPLICATE', 'NEAR_DUPLICATE'] },
      },
      include: {
        sourceFeedback: {
          select: { id: true, title: true, status: true, sourceType: true },
        },
        targetFeedback: {
          select: { id: true, title: true, status: true, sourceType: true },
        },
      },
      // Order by hybridScore (most confident first), fall back to similarity, then recency
      orderBy: [{ hybridScore: 'desc' }, { similarity: 'desc' }, { createdAt: 'desc' }],
    });
    // Map Prisma field names (sourceId/targetId) to the frontend API contract
    // (sourceFeedbackId/targetFeedbackId) while keeping the originals as aliases.
    return rows.map(this._normaliseRow);
  }

  /**
   * List duplicate suggestions for a specific feedback item (as source or target).
   * Workspace-scoped: verifies the feedback belongs to the workspace.
   */
  async listForFeedback(
    workspaceId: string,
    feedbackId: string,
    status?: DuplicateSuggestionStatus,
  ) {
    // Verify the feedback belongs to this workspace
    await this._requireFeedbackInWorkspace(workspaceId, feedbackId);

    const rows = await this.prisma.feedbackDuplicateSuggestion.findMany({
      where: {
        OR: [{ sourceId: feedbackId }, { targetId: feedbackId }],
        ...(status ? { status } : { status: DuplicateSuggestionStatus.PENDING }),
        // Only surface actionable match classes — never RELATED_SAME_THEME
        matchType: { in: ['EXACT_DUPLICATE', 'NEAR_DUPLICATE'] },
      },
      include: {
        sourceFeedback: {
          select: { id: true, title: true, status: true, sourceType: true },
        },
        targetFeedback: {
          select: { id: true, title: true, status: true, sourceType: true },
        },
      },
      // Order by hybridScore (most confident first), fall back to similarity
      orderBy: [{ hybridScore: 'desc' }, { similarity: 'desc' }],
    });
    return rows.map(this._normaliseRow);
  }

  // ─── Accept ────────────────────────────────────────────────────────────────

  /**
   * Accept a duplicate suggestion.
   *
   * Side-effects:
   *   1. Marks the suggestion ACCEPTED.
   *   2. Calls MergeService to set sourceId → MERGED, mergedIntoId = targetId.
   *   3. Writes a DUPLICATE_DECISION audit log entry.
   */
  async accept(
    workspaceId: string,
    suggestionId: string,
    userId: string,
  ) {
    const suggestion = await this._requireSuggestionInWorkspace(workspaceId, suggestionId);

    if (suggestion.status === DuplicateSuggestionStatus.ACCEPTED) {
      throw new BadRequestException('This duplicate suggestion has already been accepted.');
    }
    if (suggestion.status === DuplicateSuggestionStatus.REJECTED) {
      throw new BadRequestException(
        'This suggestion was previously rejected. Create a new suggestion or re-open it manually.',
      );
    }

    // Guard: neither feedback should already be merged
    if (suggestion.sourceFeedback.status === FeedbackStatus.MERGED) {
      throw new BadRequestException(
        `Source feedback (${suggestion.sourceId}) is already merged.`,
      );
    }
    if (suggestion.targetFeedback.status === FeedbackStatus.MERGED) {
      throw new BadRequestException(
        `Target feedback (${suggestion.targetId}) is already merged.`,
      );
    }

    // 1. Mark suggestion ACCEPTED
    const updated = await this.prisma.feedbackDuplicateSuggestion.update({
      where: { id: suggestionId },
      data: { status: DuplicateSuggestionStatus.ACCEPTED },
    });

    // 2. Merge: sourceId is the duplicate → merge it into targetId
    await this.mergeService.mergeFeedback(
      workspaceId,
      userId,
      suggestion.targetId,   // keep target
      [suggestion.sourceId], // mark source as MERGED
    );

    // 3. Audit: DUPLICATE_DECISION (accept)
    await this.auditService.logAction(
      workspaceId,
      userId,
      AuditLogAction.DUPLICATE_DECISION,
      {
        action: 'ACCEPTED',
        suggestionId,
        sourceId: suggestion.sourceId,
        targetId: suggestion.targetId,
        similarity: suggestion.similarity,
      },
    );

    return updated;
  }

  // ─── Reject ────────────────────────────────────────────────────────────────

  /**
   * Reject a duplicate suggestion.
   *
   * Side-effects:
   *   1. Marks the suggestion REJECTED.
   *   2. Writes a DUPLICATE_DECISION audit log entry.
   *
   * No merge is performed.  The suggestion will not reappear in PENDING lists.
   */
  async reject(
    workspaceId: string,
    suggestionId: string,
    userId: string,
  ) {
    const suggestion = await this._requireSuggestionInWorkspace(workspaceId, suggestionId);

    if (suggestion.status === DuplicateSuggestionStatus.REJECTED) {
      throw new BadRequestException('This duplicate suggestion has already been rejected.');
    }
    if (suggestion.status === DuplicateSuggestionStatus.ACCEPTED) {
      throw new BadRequestException(
        'This suggestion was already accepted and the merge has been applied.',
      );
    }

    const updated = await this.prisma.feedbackDuplicateSuggestion.update({
      where: { id: suggestionId },
      data: { status: DuplicateSuggestionStatus.REJECTED },
    });

    await this.auditService.logAction(
      workspaceId,
      userId,
      AuditLogAction.DUPLICATE_DECISION,
      {
        action: 'REJECTED',
        suggestionId,
        sourceId: suggestion.sourceId,
        targetId: suggestion.targetId,
        similarity: suggestion.similarity,
      },
    );

    return updated;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Normalise a raw Prisma FeedbackDuplicateSuggestion row to match the
   * frontend API contract.  The schema uses `sourceId` / `targetId` as the
   * FK column names, but the frontend type expects `sourceFeedbackId` /
   * `targetFeedbackId`.  We add both so existing code that reads either name
   * continues to work.
   */
  private _normaliseRow<T extends { sourceId: string; targetId: string }>(row: T) {
    return {
      ...row,
      sourceFeedbackId: row.sourceId,
      targetFeedbackId: row.targetId,
      // Keep originals as aliases for any code that reads sourceId / targetId directly
      sourceId: row.sourceId,
      targetId: row.targetId,
    };
  }

  private async _requireFeedbackInWorkspace(workspaceId: string, feedbackId: string) {
    const feedback = await this.prisma.feedback.findFirst({
      where: { id: feedbackId, workspaceId },
      select: { id: true },
    });
    if (!feedback) {
      throw new NotFoundException(`Feedback ${feedbackId} not found in this workspace.`);
    }
    return feedback;
  }

  /**
   * Load a suggestion and verify that both source and target belong to the
   * requesting workspace.  Raises 404 if the suggestion does not exist and
   * 403 if it belongs to a different workspace.
   */
  private async _requireSuggestionInWorkspace(workspaceId: string, suggestionId: string) {
    const suggestion = await this.prisma.feedbackDuplicateSuggestion.findUnique({
      where: { id: suggestionId },
      include: {
        sourceFeedback: {
          select: { id: true, workspaceId: true, status: true },
        },
        targetFeedback: {
          select: { id: true, workspaceId: true, status: true },
        },
      },
    });

    if (!suggestion) {
      throw new NotFoundException(`Duplicate suggestion ${suggestionId} not found.`);
    }

    // Cross-workspace guard
    if (
      suggestion.sourceFeedback.workspaceId !== workspaceId ||
      suggestion.targetFeedback.workspaceId !== workspaceId
    ) {
      throw new ForbiddenException(
        'Access denied: this suggestion does not belong to your workspace.',
      );
    }

    return suggestion;
  }
}

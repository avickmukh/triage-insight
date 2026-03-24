-- Migration: add_workspace_purge_system
-- Adds FROZEN status to WorkspaceStatus, and creates WorkspaceDeletionRequest
-- and WorkspaceDeletionAuditLog models for the purge lifecycle.

-- 1. Add FROZEN to WorkspaceStatus enum
ALTER TYPE "WorkspaceStatus" ADD VALUE IF NOT EXISTS 'FROZEN';

-- 2. Create WorkspaceDeletionStatus enum
CREATE TYPE "WorkspaceDeletionStatus" AS ENUM (
  'REQUESTED',
  'APPROVED',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

-- 3. Create PurgeStepStatus enum
CREATE TYPE "PurgeStepStatus" AS ENUM (
  'SUCCESS',
  'FAILED'
);

-- 4. Create WorkspaceDeletionRequest table
CREATE TABLE "WorkspaceDeletionRequest" (
  "id"                        TEXT NOT NULL,
  "workspaceId"               TEXT NOT NULL,
  "requestedByUserId"         TEXT,
  "approvedByUserId"          TEXT,
  "reason"                    TEXT,
  "status"                    "WorkspaceDeletionStatus" NOT NULL DEFAULT 'REQUESTED',
  "includeExportBeforeDelete" BOOLEAN NOT NULL DEFAULT false,
  "exportUrl"                 TEXT,
  "legalHold"                 BOOLEAN NOT NULL DEFAULT false,
  "retentionEndsAt"           TIMESTAMP(3),
  "scheduledFor"              TIMESTAMP(3),
  "requestedAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt"                TIMESTAMP(3),
  "startedAt"                 TIMESTAMP(3),
  "completedAt"               TIMESTAMP(3),
  "failedAt"                  TIMESTAMP(3),
  "failureReason"             TEXT,
  "createdAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                 TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkspaceDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- 5. Create WorkspaceDeletionAuditLog table
CREATE TABLE "WorkspaceDeletionAuditLog" (
  "id"                TEXT NOT NULL,
  "deletionRequestId" TEXT NOT NULL,
  "workspaceId"       TEXT NOT NULL,
  "stepName"          TEXT NOT NULL,
  "status"            "PurgeStepStatus" NOT NULL,
  "detailsJson"       JSONB,
  "errorMessage"      TEXT,
  "startedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"       TIMESTAMP(3),

  CONSTRAINT "WorkspaceDeletionAuditLog_pkey" PRIMARY KEY ("id")
);

-- 6. Add foreign keys
ALTER TABLE "WorkspaceDeletionRequest"
  ADD CONSTRAINT "WorkspaceDeletionRequest_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkspaceDeletionRequest"
  ADD CONSTRAINT "WorkspaceDeletionRequest_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkspaceDeletionRequest"
  ADD CONSTRAINT "WorkspaceDeletionRequest_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkspaceDeletionAuditLog"
  ADD CONSTRAINT "WorkspaceDeletionAuditLog_deletionRequestId_fkey"
  FOREIGN KEY ("deletionRequestId") REFERENCES "WorkspaceDeletionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. Add indexes
CREATE INDEX "WorkspaceDeletionRequest_workspaceId_idx" ON "WorkspaceDeletionRequest"("workspaceId");
CREATE INDEX "WorkspaceDeletionRequest_status_idx" ON "WorkspaceDeletionRequest"("status");
CREATE INDEX "WorkspaceDeletionAuditLog_deletionRequestId_idx" ON "WorkspaceDeletionAuditLog"("deletionRequestId");
CREATE INDEX "WorkspaceDeletionAuditLog_workspaceId_idx" ON "WorkspaceDeletionAuditLog"("workspaceId");

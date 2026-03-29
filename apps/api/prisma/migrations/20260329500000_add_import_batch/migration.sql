-- Migration: add ImportBatch model and link Feedback to ImportBatch
-- This enables per-batch pipeline progress tracking instead of workspace-wide aggregation.

-- 1. Create enums
CREATE TYPE "ImportBatchStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "ImportBatchStage"  AS ENUM ('UPLOADED', 'ANALYZING', 'CLUSTERING', 'COMPLETED');

-- 2. Create ImportBatch table
CREATE TABLE "ImportBatch" (
  "id"            TEXT        NOT NULL,
  "workspaceId"   TEXT        NOT NULL,
  "status"        "ImportBatchStatus" NOT NULL DEFAULT 'PENDING',
  "stage"         "ImportBatchStage"  NOT NULL DEFAULT 'UPLOADED',
  "totalRows"     INTEGER     NOT NULL DEFAULT 0,
  "completedRows" INTEGER     NOT NULL DEFAULT 0,
  "failedRows"    INTEGER     NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ImportBatch_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);

CREATE INDEX "ImportBatch_workspaceId_idx" ON "ImportBatch"("workspaceId");
CREATE INDEX "ImportBatch_status_idx"      ON "ImportBatch"("status");
CREATE INDEX "ImportBatch_createdAt_idx"   ON "ImportBatch"("createdAt");

-- 3. Add importBatchId to Feedback (nullable — existing rows have no batch)
ALTER TABLE "Feedback"
  ADD COLUMN IF NOT EXISTS "importBatchId" TEXT;

ALTER TABLE "Feedback"
  ADD CONSTRAINT "Feedback_importBatchId_fkey"
    FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL;

CREATE INDEX "Feedback_importBatchId_idx" ON "Feedback"("importBatchId");

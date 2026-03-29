-- Migration: add pipelineStatus and pipelineUpdatedAt to Workspace
-- These fields allow the frontend to poll a single field instead of
-- counting AiJobLog rows, and survive tab close / re-login.

ALTER TABLE "Workspace"
  ADD COLUMN IF NOT EXISTS "pipelineStatus"    TEXT         NOT NULL DEFAULT 'IDLE',
  ADD COLUMN IF NOT EXISTS "pipelineUpdatedAt" TIMESTAMPTZ;

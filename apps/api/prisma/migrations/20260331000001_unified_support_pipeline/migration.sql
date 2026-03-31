-- Migration: Unified Support Pipeline
-- Adds unifiedFeedbackId to SupportTicket so that each ingested ticket
-- can be bridged into the unified Feedback model and flow through the
-- same AI analysis + ThemeFeedback + CIQ pipeline as all other signals.

ALTER TABLE "SupportTicket"
  ADD COLUMN IF NOT EXISTS "unifiedFeedbackId" TEXT;

-- Unique constraint: one SupportTicket maps to at most one Feedback record
CREATE UNIQUE INDEX IF NOT EXISTS "SupportTicket_unifiedFeedbackId_key"
  ON "SupportTicket"("unifiedFeedbackId");

-- Foreign key: SupportTicket → Feedback (nullable, SET NULL on delete)
ALTER TABLE "SupportTicket"
  ADD CONSTRAINT "SupportTicket_unifiedFeedbackId_fkey"
  FOREIGN KEY ("unifiedFeedbackId")
  REFERENCES "Feedback"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE
  NOT VALID;

-- Validate the constraint in the background (non-blocking)
ALTER TABLE "SupportTicket"
  VALIDATE CONSTRAINT "SupportTicket_unifiedFeedbackId_fkey";

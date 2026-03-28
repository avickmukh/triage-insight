-- Migration: add supportWeight and voiceWeight to PrioritizationSettings
-- These are source multipliers for the unified CIQ formula (PRD Phase 2).
-- supportWeight > feedbackWeight (1.5×), voiceWeight >= feedbackWeight (1.2×).

ALTER TABLE "PrioritizationSettings"
  ADD COLUMN IF NOT EXISTS "supportWeight" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS "voiceWeight"   DOUBLE PRECISION NOT NULL DEFAULT 1.2;

-- Add archive explainability metadata fields to Theme table.
-- All columns are nullable — existing themes are unaffected.
-- archiveReason:      human or AI label (e.g. "Duplicate", "Noise", "Wrong clustering")
-- archiveConfidence:  0–1 float — AI confidence in the archive decision
-- archiveExplanation: human-readable sentence explaining why the theme was archived
-- archivedBy:         'AI' | 'MANUAL' — who triggered the archive
-- archivedAt:         timestamp of the archive action

ALTER TABLE "Theme"
  ADD COLUMN IF NOT EXISTS "archiveReason"      TEXT,
  ADD COLUMN IF NOT EXISTS "archiveConfidence"  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "archiveExplanation" TEXT,
  ADD COLUMN IF NOT EXISTS "archivedBy"         TEXT,
  ADD COLUMN IF NOT EXISTS "archivedAt"         TIMESTAMP(3);

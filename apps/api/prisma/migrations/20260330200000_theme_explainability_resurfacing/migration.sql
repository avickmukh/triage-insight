-- Migration: theme_explainability_resurfacing
-- Adds:
--   ThemeFeedback.matchReason  — decomposed AI match factors for explainability
--   Theme.resurfacedAt         — timestamp of last fresh-evidence-on-shipped-theme event
--   Theme.resurfaceCount       — count of resurfacing events
--   Theme.lastEvidenceAt       — timestamp of most recent evidence attachment
--
-- All columns are nullable / have defaults — zero-downtime, no table locks.

-- ThemeFeedback: explainability
ALTER TABLE "ThemeFeedback"
  ADD COLUMN IF NOT EXISTS "matchReason" JSONB;

-- Theme: resurfacing signals
ALTER TABLE "Theme"
  ADD COLUMN IF NOT EXISTS "resurfacedAt"   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "resurfaceCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastEvidenceAt" TIMESTAMPTZ;

-- Backfill lastEvidenceAt from the most recent ThemeFeedback.assignedAt
-- so existing themes immediately have a valid sort key.
UPDATE "Theme" t
SET "lastEvidenceAt" = (
  SELECT MAX(tf."assignedAt")
  FROM "ThemeFeedback" tf
  WHERE tf."themeId" = t.id
)
WHERE "lastEvidenceAt" IS NULL;

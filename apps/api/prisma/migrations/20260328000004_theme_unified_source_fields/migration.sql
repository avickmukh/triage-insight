-- Migration: Add unified cross-source aggregation fields to Theme
-- These fields are populated by the UnifiedAggregationService (async, not blocking ingestion)

ALTER TABLE "Theme"
  ADD COLUMN IF NOT EXISTS "totalSignalCount"      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "feedbackCount"         INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "supportCount"          INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "voiceCount"            INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sentimentDistribution" JSONB,
  ADD COLUMN IF NOT EXISTS "lastAggregatedAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "crossSourceInsight"    TEXT;

-- Backfill feedbackCount from existing ThemeFeedback rows
UPDATE "Theme" t
SET "feedbackCount" = (
  SELECT COUNT(*) FROM "ThemeFeedback" tf WHERE tf."themeId" = t.id
);

-- Backfill supportCount from linked SupportIssueCluster rows
UPDATE "Theme" t
SET "supportCount" = (
  SELECT COALESCE(SUM(c."ticketCount"), 0)
  FROM "SupportIssueCluster" c
  WHERE c."themeId" = t.id
);

-- Backfill voiceCount from VOICE sourceType feedback linked to this theme
UPDATE "Theme" t
SET "voiceCount" = (
  SELECT COUNT(*)
  FROM "ThemeFeedback" tf
  JOIN "Feedback" f ON f.id = tf."feedbackId"
  WHERE tf."themeId" = t.id
    AND f."sourceType" = 'VOICE'
);

-- Backfill totalSignalCount
UPDATE "Theme"
SET "totalSignalCount" = COALESCE("feedbackCount", 0)
                       + COALESCE("supportCount", 0)
                       + COALESCE("voiceCount", 0);

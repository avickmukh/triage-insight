-- Migration: add trend direction, auto-merge candidates, short label, and impact sentence fields to Theme
-- Created: 2026-03-29

ALTER TABLE "Theme"
  ADD COLUMN IF NOT EXISTS "trendDirection"      TEXT      NOT NULL DEFAULT 'STABLE',
  ADD COLUMN IF NOT EXISTS "trendDelta"          FLOAT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastTrendedAt"       TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "currentWeekSignals"  INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "prevWeekSignals"     INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "autoMergeCandidate"  BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "autoMergeTargetId"   TEXT,
  ADD COLUMN IF NOT EXISTS "autoMergeSimilarity" FLOAT,
  ADD COLUMN IF NOT EXISTS "shortLabel"          TEXT,
  ADD COLUMN IF NOT EXISTS "shortLabelAt"        TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "impactSentence"      TEXT,
  ADD COLUMN IF NOT EXISTS "centroidUpdatedAt"   TIMESTAMP;

-- Index for efficient auto-merge candidate queries
CREATE INDEX IF NOT EXISTS "Theme_autoMergeCandidate_idx" ON "Theme"("autoMergeCandidate");

-- Index for trend direction queries (dashboard top-priority panel)
CREATE INDEX IF NOT EXISTS "Theme_trendDirection_idx" ON "Theme"("trendDirection");

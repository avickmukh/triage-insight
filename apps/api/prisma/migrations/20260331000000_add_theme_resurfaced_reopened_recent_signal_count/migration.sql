-- Migration: add_theme_resurfaced_reopened_recent_signal_count
-- Adds two new ThemeStatus enum values:
--   RESURFACED — theme received fresh signals after its linked RoadmapItem was SHIPPED
--   REOPENED   — theme was manually reopened after being closed/shipped
-- Adds one new column:
--   Theme.recentSignalCount — count of signals received in the last 30 days
--
-- All changes are additive and zero-downtime.

-- 1. Add RESURFACED to the ThemeStatus enum
ALTER TYPE "ThemeStatus" ADD VALUE IF NOT EXISTS 'RESURFACED';

-- 2. Add REOPENED to the ThemeStatus enum
ALTER TYPE "ThemeStatus" ADD VALUE IF NOT EXISTS 'REOPENED';

-- 3. Add recentSignalCount column to Theme
ALTER TABLE "Theme"
  ADD COLUMN IF NOT EXISTS "recentSignalCount" INTEGER NOT NULL DEFAULT 0;

-- 4. Backfill recentSignalCount from ThemeFeedback rows created in the last 30 days
UPDATE "Theme" t
SET "recentSignalCount" = (
  SELECT COUNT(*)::INTEGER
  FROM "ThemeFeedback" tf
  JOIN "Feedback" f ON f.id = tf."feedbackId"
  WHERE tf."themeId" = t.id
    AND f."createdAt" >= NOW() - INTERVAL '30 days'
)
WHERE "recentSignalCount" = 0;

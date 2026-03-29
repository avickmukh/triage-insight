-- Migration: add surveyCount to Theme
-- Adds the survey signal count column that was missing from the Theme model.
-- Existing rows default to 0; the CIQ scorer will backfill on the next run.

ALTER TABLE "Theme" ADD COLUMN IF NOT EXISTS "surveyCount" INTEGER NOT NULL DEFAULT 0;

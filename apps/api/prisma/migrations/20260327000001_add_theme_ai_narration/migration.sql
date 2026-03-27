-- Migration: add Stage-2 AI narration fields to Theme
-- Generated: 2026-03-27

ALTER TABLE "Theme"
  ADD COLUMN IF NOT EXISTS "aiSummary"        TEXT,
  ADD COLUMN IF NOT EXISTS "aiExplanation"    TEXT,
  ADD COLUMN IF NOT EXISTS "aiRecommendation" TEXT,
  ADD COLUMN IF NOT EXISTS "aiConfidence"     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "aiNarratedAt"     TIMESTAMP(3);

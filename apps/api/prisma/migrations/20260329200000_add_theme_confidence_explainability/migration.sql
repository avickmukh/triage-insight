-- Migration: add cluster confidence + explainability fields to Theme
-- Adds: clusterConfidence, confidenceFactors, outlierCount, topKeywords, dominantSignal
-- These fields power the Confidence Scoring + Explainability Layer (PRD Part 1–7).
-- Existing rows default to 0 / NULL; the clustering pipeline will backfill on the next run.

ALTER TABLE "Theme"
  ADD COLUMN IF NOT EXISTS "clusterConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "confidenceFactors"  JSONB,
  ADD COLUMN IF NOT EXISTS "outlierCount"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "topKeywords"        JSONB,
  ADD COLUMN IF NOT EXISTS "dominantSignal"     TEXT;

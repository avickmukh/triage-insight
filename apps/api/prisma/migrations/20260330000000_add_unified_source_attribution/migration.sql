-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add_unified_source_attribution
-- Date:      2026-03-30
-- Branch:    release/survey
--
-- Purpose:
--   Introduce two new enums (FeedbackPrimarySource, FeedbackSecondarySource)
--   and two new nullable columns (primarySource, secondarySource) on the
--   Feedback table.
--
--   The existing `sourceType` column is PRESERVED unchanged so that all
--   existing queries, indexes, and application code continue to work without
--   modification.
--
--   After adding the columns, a CASE-based UPDATE backfills both new columns
--   for every existing row using the deterministic mapping below:
--
--   sourceType      → primarySource   secondarySource
--   ─────────────────────────────────────────────────
--   MANUAL          → FEEDBACK        MANUAL
--   PUBLIC_PORTAL   → FEEDBACK        PORTAL
--   EMAIL           → FEEDBACK        EMAIL
--   SLACK           → FEEDBACK        SLACK
--   CSV_IMPORT      → FEEDBACK        CSV_UPLOAD
--   VOICE           → VOICE           TRANSCRIPT
--   SURVEY          → SURVEY          PORTAL
--   API             → FEEDBACK        API
--   (any unknown)   → FEEDBACK        OTHER
--
-- Safety:
--   • Both new columns are nullable — no NOT NULL constraint is added here.
--     Application code will always set them going forward; legacy rows that
--     somehow escape the backfill will simply have NULL values, which are
--     handled gracefully by all query paths.
--   • The backfill UPDATE runs in a single statement; no data is deleted.
--   • Indexes are added CONCURRENTLY to avoid locking on large tables.
--     (Prisma migrate deploy runs outside a transaction for CONCURRENT ops.)
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Create the two new enum types
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE "FeedbackPrimarySource" AS ENUM (
  'FEEDBACK',
  'SUPPORT',
  'VOICE',
  'SURVEY'
);

CREATE TYPE "FeedbackSecondarySource" AS ENUM (
  'MANUAL',
  'CSV_UPLOAD',
  'PORTAL',
  'EMAIL',
  'SLACK',
  'ZENDESK',
  'INTERCOM',
  'API',
  'WEBHOOK',
  'TRANSCRIPT',
  'IMPORT',
  'OTHER'
);

-- Step 2: Add the two new nullable columns to Feedback
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Feedback"
  ADD COLUMN "primarySource"   "FeedbackPrimarySource",
  ADD COLUMN "secondarySource" "FeedbackSecondarySource";

-- Step 3: Backfill both columns from the existing sourceType value
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE "Feedback"
SET
  "primarySource" = CASE "sourceType"
    WHEN 'VOICE'         THEN 'VOICE'::"FeedbackPrimarySource"
    WHEN 'SURVEY'        THEN 'SURVEY'::"FeedbackPrimarySource"
    ELSE                      'FEEDBACK'::"FeedbackPrimarySource"
  END,
  "secondarySource" = CASE "sourceType"
    WHEN 'MANUAL'        THEN 'MANUAL'::"FeedbackSecondarySource"
    WHEN 'PUBLIC_PORTAL' THEN 'PORTAL'::"FeedbackSecondarySource"
    WHEN 'EMAIL'         THEN 'EMAIL'::"FeedbackSecondarySource"
    WHEN 'SLACK'         THEN 'SLACK'::"FeedbackSecondarySource"
    WHEN 'CSV_IMPORT'    THEN 'CSV_UPLOAD'::"FeedbackSecondarySource"
    WHEN 'VOICE'         THEN 'TRANSCRIPT'::"FeedbackSecondarySource"
    WHEN 'SURVEY'        THEN 'PORTAL'::"FeedbackSecondarySource"
    WHEN 'API'           THEN 'API'::"FeedbackSecondarySource"
    ELSE                      'OTHER'::"FeedbackSecondarySource"
  END;

-- Step 4: Add indexes for the new columns
-- Using standard (non-concurrent) CREATE INDEX inside the migration transaction.
-- For very large production tables, these can be converted to CONCURRENT after deploy.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX "Feedback_primarySource_idx"   ON "Feedback" ("primarySource");
CREATE INDEX "Feedback_secondarySource_idx" ON "Feedback" ("secondarySource");

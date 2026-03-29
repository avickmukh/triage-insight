-- Migration: rename_theme_status_enum
--
-- Replaces the blocking DRAFT/ACTIVE two-state model with an AI-first model:
--
--   DRAFT   → AI_GENERATED  (default; fully participates in CIQ and dashboards)
--   ACTIVE  → VERIFIED      (optional human-review label; does NOT gate CIQ)
--   ARCHIVED stays ARCHIVED (excluded from all intelligence queries)
--
-- Strategy: rename the old enum type, create the new one, migrate the column,
-- then drop the old type.  All steps are idempotent (IF NOT EXISTS / IF EXISTS).
--
-- Backfill:
--   Existing DRAFT  rows → AI_GENERATED
--   Existing ACTIVE rows → VERIFIED
--   Existing ARCHIVED rows → ARCHIVED (no change)

-- Step 1: Create the new enum type
DO $$ BEGIN
  CREATE TYPE "ThemeStatus_new" AS ENUM ('AI_GENERATED', 'VERIFIED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Step 2: Add a temporary column with the new type
ALTER TABLE "Theme"
  ADD COLUMN IF NOT EXISTS "status_new" "ThemeStatus_new";

-- Step 3: Backfill the new column from the old values
UPDATE "Theme"
SET "status_new" = CASE
  WHEN "status"::text = 'DRAFT'    THEN 'AI_GENERATED'::"ThemeStatus_new"
  WHEN "status"::text = 'ACTIVE'   THEN 'VERIFIED'::"ThemeStatus_new"
  WHEN "status"::text = 'ARCHIVED' THEN 'ARCHIVED'::"ThemeStatus_new"
  ELSE 'AI_GENERATED'::"ThemeStatus_new"
END;

-- Step 4: Set the default on the new column
ALTER TABLE "Theme"
  ALTER COLUMN "status_new" SET DEFAULT 'AI_GENERATED'::"ThemeStatus_new";

-- Step 5: Make the new column NOT NULL (all rows are now populated)
ALTER TABLE "Theme"
  ALTER COLUMN "status_new" SET NOT NULL;

-- Step 6: Drop the old column
ALTER TABLE "Theme"
  DROP COLUMN "status";

-- Step 7: Rename the new column to status
ALTER TABLE "Theme"
  RENAME COLUMN "status_new" TO "status";

-- Step 8: Drop the old enum type
DROP TYPE IF EXISTS "ThemeStatus";

-- Step 9: Rename the new enum type to the canonical name
ALTER TYPE "ThemeStatus_new" RENAME TO "ThemeStatus";

-- Step 10: Recreate the index on the status column (was dropped with the old column)
CREATE INDEX IF NOT EXISTS "Theme_status_idx" ON "Theme" ("status");

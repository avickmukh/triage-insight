-- Migration: 20260323000001_update_billing_plans_free_pro_business
-- prisma-migrate-no-transaction
--
-- Step 1 of 2: Add BUSINESS enum value and new Plan columns.
-- The ENTERPRISE→BUSINESS row migration happens in migration 20260323000002
-- (PostgreSQL requires ADD VALUE to commit before the new value can be used).

-- ── 1. Add BUSINESS enum value (PRO already exists in base migration) ─────────
ALTER TYPE "BillingPlan" ADD VALUE IF NOT EXISTS 'BUSINESS';

-- ── 2. Add new Plan columns (idempotent) ─────────────────────────────────────
ALTER TABLE "Plan"
  ADD COLUMN IF NOT EXISTS "priceMonthly"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "adminLimit"           INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "voiceUploadLimit"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "surveyResponseLimit"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "aiThemeClustering"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ciqPrioritization"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "explainableAi"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "weeklyDigest"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "voiceFeedback"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "survey"               BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "csvImport"            BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "apiAccess"            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "executiveReporting"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "customDomain"         BOOLEAN NOT NULL DEFAULT false;

-- ── 3. Remove legacy columns ─────────────────────────────────────────────────
ALTER TABLE "Plan"
  DROP COLUMN IF EXISTS "churnIntelligence",
  DROP COLUMN IF EXISTS "sso";

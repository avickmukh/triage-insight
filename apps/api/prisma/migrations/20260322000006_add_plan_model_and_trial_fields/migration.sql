-- Migration: 20260322000006_add_plan_model_and_trial_fields
-- Adds:
--   • TrialStatus enum (ACTIVE, EXPIRED, CONVERTED)
--   • PlanStatus enum (ACTIVE, SUSPENDED, CANCELLED)
--   • Plan model (super-admin managed plan config table) — full schema
--   • Workspace fields: trialStartedAt, trialStatus, planStatus, seatLimit, aiUsageLimit, planId

-- 1. Create TrialStatus enum
DO $$ BEGIN
  CREATE TYPE "TrialStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CONVERTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create PlanStatus enum
DO $$ BEGIN
  CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Create Plan table (full schema — all columns required by the Prisma model)
CREATE TABLE IF NOT EXISTS "Plan" (
    "id"                  TEXT NOT NULL,
    "planType"            "BillingPlan" NOT NULL,
    "displayName"         TEXT NOT NULL,
    "description"         TEXT,
    "priceMonthly"        INTEGER NOT NULL DEFAULT 0,
    "trialDays"           INTEGER NOT NULL DEFAULT 0,
    "adminLimit"          INTEGER DEFAULT 1,
    "seatLimit"           INTEGER,
    "aiUsageLimit"        INTEGER,
    "feedbackLimit"       INTEGER,
    "voiceUploadLimit"    INTEGER NOT NULL DEFAULT 0,
    "surveyResponseLimit" INTEGER NOT NULL DEFAULT 0,
    "aiInsights"          BOOLEAN NOT NULL DEFAULT false,
    "aiThemeClustering"   BOOLEAN NOT NULL DEFAULT false,
    "ciqPrioritization"   BOOLEAN NOT NULL DEFAULT false,
    "explainableAi"       BOOLEAN NOT NULL DEFAULT false,
    "weeklyDigest"        BOOLEAN NOT NULL DEFAULT false,
    "voiceFeedback"       BOOLEAN NOT NULL DEFAULT false,
    "survey"              BOOLEAN NOT NULL DEFAULT false,
    "integrations"        BOOLEAN NOT NULL DEFAULT false,
    "publicPortal"        BOOLEAN NOT NULL DEFAULT true,
    "csvImport"           BOOLEAN NOT NULL DEFAULT true,
    "apiAccess"           BOOLEAN NOT NULL DEFAULT false,
    "executiveReporting"  BOOLEAN NOT NULL DEFAULT false,
    "customDomain"        BOOLEAN NOT NULL DEFAULT false,
    "isActive"            BOOLEAN NOT NULL DEFAULT true,
    "isDefault"           BOOLEAN NOT NULL DEFAULT false,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- 4. Unique index on Plan.planType (one config row per plan tier)
CREATE UNIQUE INDEX IF NOT EXISTS "Plan_planType_key" ON "Plan"("planType");

-- 5. Add new workspace trial/plan columns
ALTER TABLE "Workspace"
  ADD COLUMN IF NOT EXISTS "trialStartedAt"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "trialStatus"     "TrialStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "planStatus"      "PlanStatus"  NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "seatLimit"       INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "aiUsageLimit"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "planId"          TEXT;

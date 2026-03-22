-- Migration: 20260322000006_add_plan_model_and_trial_fields
-- Adds:
--   • GROWTH value to BillingPlan enum
--   • TrialStatus enum (ACTIVE, EXPIRED, CONVERTED)
--   • PlanStatus enum (ACTIVE, SUSPENDED, CANCELLED)
--   • Plan model (super-admin managed plan config table)
--   • Workspace fields: trialStartedAt, trialStatus, planStatus, seatLimit, aiUsageLimit, planId

-- 1. Add GROWTH to BillingPlan enum
ALTER TYPE "BillingPlan" ADD VALUE IF NOT EXISTS 'GROWTH';

-- 2. Create TrialStatus enum
DO $$ BEGIN
  CREATE TYPE "TrialStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CONVERTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Create PlanStatus enum
DO $$ BEGIN
  CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Create Plan table
CREATE TABLE IF NOT EXISTS "Plan" (
    "id"                TEXT NOT NULL,
    "planType"          "BillingPlan" NOT NULL,
    "displayName"       TEXT NOT NULL,
    "description"       TEXT,
    "trialDays"         INTEGER NOT NULL DEFAULT 0,
    "seatLimit"         INTEGER,
    "aiUsageLimit"      INTEGER,
    "feedbackLimit"     INTEGER,
    "aiInsights"        BOOLEAN NOT NULL DEFAULT false,
    "integrations"      BOOLEAN NOT NULL DEFAULT false,
    "publicPortal"      BOOLEAN NOT NULL DEFAULT true,
    "churnIntelligence" BOOLEAN NOT NULL DEFAULT false,
    "sso"               BOOLEAN NOT NULL DEFAULT false,
    "isActive"          BOOLEAN NOT NULL DEFAULT true,
    "isDefault"         BOOLEAN NOT NULL DEFAULT false,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- 5. Unique index on Plan.planType (one config row per plan tier)
CREATE UNIQUE INDEX IF NOT EXISTS "Plan_planType_key" ON "Plan"("planType");

-- 7. Add new workspace trial/plan columns
ALTER TABLE "Workspace"
  ADD COLUMN IF NOT EXISTS "trialStartedAt"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "trialStatus"     "TrialStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "planStatus"      "PlanStatus"  NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "seatLimit"       INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "aiUsageLimit"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "planId"          TEXT;

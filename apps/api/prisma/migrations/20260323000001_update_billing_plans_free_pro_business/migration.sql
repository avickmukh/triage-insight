-- Migration: 20260323000001_update_billing_plans_free_pro_business
--
-- Updates the Plan table for the new FREE / PRO ($29) / BUSINESS ($49) pricing model.
-- The BillingPlan enum was already updated to FREE/PRO/BUSINESS in the base migration.
-- This migration:
--   1. Adds new Plan columns (idempotent via IF NOT EXISTS)
--   2. Removes legacy columns no longer in the schema
--   3. Upserts the 3 canonical plan rows

-- ── 1. Add new columns (idempotent) ──────────────────────────────────────────
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

-- ── 2. Remove legacy columns no longer in the Prisma schema ──────────────────
ALTER TABLE "Plan"
  DROP COLUMN IF EXISTS "churnIntelligence",
  DROP COLUMN IF EXISTS "sso";

-- ── 3. Upsert canonical plan rows ─────────────────────────────────────────────
-- FREE plan
INSERT INTO "Plan" (
  "id","planType","displayName","description",
  "priceMonthly","trialDays",
  "adminLimit","seatLimit","aiUsageLimit","feedbackLimit",
  "voiceUploadLimit","surveyResponseLimit",
  "aiInsights","aiThemeClustering","ciqPrioritization","explainableAi",
  "weeklyDigest","voiceFeedback","survey",
  "integrations","publicPortal","csvImport","apiAccess",
  "executiveReporting","customDomain",
  "isActive","isDefault","updatedAt"
) VALUES (
  gen_random_uuid(), 'FREE', 'Free', 'Forever free for solo PMs and small teams',
  0, 0,
  1, 3, 0, 100,
  0, 0,
  false, false, false, false,
  false, false, false,
  false, true, true, false,
  false, false,
  true, true, CURRENT_TIMESTAMP
)
ON CONFLICT ("planType") DO UPDATE SET
  "displayName"          = EXCLUDED."displayName",
  "description"          = EXCLUDED."description",
  "priceMonthly"         = EXCLUDED."priceMonthly",
  "trialDays"            = EXCLUDED."trialDays",
  "adminLimit"           = EXCLUDED."adminLimit",
  "seatLimit"            = EXCLUDED."seatLimit",
  "aiUsageLimit"         = EXCLUDED."aiUsageLimit",
  "feedbackLimit"        = EXCLUDED."feedbackLimit",
  "voiceUploadLimit"     = EXCLUDED."voiceUploadLimit",
  "surveyResponseLimit"  = EXCLUDED."surveyResponseLimit",
  "aiInsights"           = EXCLUDED."aiInsights",
  "aiThemeClustering"    = EXCLUDED."aiThemeClustering",
  "ciqPrioritization"    = EXCLUDED."ciqPrioritization",
  "explainableAi"        = EXCLUDED."explainableAi",
  "weeklyDigest"         = EXCLUDED."weeklyDigest",
  "voiceFeedback"        = EXCLUDED."voiceFeedback",
  "survey"               = EXCLUDED."survey",
  "integrations"         = EXCLUDED."integrations",
  "publicPortal"         = EXCLUDED."publicPortal",
  "csvImport"            = EXCLUDED."csvImport",
  "apiAccess"            = EXCLUDED."apiAccess",
  "executiveReporting"   = EXCLUDED."executiveReporting",
  "customDomain"         = EXCLUDED."customDomain",
  "isActive"             = EXCLUDED."isActive",
  "isDefault"            = EXCLUDED."isDefault",
  "updatedAt"            = CURRENT_TIMESTAMP;

-- PRO plan ($29/mo)
INSERT INTO "Plan" (
  "id","planType","displayName","description",
  "priceMonthly","trialDays",
  "adminLimit","seatLimit","aiUsageLimit","feedbackLimit",
  "voiceUploadLimit","surveyResponseLimit",
  "aiInsights","aiThemeClustering","ciqPrioritization","explainableAi",
  "weeklyDigest","voiceFeedback","survey",
  "integrations","publicPortal","csvImport","apiAccess",
  "executiveReporting","customDomain",
  "isActive","isDefault","updatedAt"
) VALUES (
  gen_random_uuid(), 'PRO', 'Pro', 'For growing teams ready to close the feedback loop',
  2900, 14,
  1, 5, 500, 1000,
  100, 300,
  true, true, true, true,
  false, true, true,
  true, true, true, true,
  false, false,
  true, false, CURRENT_TIMESTAMP
)
ON CONFLICT ("planType") DO UPDATE SET
  "displayName"          = EXCLUDED."displayName",
  "description"          = EXCLUDED."description",
  "priceMonthly"         = EXCLUDED."priceMonthly",
  "trialDays"            = EXCLUDED."trialDays",
  "adminLimit"           = EXCLUDED."adminLimit",
  "seatLimit"            = EXCLUDED."seatLimit",
  "aiUsageLimit"         = EXCLUDED."aiUsageLimit",
  "feedbackLimit"        = EXCLUDED."feedbackLimit",
  "voiceUploadLimit"     = EXCLUDED."voiceUploadLimit",
  "surveyResponseLimit"  = EXCLUDED."surveyResponseLimit",
  "aiInsights"           = EXCLUDED."aiInsights",
  "aiThemeClustering"    = EXCLUDED."aiThemeClustering",
  "ciqPrioritization"    = EXCLUDED."ciqPrioritization",
  "explainableAi"        = EXCLUDED."explainableAi",
  "weeklyDigest"         = EXCLUDED."weeklyDigest",
  "voiceFeedback"        = EXCLUDED."voiceFeedback",
  "survey"               = EXCLUDED."survey",
  "integrations"         = EXCLUDED."integrations",
  "publicPortal"         = EXCLUDED."publicPortal",
  "csvImport"            = EXCLUDED."csvImport",
  "apiAccess"            = EXCLUDED."apiAccess",
  "executiveReporting"   = EXCLUDED."executiveReporting",
  "customDomain"         = EXCLUDED."customDomain",
  "isActive"             = EXCLUDED."isActive",
  "isDefault"            = EXCLUDED."isDefault",
  "updatedAt"            = CURRENT_TIMESTAMP;

-- BUSINESS plan ($49/mo)
-- voiceUploadLimit = -1 means unlimited (column is NOT NULL)
-- surveyResponseLimit = -1 means unlimited (column is NOT NULL)
INSERT INTO "Plan" (
  "id","planType","displayName","description",
  "priceMonthly","trialDays",
  "adminLimit","seatLimit","aiUsageLimit","feedbackLimit",
  "voiceUploadLimit","surveyResponseLimit",
  "aiInsights","aiThemeClustering","ciqPrioritization","explainableAi",
  "weeklyDigest","voiceFeedback","survey",
  "integrations","publicPortal","csvImport","apiAccess",
  "executiveReporting","customDomain",
  "isActive","isDefault","updatedAt"
) VALUES (
  gen_random_uuid(), 'BUSINESS', 'Business', 'For teams that need integrations and deeper insights',
  4900, 14,
  3, 15, NULL, NULL,
  -1, -1,
  true, true, true, true,
  true, true, true,
  true, true, true, true,
  true, false,
  true, false, CURRENT_TIMESTAMP
)
ON CONFLICT ("planType") DO UPDATE SET
  "displayName"          = EXCLUDED."displayName",
  "description"          = EXCLUDED."description",
  "priceMonthly"         = EXCLUDED."priceMonthly",
  "trialDays"            = EXCLUDED."trialDays",
  "adminLimit"           = EXCLUDED."adminLimit",
  "seatLimit"            = EXCLUDED."seatLimit",
  "aiUsageLimit"         = EXCLUDED."aiUsageLimit",
  "feedbackLimit"        = EXCLUDED."feedbackLimit",
  "voiceUploadLimit"     = EXCLUDED."voiceUploadLimit",
  "surveyResponseLimit"  = EXCLUDED."surveyResponseLimit",
  "aiInsights"           = EXCLUDED."aiInsights",
  "aiThemeClustering"    = EXCLUDED."aiThemeClustering",
  "ciqPrioritization"    = EXCLUDED."ciqPrioritization",
  "explainableAi"        = EXCLUDED."explainableAi",
  "weeklyDigest"         = EXCLUDED."weeklyDigest",
  "voiceFeedback"        = EXCLUDED."voiceFeedback",
  "survey"               = EXCLUDED."survey",
  "integrations"         = EXCLUDED."integrations",
  "publicPortal"         = EXCLUDED."publicPortal",
  "csvImport"            = EXCLUDED."csvImport",
  "apiAccess"            = EXCLUDED."apiAccess",
  "executiveReporting"   = EXCLUDED."executiveReporting",
  "customDomain"         = EXCLUDED."customDomain",
  "isActive"             = EXCLUDED."isActive",
  "isDefault"            = EXCLUDED."isDefault",
  "updatedAt"            = CURRENT_TIMESTAMP;

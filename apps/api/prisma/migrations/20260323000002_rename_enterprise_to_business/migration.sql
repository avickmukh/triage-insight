-- Migration: 20260323000002_rename_enterprise_to_business
--
-- Step 2 of 2: Migrate existing rows from old BillingPlan enum values to new ones,
-- then upsert the 3 canonical plan rows.
-- Runs after 20260323000001 which committed the BUSINESS enum value.

-- ── 1. Migrate Workspace rows using old enum values ───────────────────────────
UPDATE "Workspace" SET "billingPlan" = 'PRO'      WHERE "billingPlan"::text = 'STARTER';
UPDATE "Workspace" SET "billingPlan" = 'BUSINESS'  WHERE "billingPlan"::text = 'ENTERPRISE';
UPDATE "Workspace" SET "billingPlan" = 'BUSINESS'  WHERE "billingPlan"::text = 'GROWTH';

-- ── 2. Migrate Plan rows using old enum values ────────────────────────────────
-- Delete any duplicate rows first to avoid unique constraint violations
DELETE FROM "Plan" WHERE "planType"::text IN ('STARTER', 'GROWTH', 'ENTERPRISE');
-- Also delete any pre-existing PRO/BUSINESS rows so the upserts below are clean
DELETE FROM "Plan" WHERE "planType"::text IN ('FREE', 'PRO', 'BUSINESS');

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

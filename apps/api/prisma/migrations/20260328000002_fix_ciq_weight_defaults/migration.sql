-- Migration: fix CIQ weight defaults so they sum to 1.0
-- Generated: 2026-03-28
--
-- The original defaults summed to 1.3 (core=1.0 + extended=0.3), which inflated
-- all CIQ priority scores. Normalised values preserve the original relative
-- proportions while ensuring the weighted sum stays within the 0–100 range.
--
-- Old defaults:
--   requestFrequencyWeight=0.20, customerCountWeight=0.20, arrValueWeight=0.20,
--   accountPriorityWeight=0.10, dealValueWeight=0.20, strategicWeight=0.10,
--   voteWeight=0.15, sentimentWeight=0.10, recencyWeight=0.05  → sum=1.30
--
-- New defaults (÷1.3, rounded to 4dp):
--   requestFrequencyWeight=0.1538, customerCountWeight=0.1538, arrValueWeight=0.1538,
--   accountPriorityWeight=0.0769, dealValueWeight=0.1538, strategicWeight=0.0769,
--   voteWeight=0.1154, sentimentWeight=0.0769, recencyWeight=0.0385  → sum≈1.00

ALTER TABLE "PrioritizationSettings"
  ALTER COLUMN "requestFrequencyWeight" SET DEFAULT 0.1538,
  ALTER COLUMN "customerCountWeight"    SET DEFAULT 0.1538,
  ALTER COLUMN "arrValueWeight"         SET DEFAULT 0.1538,
  ALTER COLUMN "accountPriorityWeight"  SET DEFAULT 0.0769,
  ALTER COLUMN "dealValueWeight"        SET DEFAULT 0.1538,
  ALTER COLUMN "strategicWeight"        SET DEFAULT 0.0769,
  ALTER COLUMN "voteWeight"             SET DEFAULT 0.1154,
  ALTER COLUMN "sentimentWeight"        SET DEFAULT 0.0769,
  ALTER COLUMN "recencyWeight"          SET DEFAULT 0.0385;

-- Update existing rows that still have the old inflated defaults
UPDATE "PrioritizationSettings"
SET
  "requestFrequencyWeight" = 0.1538,
  "customerCountWeight"    = 0.1538,
  "arrValueWeight"         = 0.1538,
  "accountPriorityWeight"  = 0.0769,
  "dealValueWeight"        = 0.1538,
  "strategicWeight"        = 0.0769,
  "voteWeight"             = 0.1154,
  "sentimentWeight"        = 0.0769,
  "recencyWeight"          = 0.0385
WHERE
  "requestFrequencyWeight" = 0.2
  AND "customerCountWeight" = 0.2
  AND "arrValueWeight"      = 0.2;

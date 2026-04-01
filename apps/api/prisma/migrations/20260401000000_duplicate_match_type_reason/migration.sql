-- AddColumn: matchType to FeedbackDuplicateSuggestion
-- Classifies duplicate suggestions into strict match classes to prevent false positives.
-- Default is NEAR_DUPLICATE for backward-compatibility with existing rows.

ALTER TABLE "FeedbackDuplicateSuggestion"
  ADD COLUMN IF NOT EXISTS "matchType" TEXT NOT NULL DEFAULT 'NEAR_DUPLICATE';

-- AddColumn: matchReason — short human-readable explanation for the UI
ALTER TABLE "FeedbackDuplicateSuggestion"
  ADD COLUMN IF NOT EXISTS "matchReason" TEXT;

-- AddColumn: hybridScore — the composite score used for the match decision (0-1)
ALTER TABLE "FeedbackDuplicateSuggestion"
  ADD COLUMN IF NOT EXISTS "hybridScore" DOUBLE PRECISION;

-- Index on matchType for efficient filtering of EXACT_DUPLICATE vs NEAR_DUPLICATE
CREATE INDEX IF NOT EXISTS "FeedbackDuplicateSuggestion_matchType_idx"
  ON "FeedbackDuplicateSuggestion" ("matchType");

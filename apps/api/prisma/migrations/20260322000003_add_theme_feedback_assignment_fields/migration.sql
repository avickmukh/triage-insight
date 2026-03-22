-- Add assignedBy (source: "manual" | "ai") and confidence (AI similarity score) to ThemeFeedback
-- These fields support the clustering pipeline: AI-assigned rows carry a confidence score,
-- while manually assigned rows default to "manual" with null confidence.

ALTER TABLE "ThemeFeedback"
  ADD COLUMN "assignedBy" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "confidence" DOUBLE PRECISION;

-- Index for filtering by assignment source (e.g. show only AI-assigned feedback)
CREATE INDEX "ThemeFeedback_assignedBy_idx" ON "ThemeFeedback"("assignedBy");

-- Migration: add Roadmap Intelligence fields
-- Adds confidenceScore, revenueImpactScore, and signalCount to RoadmapItem

ALTER TABLE "RoadmapItem"
  ADD COLUMN IF NOT EXISTS "confidenceScore"    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "revenueImpactScore" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "signalCount"        INTEGER NOT NULL DEFAULT 0;

-- Index for sorting by intelligence scores
CREATE INDEX IF NOT EXISTS "RoadmapItem_priorityScore_idx"     ON "RoadmapItem" ("priorityScore");
CREATE INDEX IF NOT EXISTS "RoadmapItem_confidenceScore_idx"   ON "RoadmapItem" ("confidenceScore");

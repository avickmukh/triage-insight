-- Add PROVISIONAL and STABLE values to ThemeStatus enum
-- These are new lifecycle states for the adaptive clustering engine.
-- Existing themes remain AI_GENERATED (no data migration needed).

ALTER TYPE "ThemeStatus" ADD VALUE IF NOT EXISTS 'PROVISIONAL';
ALTER TYPE "ThemeStatus" ADD VALUE IF NOT EXISTS 'STABLE';

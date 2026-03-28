-- Migration: Add sentiment fields to SupportTicket and SupportIssueCluster
-- Adds lexicon-based sentiment scoring and cluster-level sentiment aggregates

-- SupportTicket: per-ticket sentiment score
ALTER TABLE "SupportTicket"
  ADD COLUMN IF NOT EXISTS "sentimentScore" DOUBLE PRECISION;

COMMENT ON COLUMN "SupportTicket"."sentimentScore" IS
  'Lexicon-based sentiment: -1.0 (very negative) to +1.0 (very positive). NULL until scored.';

-- SupportIssueCluster: aggregated sentiment + spike flag
ALTER TABLE "SupportIssueCluster"
  ADD COLUMN IF NOT EXISTS "avgSentiment"      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "negativeTicketPct" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "hasActiveSpike"    BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN "SupportIssueCluster"."avgSentiment"      IS 'Average sentimentScore across all tickets in this cluster.';
COMMENT ON COLUMN "SupportIssueCluster"."negativeTicketPct" IS 'Fraction of tickets with sentimentScore < -0.2 (0–1).';
COMMENT ON COLUMN "SupportIssueCluster"."hasActiveSpike"    IS 'Denormalised flag: true when an IssueSpikeEvent exists within the last 7 days.';

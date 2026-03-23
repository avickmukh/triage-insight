-- Migration: Integration Framework Hardening
-- Adds IntegrationStatus and IntegrationHealthState enums
-- Adds status, healthState, lastErrorAt, lastErrorMessage, createdBy fields to IntegrationConnection

-- Create enums
CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'DISCONNECTED', 'ERROR', 'SYNCING');
CREATE TYPE "IntegrationHealthState" AS ENUM ('OK', 'ERROR', 'SYNCING', 'UNKNOWN');

-- Add new columns to IntegrationConnection
ALTER TABLE "IntegrationConnection"
  ADD COLUMN "status"           "IntegrationStatus"      NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "healthState"      "IntegrationHealthState" NOT NULL DEFAULT 'OK',
  ADD COLUMN "lastErrorAt"      TIMESTAMP(3),
  ADD COLUMN "lastErrorMessage" TEXT,
  ADD COLUMN "createdBy"        TEXT;

-- Add index on status
CREATE INDEX "IntegrationConnection_status_idx" ON "IntegrationConnection"("status");

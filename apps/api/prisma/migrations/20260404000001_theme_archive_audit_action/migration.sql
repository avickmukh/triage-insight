-- Add THEME_ARCHIVE value to AuditLogAction enum
ALTER TYPE "AuditLogAction" ADD VALUE IF NOT EXISTS 'THEME_ARCHIVE';

-- Migration: add_password_version
-- Adds a passwordVersion column to User and PortalUser tables.
--
-- passwordVersion tracks the password hashing scheme:
--   0 = legacy: bcrypt(rawPassword)          — existing accounts before this migration
--   1 = new:    bcrypt(sha256(rawPassword))   — accounts created/updated after this migration
--
-- All existing rows default to 0 (legacy). On their next successful login,
-- the backend will silently upgrade their hash to version 1.
-- No user data is lost and no user is locked out.

ALTER TABLE "User" ADD COLUMN "passwordVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "PortalUser" ADD COLUMN "passwordVersion" INTEGER DEFAULT 0;

-- CreateEnum
CREATE TYPE "DomainVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'FAILED');

-- AlterTable
ALTER TABLE "Workspace"
  ADD COLUMN "customDomain"             TEXT,
  ADD COLUMN "domainVerificationStatus" "DomainVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "domainVerificationToken"  TEXT,
  ADD COLUMN "domainLastCheckedAt"      TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_customDomain_key" ON "Workspace"("customDomain");

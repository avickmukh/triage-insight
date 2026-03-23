-- AlterTable
ALTER TABLE "Feedback" ADD COLUMN     "urgencySignal" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "voteVelocity" DOUBLE PRECISION DEFAULT 0;

-- AlterTable
ALTER TABLE "PrioritizationSettings" ADD COLUMN     "demandStrengthWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.30,
ADD COLUMN     "revenueImpactWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.35,
ADD COLUMN     "strategicImportanceWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.20,
ADD COLUMN     "urgencySignalWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.15;

-- AlterTable
ALTER TABLE "Theme" ADD COLUMN     "manualOverrideScore" DOUBLE PRECISION,
ADD COLUMN     "overrideReason" TEXT,
ADD COLUMN     "revenueScore" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "strategicTag" TEXT,
ADD COLUMN     "urgencyScore" DOUBLE PRECISION DEFAULT 0;

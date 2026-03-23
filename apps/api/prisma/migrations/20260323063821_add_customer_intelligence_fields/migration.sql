-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "accountOwner" TEXT,
ADD COLUMN     "churnRisk" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "mrrValue" DOUBLE PRECISION DEFAULT 0;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "expectedCloseDate" TIMESTAMP(3),
ADD COLUMN     "influenceWeight" DOUBLE PRECISION NOT NULL DEFAULT 1.0;

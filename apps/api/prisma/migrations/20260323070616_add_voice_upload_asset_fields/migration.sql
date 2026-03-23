-- AlterTable
ALTER TABLE "UploadAsset" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "dealId" TEXT,
ADD COLUMN     "durationSeconds" DOUBLE PRECISION,
ADD COLUMN     "label" TEXT;

-- CreateIndex
CREATE INDEX "UploadAsset_customerId_idx" ON "UploadAsset"("customerId");

-- CreateIndex
CREATE INDEX "UploadAsset_dealId_idx" ON "UploadAsset"("dealId");

-- AddForeignKey
ALTER TABLE "UploadAsset" ADD CONSTRAINT "UploadAsset_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadAsset" ADD CONSTRAINT "UploadAsset_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

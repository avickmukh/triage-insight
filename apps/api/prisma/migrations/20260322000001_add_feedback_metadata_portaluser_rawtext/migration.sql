-- AlterTable: add portalUserId, rawText, and metadata to Feedback
ALTER TABLE "Feedback"
  ADD COLUMN "portalUserId" TEXT,
  ADD COLUMN "rawText"      TEXT,
  ADD COLUMN "metadata"     JSONB;

-- CreateIndex: Feedback_portalUserId_idx
CREATE INDEX "Feedback_portalUserId_idx" ON "Feedback"("portalUserId");

-- AddForeignKey: Feedback.portalUserId → PortalUser.id
ALTER TABLE "Feedback"
  ADD CONSTRAINT "Feedback_portalUserId_fkey"
  FOREIGN KEY ("portalUserId")
  REFERENCES "PortalUser"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

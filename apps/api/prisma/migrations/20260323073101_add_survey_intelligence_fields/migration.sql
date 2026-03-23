-- CreateEnum
CREATE TYPE "SurveyType" AS ENUM ('NPS', 'CSAT', 'FEATURE_VALIDATION', 'ROADMAP_VALIDATION', 'OPEN_INSIGHT', 'CUSTOM');

-- AlterTable
ALTER TABLE "Survey" ADD COLUMN     "customerSegment" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "insightScore" DOUBLE PRECISION,
ADD COLUMN     "linkedRoadmapItemId" TEXT,
ADD COLUMN     "linkedThemeId" TEXT,
ADD COLUMN     "surveyType" "SurveyType" NOT NULL DEFAULT 'CUSTOM';

-- AlterTable
ALTER TABLE "SurveyResponse" ADD COLUMN     "anonymousId" TEXT,
ADD COLUMN     "ciqWeight" DOUBLE PRECISION,
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "sentimentScore" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "Survey_surveyType_idx" ON "Survey"("surveyType");

-- CreateIndex
CREATE INDEX "SurveyResponse_customerId_idx" ON "SurveyResponse"("customerId");

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

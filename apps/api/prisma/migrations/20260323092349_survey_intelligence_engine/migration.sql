-- AlterEnum
ALTER TYPE "SurveyType" ADD VALUE 'CHURN_SIGNAL';

-- AlterTable
ALTER TABLE "Survey" ADD COLUMN     "linkedRoadmapIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "linkedThemeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "responseClusterSummary" JSONB,
ADD COLUMN     "revenueWeightedScore" DOUBLE PRECISION,
ADD COLUMN     "targetSegment" TEXT,
ADD COLUMN     "validationScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "SurveyResponse" ADD COLUMN     "clusterLabel" TEXT,
ADD COLUMN     "revenueWeight" DOUBLE PRECISION;

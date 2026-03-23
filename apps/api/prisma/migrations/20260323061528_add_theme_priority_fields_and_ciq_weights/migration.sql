/*
  Warnings:

  - The values [STARTER,ENTERPRISE] on the enum `BillingPlan` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "SurveyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SurveyQuestionType" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'RATING', 'NPS');

-- AlterEnum
BEGIN;
CREATE TYPE "BillingPlan_new" AS ENUM ('FREE', 'PRO', 'BUSINESS');
ALTER TABLE "public"."Workspace" ALTER COLUMN "billingPlan" DROP DEFAULT;
ALTER TABLE "Workspace" ALTER COLUMN "billingPlan" TYPE "BillingPlan_new" USING ("billingPlan"::text::"BillingPlan_new");
ALTER TABLE "Plan" ALTER COLUMN "planType" TYPE "BillingPlan_new" USING ("planType"::text::"BillingPlan_new");
ALTER TYPE "BillingPlan" RENAME TO "BillingPlan_old";
ALTER TYPE "BillingPlan_new" RENAME TO "BillingPlan";
DROP TYPE "public"."BillingPlan_old";
ALTER TABLE "Workspace" ALTER COLUMN "billingPlan" SET DEFAULT 'FREE';
COMMIT;

-- AlterEnum
ALTER TYPE "FeedbackSourceType" ADD VALUE 'SURVEY';

-- DropIndex
DROP INDEX "RoadmapItem_confidenceScore_idx";

-- DropIndex
DROP INDEX "RoadmapItem_priorityScore_idx";

-- AlterTable
ALTER TABLE "Plan" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PortalUser" ADD COLUMN     "passwordHash" TEXT;

-- AlterTable
ALTER TABLE "PrioritizationSettings" ADD COLUMN     "recencyWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
ADD COLUMN     "sentimentWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
ADD COLUMN     "voteWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.15;

-- AlterTable
ALTER TABLE "Theme" ADD COLUMN     "lastScoredAt" TIMESTAMP(3),
ADD COLUMN     "priorityScore" DOUBLE PRECISION,
ADD COLUMN     "revenueInfluence" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "signalBreakdown" JSONB;

-- CreateTable
CREATE TABLE "Survey" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "SurveyStatus" NOT NULL DEFAULT 'DRAFT',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "convertToFeedback" BOOLEAN NOT NULL DEFAULT true,
    "thankYouMessage" TEXT,
    "redirectUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyQuestion" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "SurveyQuestionType" NOT NULL,
    "label" TEXT NOT NULL,
    "placeholder" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 1,
    "options" JSONB,
    "ratingMin" INTEGER DEFAULT 1,
    "ratingMax" INTEGER DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurveyQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "portalUserId" TEXT,
    "respondentEmail" TEXT,
    "respondentName" TEXT,
    "feedbackId" TEXT,
    "metadata" JSONB,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyAnswer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "textValue" TEXT,
    "numericValue" DOUBLE PRECISION,
    "choiceValues" JSONB,

    CONSTRAINT "SurveyAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Survey_workspaceId_idx" ON "Survey"("workspaceId");

-- CreateIndex
CREATE INDEX "Survey_status_idx" ON "Survey"("status");

-- CreateIndex
CREATE INDEX "SurveyQuestion_surveyId_idx" ON "SurveyQuestion"("surveyId");

-- CreateIndex
CREATE INDEX "SurveyQuestion_workspaceId_idx" ON "SurveyQuestion"("workspaceId");

-- CreateIndex
CREATE INDEX "SurveyResponse_surveyId_idx" ON "SurveyResponse"("surveyId");

-- CreateIndex
CREATE INDEX "SurveyResponse_workspaceId_idx" ON "SurveyResponse"("workspaceId");

-- CreateIndex
CREATE INDEX "SurveyResponse_portalUserId_idx" ON "SurveyResponse"("portalUserId");

-- CreateIndex
CREATE INDEX "SurveyAnswer_responseId_idx" ON "SurveyAnswer"("responseId");

-- CreateIndex
CREATE INDEX "SurveyAnswer_questionId_idx" ON "SurveyAnswer"("questionId");

-- CreateIndex
CREATE INDEX "Theme_priorityScore_idx" ON "Theme"("priorityScore");

-- AddForeignKey
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyQuestion" ADD CONSTRAINT "SurveyQuestion_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "PortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyAnswer" ADD CONSTRAINT "SurveyAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "SurveyResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyAnswer" ADD CONSTRAINT "SurveyAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "SurveyQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

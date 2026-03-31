-- Migration: add_survey_evidence
-- Adds the SurveyEvidence table to store structured survey answers
-- (SINGLE_CHOICE, MULTIPLE_CHOICE, RATING, NPS) as queryable evidence
-- without polluting the text-clustering pipeline.
--
-- Open-text answers (SHORT_TEXT, LONG_TEXT) are stored as Feedback rows
-- and enter the main AI_ANALYSIS_QUEUE. This table handles everything else.
--
-- Safe to run on live databases:
--   • Pure CREATE TABLE / CREATE INDEX — no existing table is altered.
--   • No data backfill required — only new submissions populate this table.

-- ── Create SurveyEvidence table ───────────────────────────────────────────────

CREATE TABLE "SurveyEvidence" (
    "id"              TEXT          NOT NULL,
    "workspaceId"     TEXT          NOT NULL,
    "surveyId"        TEXT          NOT NULL,
    "responseId"      TEXT          NOT NULL,
    "questionId"      TEXT          NOT NULL,
    "questionText"    TEXT          NOT NULL,
    "questionType"    "SurveyQuestionType" NOT NULL,
    "choiceValues"    JSONB,
    "numericValue"    DOUBLE PRECISION,
    "normalisedScore" DOUBLE PRECISION,
    "respondentEmail" TEXT,
    "customerId"      TEXT,
    "metadata"        JSONB,
    "createdAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyEvidence_pkey" PRIMARY KEY ("id")
);

-- ── Foreign keys ──────────────────────────────────────────────────────────────

ALTER TABLE "SurveyEvidence"
    ADD CONSTRAINT "SurveyEvidence_surveyId_fkey"
    FOREIGN KEY ("surveyId")
    REFERENCES "Survey"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SurveyEvidence"
    ADD CONSTRAINT "SurveyEvidence_responseId_fkey"
    FOREIGN KEY ("responseId")
    REFERENCES "SurveyResponse"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX "SurveyEvidence_workspaceId_idx"              ON "SurveyEvidence"("workspaceId");
CREATE INDEX "SurveyEvidence_surveyId_idx"                 ON "SurveyEvidence"("surveyId");
CREATE INDEX "SurveyEvidence_responseId_idx"               ON "SurveyEvidence"("responseId");
CREATE INDEX "SurveyEvidence_questionId_idx"               ON "SurveyEvidence"("questionId");
CREATE INDEX "SurveyEvidence_workspaceId_questionType_idx" ON "SurveyEvidence"("workspaceId", "questionType");

# Unified Source + Survey Gap Audit Report

**Date:** March 30, 2026
**Branch:** `release/survey`

## 1. Executive Summary

This audit examines the current state of the TriageInsight monorepo to identify gaps between the implemented architecture and the target design for a unified source model. The investigation confirms that while foundational components for `feedback`, `voice`, `support`, and `survey` exist, they are implemented as distinct, siloed verticals with inconsistent data flows, AI processing, and source attribution.

Key findings include:

*   **Source Model is Flat:** The system currently uses a single `FeedbackSourceType` enum, which conflates the primary source (e.g., SURVEY) with the ingestion method (e.g., CSV_IMPORT). The target `primarySource`/`secondarySource` model is not implemented.
*   **Support Tickets are Not Feedback:** Support tickets are ingested into a separate `SupportTicket` table and are **not** converted into first-class `Feedback` records. They do not enter the main AI analysis pipeline.
*   **Survey Analysis is Inconsistent:** While survey text answers are correctly converted into `Feedback` records, the AI analysis is triggered on the `SurveyResponse` itself, not the resulting `Feedback` record. Numeric survey answers (like NPS) do not enter the main CIQ scoring pipeline.
*   **Siloed Ingestion Paths:** Each source (`voice`, `survey`, `csv`) has a bespoke ingestion path that creates `Feedback` records differently, leading to inconsistent `sourceRef` and metadata.
*   **UI Gaps:** The UI lacks a unified view. The main inbox only shows `Feedback` records, and there is no dedicated source management page for generic feedback channels like email or Slack, unlike the dedicated pages for Voice, Support, and Surveys.

This report details these gaps and provides a recommended implementation order to refactor the platform toward a truly unified intelligence architecture.

## 2. Current Architecture & Data Flow

The following table summarizes the current, as-implemented data flow for each intelligence source.

| Source | Ingestion Entry Point | Backend Model(s) | AI Pipeline Entry | CIQ Signal | Frontend UI |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Feedback (Manual/CSV)** | `POST /feedback` <br> `POST /feedback/import/csv` | `Feedback` | `AI_ANALYSIS_QUEUE` (on `Feedback` creation) | Yes (via `Feedback` record) | `/app/inbox` |
| **Voice** | `POST /voice/upload` | `UploadAsset` → `Feedback` | `VOICE_TRANSCRIPTION_QUEUE` → `VOICE_EXTRACTION_QUEUE` | Yes (via `Feedback` record) | `/app/voice` |
| **Survey** | `POST /portal/.../responses` | `SurveyResponse` → `Feedback` | `SURVEY_INTELLIGENCE_QUEUE` (on `SurveyResponse` creation) | **Partial.** Text answers flow via `Feedback`, but NPS/Rating scores do not. | `/app/surveys` |
| **Support** | `POST /support/ingest` (internal) | `SupportTicket` | **None.** Tickets are clustered but not analyzed like `Feedback`. | **No.** | `/app/support` |

## 3. Gap Analysis

This section details the specific mismatches between the current implementation and the target architecture.

### 3.1. Source Attribution Model

The most significant architectural gap is the flat and incomplete source attribution model.

*   **Gap:** The `Feedback` model lacks the `primarySource` and `secondarySource` fields required by the target design.
*   **Evidence:** The Prisma schema (`apps/api/prisma/schema.prisma`, lines 653-654) shows only `sourceType: FeedbackSourceType` and `sourceRef: String?`. The `FeedbackSourceType` enum mixes primary sources (VOICE, SURVEY) with secondary/ingestion channels (CSV_IMPORT, EMAIL, SLACK, API).
*   **Impact:** It is impossible to distinguish *what* the source is (e.g., a product review) from *how* it arrived (e.g., via email). This prevents granular filtering, source-specific weighting in CIQ, and proper source management in the UI.
*   **`sourceRef` Inconsistency:** The `sourceRef` field is used inconsistently:
    *   **Voice:** Set to the `uploadAssetId`.
    *   **Survey:** Set to `survey:<surveyId>`.
    *   **CSV/Manual:** Not set.

### 3.2. Survey Ingestion & Analysis

Surveys are partially integrated but have critical gaps in their AI and CIQ processing.

*   **Gap 1: AI Pipeline Bypassed.** The AI analysis for survey responses is triggered from the `SurveyResponse` via the `SURVEY_INTELLIGENCE_QUEUE`. The standard `AI_ANALYSIS_QUEUE` for `Feedback` records is not used. This means survey-derived feedback does not get the same enrichment (e.g., duplicate detection) as other feedback.
    *   **Evidence:** `survey.service.ts` (line 501) enqueues a `SURVEY_INTELLIGENCE_QUEUE` job. The `survey-intelligence.processor.ts` performs its own analysis and then manually updates the `Feedback` record, bypassing the main pipeline.
*   **Gap 2: Grouping by Survey Title.** All text answers from a single `SurveyResponse` are concatenated into one large `Feedback` record. The title of this feedback is hardcoded to `Survey response: {survey.title}` (`survey.service.ts`, line 465).
    *   **Impact:** This prevents individual text answers from being treated as distinct pieces of feedback. If a survey contains multiple open-ended questions, they are unnaturally merged, making theme clustering less accurate.
*   **Gap 3: Numeric Signals Lost.** NPS scores, ratings, and multiple-choice answers are processed within `survey-intelligence.service.ts` but are **not** converted into signals that the main CIQ scoring engine can use. They are only used for the dashboard on the survey's specific intelligence page.
    *   **Evidence:** The `ciq.service.ts` only considers `Feedback` counts and does not have a mechanism to ingest raw numeric signals from other models like `SurveyAnswer`.

### 3.3. Support Ingestion

Support tickets are the most siloed data source.

*   **Gap:** Support tickets are ingested into the `SupportTicket` model and are **never converted into `Feedback` records**.
*   **Evidence:** `ingestion.service.ts` in the `support` module only performs an `upsert` on the `SupportTicket` table. The `correlateWithFeedback` function in `clustering.service.ts` attempts to link `SupportIssueCluster` models to existing `Theme` models via TF-IDF similarity, but this is a correlation, not a conversion. The raw ticket content never enters the main AI pipeline.
*   **Impact:** The rich text data within support tickets (customer pain points, feature requests) is completely lost to the core intelligence engine. It does not contribute to theme creation, CIQ scores, or roadmap prioritization.

### 3.4. Route & Page Gaps

*   **Gap:** There is no dedicated source management page for generic `Feedback` channels.
*   **Evidence:** The frontend routing (`apps/web/src/app/(workspace)/[orgSlug]/app/`) shows dedicated pages for `/voice`, `/support`, and `/surveys`, but not for `/feedback`. Feedback from sources like `EMAIL`, `SLACK`, `CSV_IMPORT`, and `MANUAL` can only be viewed in the unified `/inbox`.
*   **Impact:** Users lack a central place to configure and manage ingestion for channels like email forwarding or Slack connections, which are implied by the `FeedbackSourceType` enum but have no corresponding UI.

### 3.5. Inbox Filtering Gaps

*   **Gap:** The main inbox page (`/app/inbox`) allows filtering by `status` but not by `sourceType`.
*   **Evidence:** The inbox page component (`apps/web/src/app/(workspace)/[orgSlug]/app/inbox/page.tsx`) has UI tabs for `FeedbackStatus` but no dropdown or similar control for `FeedbackSourceType`. The API DTO (`query-feedback.dto.ts`) supports a `sourceType` parameter, but the frontend does not expose it.
*   **Impact:** Users cannot easily segment the inbox to view feedback from only a specific channel, such as `VOICE` or `SURVEY`.

## 4. Recommended Implementation Order

Addressing these gaps requires a phased approach, starting with the foundational data model.

1.  **Phase 1: Implement the Unified Source Model.**
    *   Add `primarySource` and `secondarySource` fields to the `Feedback` model in `schema.prisma`.
    *   Create corresponding enums for `PrimarySourceType` and `SecondarySourceType`.
    *   Backfill these new fields for all existing `Feedback` records based on the old `sourceType`.
    *   Update the `CreateFeedbackDto` and all `feedback.create()` calls to use the new two-field model.

2.  **Phase 2: Refactor Survey Ingestion.**
    *   Change the survey submission flow to create **one `Feedback` record per text answer**, not one per response.
    *   The `primarySource` should be `SURVEY`, and the `secondarySource` should be the survey type (e.g., `NPS`, `CSAT`).
    *   Remove the bespoke analysis in `survey-intelligence.processor.ts`. Instead, have the `feedback.create()` call trigger the standard `AI_ANALYSIS_QUEUE` for each new feedback record.
    *   Create a new `NumericSignal` model and a service to convert NPS/rating answers into these records, making them available to the CIQ engine.

3.  **Phase 3: Refactor Support Ingestion.**
    *   Create a new processor that listens for new `SupportTicket` records.
    *   This processor should convert each ticket (and its messages) into a `Feedback` record.
    *   The `primarySource` should be `SUPPORT`, and the `secondarySource` should be the integration provider (e.g., `ZENDESK`, `EMAIL`).
    *   This will finally bring support ticket content into the main AI pipeline.

4.  **Phase 4: Enhance the Frontend.**
    *   Add a `sourceType` filter to the inbox page.
    *   Create a new `/app/sources` page to manage ingestion channels like email and Slack.

## 5. Files & Modules Involved

| Area of Change | Key Files & Modules |
| :--- | :--- |
| **Data Model** | `apps/api/prisma/schema.prisma` |
| **Survey Refactor** | `apps/api/src/survey/services/survey.service.ts` <br> `apps/api/src/survey/processors/survey-intelligence.processor.ts` |
| **Support Refactor** | `apps/api/src/support/services/ingestion.service.ts` <br> *(New processor required)* |
| **Source Model** | `apps/api/src/feedback/dto/create-feedback.dto.ts` <br> All services that call `prisma.feedback.create()` |
| **Frontend UI** | `apps/web/src/app/(workspace)/[orgSlug]/app/inbox/page.tsx` <br> *(New `/app/sources` page required)* |


# Weekly Digest Pipeline: Initial Validation & Gap Analysis

**Version:** 1.0  
**Date:** March 28, 2026  
**Author:** Manus AI

---

## 1. Introduction

This document presents the findings from a comprehensive end-to-end audit of the TriageInsight Weekly Digest pipeline. The audit traced the entire data flow, from the scheduled job trigger in the worker to the final user interface in the web application. The goal was to validate the current implementation, identify critical gaps, and define a clear path to a robust, production-ready feature.

## 2. Overall Summary

The Weekly Digest pipeline is **partially implemented but incomplete and not yet functional**. While several key components exist—such as the scheduler, the LLM-based generation service, and a database model for storing results—they are not connected correctly. The pipeline fails at a critical step: the web application has no mechanism to fetch or display the generated digests, rendering the entire feature invisible to users.

| Pipeline Stage | Status | Summary of Findings |
| :--- | :--- | :--- |
| **1. Scheduling** | ✅ **Working** | A NestJS cron job (`DigestScheduler`) correctly runs every Sunday at 08:00 UTC and enqueues a `digest` job for each subscribed workspace. |
| **2. Job Processing** | ✅ **Working** | The `DigestProcessor` (running in the standalone worker) correctly picks up jobs and calls `DigestService.generateDigest`. Tenant isolation (`workspaceId`) is correctly handled. |
| **3. Data Inputs** | 🟡 **Partial** | The `DigestService` gathers a good range of context, including top themes, sentiment, volume, and spike events. However, it misses key CIQ signals like priority and urgency scores. |
| **4. LLM Generation** | ✅ **Working** | The service correctly calls the OpenAI API (`gpt-4.1-mini`) with a structured prompt and parses the JSON response. A rule-based fallback exists. |
| **5. Persistence** | ✅ **Working** | The generated digest, including the LLM narration and summary data, is successfully saved as a `DigestRun` record in the database. |
| **6. API Exposure** | ❌ **Broken** | **Critical Gap.** There are no `GET` endpoints in the `DigestController` to expose the generated digests to the frontend. Only a `POST /generate` endpoint exists. |
| **7. Web Visibility** | ❌ **Broken** | **Critical Gap.** The `/digest` page is a static placeholder. It has a button to *trigger* a manual generation but no code to fetch or display the latest (or historical) digests. |

## 3. Detailed Gap Analysis & Severity Rating

This section breaks down the identified gaps by severity, providing the context needed for prioritization and remediation.

### P0: Critical Gaps (Must-Fix for Functionality)

These issues make the feature completely non-functional for the end-user.

| ID | Gap | File(s) Involved | Recommended Fix |
| :--- | :--- | :--- | :--- |
| **P0-01** | **No API Endpoint to Fetch Digests** | `apps/api/src/digest/digest.controller.ts` | Add a `GET /latest` endpoint to the `DigestController` that retrieves the most recent `DigestRun` for a given `workspaceId`. |
| **P0-02** | **Web UI Does Not Display Digests** | `apps/web/src/app/(workspace)/[orgSlug]/app/digest/page.tsx` | Implement a `useQuery` hook on this page to call the new `GET /latest` endpoint. Replace the static placeholder content with a component that renders the structured digest data (`topIssues`, `emergingTrends`, etc.). |

### P1: High-Priority Gaps (Needed for Reliability & Quality)

These issues impact the quality and reliability of the generated digest.

| ID | Gap | File(s) Involved | Recommended Fix |
| :--- | :--- | :--- | :--- |
| **P1-01** | **Missing CIQ Signals in LLM Context** | `apps/api/src/digest/digest.service.ts` | Modify the `generateDigest` data gathering step to include `priorityScore` and `urgencyScore` for the top themes. |
| **P1-02** | **LLM Prompt Lacks Specificity** | `apps/api/src/digest/digest.service.ts` | Refine the user prompt in the `callLlm` method to be more prescriptive. Instruct the model to act as an executive analyst and to focus on the *why* behind the data, not just repeating the theme names. |
| **P1-03** | **No Loading or Empty State on Web** | `apps/web/src/app/(workspace)/[orgSlug]/app/digest/page.tsx` | Add proper loading and empty states to the UI. While the query is in flight, show a loading skeleton. If no digest is returned, show an intelligent empty state explaining that the first digest is scheduled for Monday. |

### P2: Medium-Priority Gaps (Nice-to-Have Improvements)

These are opportunities for improvement that can be addressed after the core functionality is in place.

| ID | Gap | File(s) Involved | Recommended Fix |
| :--- | :--- | :--- | :--- |
| **P2-01** | **Digest Email is Basic HTML** | `apps/api/src/digest/digest.service.ts` | Improve the HTML email template in `sendDigestEmail` to better match the visual style of the web UI, using cards and a clearer hierarchy. |
| **P2-02** | **No Historical Digest View** | `apps/api/src/digest/digest.controller.ts`<br>`apps/web/src/app/(workspace)/[orgSlug]/app/digest/page.tsx` | Add a `GET /history` endpoint to the controller and a UI component (e.g., a dropdown) to allow users to view past digests. |

# TriageInsight: Workspace Data Purge Readiness Audit

**Date:** March 24, 2026
**Author:** Manus AI

## 1. Executive Summary

This document provides a comprehensive audit of the TriageInsight monorepo to assess its readiness for enterprise-grade data purge functionality. The audit covers the PostgreSQL database schema, S3 file storage, pgvector embedding storage, and background job architecture.

**Overall, the system is in a strong position for implementing data purge.** The core data model is well-designed with `workspaceId` as a near-universal foreign key, and `onDelete: Cascade` is used correctly on almost all critical relationships. This means deleting a `Workspace` record will trigger a comprehensive, database-level cascade deletion of the vast majority of associated data.

However, several **critical and high-risk gaps** were identified that must be addressed before a safe purge can be implemented. The most significant risks are:

1.  **User Table is Global:** The `User` table is a global, shared resource with no `workspaceId`. Deleting a user who is a member of multiple workspaces would have catastrophic unintended consequences. A user *cannot* be deleted as part of a single workspace purge.
2.  **Orphaned Auth Tokens:** `RefreshToken` and `PasswordResetToken` are linked only to `userId`, not `workspaceId`. When a user is removed from their last workspace, these tokens are not automatically revoked, creating a potential security risk.
3.  **Shared Global Tables:** The `Plan` table is a global configuration table and is not tenant-specific, which is correct. However, `FeedbackDuplicateSuggestion` is a global table that mixes data from different workspaces, which is a critical flaw.

This report details these findings and provides a clear, actionable MVP plan to address them.

## 2. Schema Ownership Inventory

All 40 models in the Prisma schema were audited. The ownership status of each entity is categorized as **Direct**, **Indirect**, or **Global (No Scope)**.

| Domain | Entity | Ownership Scope | Notes |
| :--- | :--- | :--- | :--- |
| **Identity** | `User` | **Global (No Scope)** | **CRITICAL RISK.** Shared across all workspaces. |
| | `WorkspaceMember` | Direct | Links `User` to `Workspace`. Deleting a `Workspace` cascades to this. |
| | `RefreshToken` | Indirect (via `User`) | **HIGH RISK.** Not workspace-scoped. Deleting a `User` cascades. |
| | `PasswordResetToken` | Indirect (via `User`) | **HIGH RISK.** Not workspace-scoped. Deleting a `User` cascades. |
| | `PortalUser` | Direct | Securely scoped to a single workspace. |
| **Workspace** | `Workspace` | N/A | The root entity for all tenant data. |
| | `WorkspaceInvite` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| | `AuditLog` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| | `UsageMetric` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| **Billing** | `Plan` | **Global (No Scope)** | Correct. This is a global configuration table. |
| | `Invoice` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| **Feedback** | `Feedback` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| | `FeedbackAttachment` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| | `FeedbackVote` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| | `FeedbackComment` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| | `FeedbackDuplicateSuggestion` | **Global (No Scope)** | **CRITICAL RISK.** Links feedback from different workspaces. |
| **Themes** | `Theme` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| | `ThemeFeedback` | Indirect (via `Theme`, `Feedback`) | Join table. `onDelete: Cascade` from both sides. Safe. |
| **Roadmap** | `RoadmapItem` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| **Customers** | `Customer` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| | `Deal` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| | `DealThemeLink` | Indirect (via `Deal`, `Theme`) | Join table. `onDelete: Cascade` from both sides. Safe. |
| | `CustomerSignal` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| | `CustomerChurnScore` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| **Support** | `IntegrationConnection` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| | `SupportTicket` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| | `SupportIssueCluster` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| | `SupportIssueClusterMap` | Indirect (via `SupportIssueCluster`, `SupportTicket`) | Join table. `onDelete: Cascade` from both sides. Safe. |
| | `IssueSpikeEvent` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| **Surveys** | `Survey` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| | `SurveyQuestion` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| | `SurveyResponse` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| | `SurveyAnswer` | Indirect (via `SurveyResponse`, `SurveyQuestion`) | Join table. `onDelete: Cascade` from both sides. Safe. |
| **AI / System** | `AiJobLog` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| | `UploadAsset` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| | `DigestSubscription` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| | `DigestRun` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| | `PrioritizationSettings` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |
| **Platform** | `PlatformAuditLog` | Direct (nullable) | Correctly scoped. Can be linked to a workspace or be global. |
| | `WorkspaceFeatureOverride` | Direct | Securely scoped. `onDelete: Cascade` from `Workspace`. |


## 3. Storage & File Ownership Audit

**Conclusion:** File storage is well-architected for data purge.

-   **Storage Provider:** Amazon S3 is used for all file uploads.
-   **Path Namespacing:** All S3 keys are prefixed with `workspaces/{workspaceId}/`, ensuring a clear ownership boundary. This was verified in both the `S3Service` and the `VoiceService`.
    -   Feedback attachments: `workspaces/{workspaceId}/feedback/attachments/{uuid}-{fileName}`
    -   Voice uploads: `workspaces/{workspaceId}/voice/{uuid}-{fileName}`
-   **Risk:** **LOW.** The current pattern allows for simple, efficient, and safe deletion of all files belonging to a workspace by listing and deleting all objects under the `workspaces/{workspaceId}/` prefix in the S3 bucket.
-   **File-Producing Features:**
    -   Voice uploads (`VoiceService`)
    -   Feedback attachments (`S3Service`)
    -   CSV imports (processed in memory, no files stored)
    -   No other features (surveys, exports, AI artifacts) were found to be writing files to S3 at this time.

## 4. Embedding & Vector Data Audit

**Conclusion:** Embedding storage is well-architected for data purge.

-   **Storage Provider:** PostgreSQL with the `pgvector` extension is used for storing embeddings.
-   **Workspace Boundary:** All vector similarity queries, specifically in the `DuplicateDetectionService`, are **strictly scoped with a `WHERE "workspaceId" = ...` clause.**
-   **Isolation:** While all embeddings reside in the same table (`Feedback` and `SupportTicket`), the mandatory `workspaceId` filter in every query ensures that no cross-tenant data leakage can occur. This is a safe and standard multi-tenant pattern for vector data.
-   **Risk:** **LOW.** Deleting a `Feedback` or `SupportTicket` row via the database cascade will also delete its embedding vector. The queries are already safe.

## 5. Background Ingestion & Jobs Audit

**Conclusion:** Background jobs are not a significant risk, but a clear orchestration step is required during purge.

-   **Infrastructure:** BullMQ with a shared Redis instance is used for all background job queues.
-   **Job Scoping:** All identified background jobs and workers are correctly scoped to a single workspace. Every job payload includes a `workspaceId` which is used in all subsequent database and API calls.
-   **Identified Jobs:**
    -   `ai-analysis`: Feedback summary, embedding, duplicate detection.
    -   `ciq-scoring`: Scores feedback, themes, roadmap items, and deals.
    -   `support-sync`: Ingests tickets from Zendesk, Intercom, etc.
    -   `theme-clustering`: Re-clusters themes for a workspace.
    -   `prioritization`: Recomputes the prioritization engine scores.
    -   `customer-revenue-signal`: Updates theme revenue influence.
    -   `customer-signal-aggregation`: Aggregates customer CIQ scores.
    -   `dashboard-refresh`: Refreshes the dashboard cache.
    -   `slack-ingestion`: Ingests feedback from Slack.
    -   `portal-signal`: Updates theme signals from portal activity.
    -   `support-clustering`: Clusters support tickets.
    -   `spike-detection`: Detects spikes in support ticket volume.
    -   `survey-intelligence`: Processes survey responses.
    -   `voice-transcription`: Transcribes uploaded audio files.
    -   `voice-extraction`: Extracts insights from transcriptions.
-   **Risk:** **MEDIUM.** While jobs are workspace-scoped, there is a risk that a job could be in-flight *while* a workspace is being purged. This could lead to errors or, in a worst-case scenario, the job could attempt to write data back to a partially deleted workspace.
-   **Required Action:** Before initiating a workspace purge, all active and queued jobs for that `workspaceId` **must be frozen or removed** from all BullMQ queues.


## 6. Deletion Dependency Order

Based on the `onDelete: Cascade` relationships in the Prisma schema, the following is the safe and automatic deletion order when a `Workspace` is deleted. The database will handle this entire process.

1.  **Leaf & Join Tables:** `ThemeFeedback`, `DealThemeLink`, `SupportIssueClusterMap`, `SurveyAnswer` are deleted as their parent records are deleted.
2.  **Core Domain Tables:** `Feedback`, `Theme`, `RoadmapItem`, `Customer`, `Deal`, `SupportTicket`, `Survey`, etc. are all deleted. This cascades to their direct children (e.g., `Feedback` deletion cascades to `FeedbackComment`, `FeedbackVote`, `FeedbackAttachment`).
3.  **Identity & Access Tables:** `WorkspaceMember`, `WorkspaceInvite`, `PortalUser` are deleted.
4.  **System & Log Tables:** `AuditLog`, `AiJobLog`, `UsageMetric`, `UploadAsset`, `Invoice`, etc. are deleted.
5.  **Workspace Shell:** Finally, the `Workspace` record itself is deleted.

**Important:** This cascade **will not** delete `User` records, `RefreshToken`s, or `PasswordResetToken`s, as they are not directly or indirectly linked to the `Workspace` with a cascading delete relationship.

## 7. Risk Matrix & Architecture Gaps

| Risk Area | Finding | Risk Level | Impact |
| :--- | :--- | :--- | :--- |
| **Schema: User Table** | `User` table is global and not workspace-scoped. | **CRITICAL** | Cannot delete users as part of a workspace purge. Deleting a user who belongs to multiple workspaces would cause data integrity issues across other tenants. |
| **Schema: Auth Tokens** | `RefreshToken` and `PasswordResetToken` are linked to `userId` only. | **HIGH** | When a user is removed from their last workspace, their auth tokens are not revoked, leaving a potential security vulnerability. |
| **Schema: Duplicate Suggestions** | `FeedbackDuplicateSuggestion` links feedback across workspaces. | **CRITICAL** | This table mixes tenant data. A purge would leave orphaned suggestions pointing to non-existent feedback, and it prevents a clean data boundary. |
| **Background Jobs** | Jobs may be in-flight during a purge. | **MEDIUM** | Could cause job failures or attempts to write to a partially deleted workspace. Requires orchestration to freeze jobs before purge. |
| **Storage (S3)** | S3 keys are correctly namespaced with `workspaces/{workspaceId}/`. | **LOW** | Safe for purge. |
| **Embeddings (pgvector)** | All vector queries are correctly scoped with a `WHERE "workspaceId" = ...` clause. | **LOW** | Safe for purge. |
| **Analytics** | No third-party analytics services (Mixpanel, Segment, etc.) were found. Internal `UsageMetric` table is correctly scoped. | **LOW** | Safe for purge. |
| **Audit Trail** | `AuditLog` is correctly scoped. `PlatformAuditLog` is correctly designed for platform-level actions. | **LOW** | Safe for purge. |

## 8. MVP Purge Readiness Score

| Category | Readiness Score | Notes |
| :--- | :--- | :--- |
| **Schema Readiness** | 6 / 10 | Strong foundation with `workspaceId` and cascades, but critical gaps in `User`, `RefreshToken`, and `FeedbackDuplicateSuggestion` tables prevent a safe purge. |
| **Storage Readiness** | 10 / 10 | Excellent. S3 paths are perfectly namespaced. |
| **Embedding Readiness** | 10 / 10 | Excellent. All vector queries are properly isolated. |
| **Background Job Readiness** | 8 / 10 | Good. All jobs are workspace-scoped, but require a pre-purge freeze mechanism. |
| **Overall Purge Readiness** | **7 / 10** | The architecture is fundamentally sound, but the identified schema risks are blockers that must be fixed before any purge functionality is built. |


## 9. Actionable MVP Plan

To achieve enterprise-grade data purge readiness, the following minimal changes are required. These focus on fixing the identified gaps without over-engineering.

### Step 1: Isolate User Memberships (The `User` Problem)

-   **Do NOT add `workspaceId` to the `User` table.** This would break the global user identity model.
-   **The Fix:** The current `WorkspaceMember` table is the correct place to manage the relationship. The purge process must be designed to **delete the `WorkspaceMember` record, not the `User` record.**
-   **Orphaned User Cleanup:** A separate, asynchronous process should be created to periodically scan for `User` records that have zero `WorkspaceMember` memberships. These are orphaned users who no longer belong to any workspace and can be safely deleted or anonymized.

### Step 2: Fix Auth Token Handling

-   **The Fix:** When a `WorkspaceMember` is deleted, and it is the user's *last* membership, all associated `RefreshToken` and `PasswordResetToken` records for that `userId` must be explicitly revoked or deleted.
-   **Implementation:** This logic should be added to the user removal/workspace departure service layer.

### Step 3: Fix the `FeedbackDuplicateSuggestion` Table

-   **The Fix:** Add `workspaceId` to the `FeedbackDuplicateSuggestion` table.
-   **Implementation:**
    1.  Add `workspaceId String` to the model.
    2.  Update the duplicate detection service to populate this field.
    3.  Add a `@@index([workspaceId])` to the model.
    4.  The existing `onDelete: Cascade` from the `Feedback` relations will now correctly handle deletion.

### Step 4: Implement a Pre-Purge Job Freeze

-   **The Fix:** Create a service that can pause and clear all jobs for a specific `workspaceId` from all BullMQ queues.
-   **Implementation:** This service will iterate through all registered queues, get all waiting and active jobs, and remove those that match the target `workspaceId`.

### Step 5: Deletion Orchestration Strategy

With the above fixes in place, the safe purge orchestration is as follows:

1.  **API Endpoint:** Create a new, SUPER_ADMIN-only API endpoint: `DELETE /platform/workspaces/{workspaceId}`.
2.  **Freeze Jobs:** The first step in this endpoint's service is to call the job freeze service (Step 4) to clear all in-flight and queued jobs for the target `workspaceId`.
3.  **Delete S3 Files:** List all objects in the S3 bucket under the `workspaces/{workspaceId}/` prefix and perform a bulk deletion.
4.  **Delete Database Records:** Delete the `Workspace` record from the database: `prisma.workspace.delete({ where: { id: workspaceId } })`. The `onDelete: Cascade` constraints will handle the deletion of all directly and indirectly linked data.
5.  **Trigger Orphan User Cleanup:** After the workspace is deleted, trigger the orphaned user cleanup process (Step 1) to handle any users who may now be orphaned.

This plan addresses all identified risks and provides a clear, minimal path to implementing a safe, reliable, and enterprise-grade data purge capability.

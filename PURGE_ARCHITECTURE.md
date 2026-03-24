# TriageInsight: Workspace Data Purge System Architecture

**Date:** March 24, 2026
**Author:** Manus AI

## 1. Introduction

This document outlines the production-ready, MVP-scoped architecture for a Workspace Data Purge System in TriageInsight. The design is grounded in the findings of the **Workspace Data Purge Readiness Audit** and is aligned with the existing monorepo structure, technology stack (NestJS, Prisma, BullMQ, S3), and multi-tenant deployment model.

### Guiding Principles

-   **Safety First:** The system must be designed to prevent accidental data deletion or cross-tenant data leakage at all costs.
-   **Auditability:** Every step of the purge process must be logged and auditable for compliance.
-   **Resilience:** The system must be idempotent and retryable, gracefully handling partial failures.
-   **MVP Scope:** The design focuses on the minimal viable changes required to deliver a safe and compliant purge capability, deferring non-essential features like data export.

## 2. Purge Lifecycle Design

A new `WorkspaceDeletionRequest` model will be added to the Prisma schema to manage the state machine of a purge. This provides a persistent, auditable record of the entire lifecycle.

### State Machine Diagram (Textual)

```
[DRAFT] -> [REQUESTED] -> [APPROVED] -> [SCHEDULED] -> [IN_PROGRESS] -> [COMPLETED]
   |           |             |             |              |                |
   |           |             |             |              +-> [FAILED]
   |           |             |             |
   |           |             +-> [CANCELLED]
   |           |
   +-> [DELETED]
```

### State Definitions & Transitions

| State | Description | Triggered By | Validations |
| :--- | :--- | :--- | :--- |
| `DRAFT` | Initial state. A request has been created but not yet submitted. | Platform Admin | None. |
| `REQUESTED` | A formal request for deletion has been submitted. | Platform Admin | Workspace must exist and not already have an active deletion request. |
| `APPROVED` | The request has been approved by a second Platform Admin (four-eyes principle). | Platform Admin | Request must be in `REQUESTED` state. Approver cannot be the requester. |
| `SCHEDULED` | The purge has been scheduled to run after a mandatory cooling-off period (e.g., 7 days). | System (automated) | Request must be in `APPROVED` state. |
| `IN_PROGRESS` | The purge orchestrator has picked up the job and is actively deleting data. | System (Purge Worker) | Request must be in `SCHEDULED` state and the scheduled time must have passed. |
| `COMPLETED` | All purge steps have completed successfully. The workspace data is gone. | System (Purge Worker) | All orchestrator steps must report success. |
| `FAILED` | An unrecoverable error occurred during the purge. Requires manual intervention. | System (Purge Worker) | Any orchestrator step reports a terminal failure. |
| `CANCELLED` | The deletion request was cancelled before the purge began. | Platform Admin | Can be triggered from `REQUESTED`, `APPROVED`, or `SCHEDULED` states. |
| `DELETED` | The `WorkspaceDeletionRequest` record itself is deleted after a retention period (e.g., 90 days). | System (Cleanup Job) | Request must be in `COMPLETED` or `CANCELLED` state. |

### Failure & Cancellation Handling

-   **Cancellation:** If a request is cancelled, the `WorkspaceDeletionRequest` status is updated to `CANCELLED`. The workspace is immediately returned to normal operation. The freeze is lifted.
-   **Failure:** If a step fails, the orchestrator will retry based on its idempotency strategy. If all retries fail, the request is moved to the `FAILED` state. The workspace remains in a **frozen, read-only state**, and an alert is sent to the platform engineering team for manual investigation. No further automated actions will be taken.


## 3. Workspace Freeze Design

Before any destructive operations can begin, the target workspace must be "frozen" to prevent new data from arriving and to stop in-flight operations that could conflict with the purge.

### Freeze Flag

-   **Location:** A new field, `status`, will be added to the `Workspace` model in `schema.prisma`.
    ```prisma
    enum WorkspaceStatus {
      ACTIVE
      FROZEN
      DELETED
    }

    model Workspace {
      // ... existing fields
      status WorkspaceStatus @default(ACTIVE)
    }
    ```
-   **Rationale:** Placing the flag directly on the `Workspace` table makes it the canonical source of truth. It is easily accessible to all services without requiring extra lookups.

### Freeze Mechanism

When a workspace is moved to the `FROZEN` state, the following systems must respect the flag:

1.  **API Gateway / Middleware:** A global middleware will be updated to check the `workspace.status`. If the status is `FROZEN`, it will reject any request that is not a `GET` request, with the exception of platform-admin-only routes. This immediately makes the workspace read-only for all non-admin users.
2.  **Background Job Ingestion:** The entry point for all background job creation (e.g., in the `FeedbackService` when a new feedback item is created) will check the workspace status. If `FROZEN`, it will not enqueue any new jobs for that workspace.
3.  **Third-Party Ingestion Webhooks:** Webhook handlers (e.g., for Stripe, Zendesk, Slack) will perform the same check and immediately return a success status to the provider without processing the event, preventing retries.

### Race Condition Handling

-   The primary race condition is a job being enqueued moments before the workspace is frozen. To handle this, the **Purge Orchestrator** (see next section) will perform a final, authoritative sweep to clear all BullMQ queues of any jobs related to the `workspaceId` *after* the freeze flag has been set.

## 4. Deletion Orchestration Architecture

The purge process will be managed by a new, dedicated BullMQ queue and worker, ensuring it is isolated, retryable, and auditable.

### New Purge Module

-   **Location:** `apps/api/src/purge`
-   **Components:**
    -   `purge.module.ts`: NestJS module definition.
    -   `purge.controller.ts`: A new `PlatformAdmin`-only controller with the `DELETE /platform/workspaces/{workspaceId}` endpoint.
    -   `purge.service.ts`: The main service that validates the request and enqueues the top-level purge job.
    -   `purge.worker.ts`: The BullMQ worker that processes the purge jobs.
    -   `steps/`: A directory containing individual, idempotent deletion step services (e.g., `s3-purge.step.ts`, `db-purge.step.ts`).

### Orchestration Flow (Idempotent & Retryable)

The `PurgeWorker` will execute a series of steps. Each step is designed to be independently retryable.

```
1.  **BEGIN PURGE JOB** (workspaceId)
2.      Log: "Purge job started."
3.      Step 1: **Freeze Workspace**
4.          - Set `workspace.status` to `FROZEN`.
5.          - If this fails, retry. If it's already frozen, succeed.
6.      Step 2: **Clear Background Queues**
7.          - Iterate all BullMQ queues and remove any job where `job.data.workspaceId` matches.
8.          - If this fails, retry. It is safe to run multiple times.
9.      Step 3: **Purge S3 Storage**
10.         - List all objects under `workspaces/{workspaceId}/`.
11.         - Delete objects in batches of 1000.
12.         - Track deleted keys. If a batch fails, retry deleting only the remaining keys.
13.     Step 4: **Purge Database**
14.         - Execute `prisma.workspace.delete({ where: { id: workspaceId } })`.
15.         - This is a single, transactional operation. The database's `onDelete: Cascade` handles the rest.
16.         - If it fails (e.g., timeout), it can be safely retried. If the workspace is already gone, succeed.
17.     Step 5: **Finalize Purge Request**
18.         - Update `WorkspaceDeletionRequest` status to `COMPLETED`.
19.         - Log: "Purge job completed successfully."
20. **END PURGE JOB**
```

### Progress & State Tracking

-   The `WorkspaceDeletionRequest` entity will be updated at the start and end of the process.
-   A new `PurgeAuditLog` entity will be created to log the success or failure of each individual step (Freeze, Clear Queues, S3, DB). This provides a detailed, granular audit trail for debugging and compliance.


## 5. Database Purge Design

The database purge strategy relies heavily on the `onDelete: Cascade` feature of Prisma and PostgreSQL, which is both efficient and safe.

### Primary Strategy: Cascade Deletion

-   The core of the database purge is a single command: `prisma.workspace.delete({ where: { id: workspaceId } })`.
-   As established in the audit, **35 out of 40 tables** are directly or indirectly linked to the `Workspace` with a cascading delete constraint. The database itself will handle the complex dependency graph, ensuring a transactionally consistent and complete deletion of all workspace-owned data.

### Handling Gaps & Edge Cases

The audit identified three critical gaps that must be addressed *before* the purge can be considered safe. The purge design assumes the **Actionable MVP Plan** from the audit has been implemented.

| Domain | Entity / Issue | Purge Strategy |
| :--- | :--- | :--- |
| **Identity** | `User` records | **DO NOT DELETE.** The purge deletes the `WorkspaceMember` link, not the global `User`. An offline job will handle orphaned user cleanup later. |
| | `RefreshToken`, `PasswordResetToken` | **EXPLICIT DELETE.** Before the main cascade, the orchestrator will explicitly delete tokens belonging to users who are *only* members of the workspace being purged. |
| **Feedback** | `FeedbackDuplicateSuggestion` | **CASCADE (Post-Fix).** After adding `workspaceId` to this table (as recommended in the audit), it will be safely deleted by the main cascade. |

### Performance: Avoiding Locks & Timeouts

-   For small to medium tenants, a single `DELETE` transaction is efficient. PostgreSQL is highly optimized for cascading deletes.
-   For very large tenants (e.g., >10M feedback items), a single massive transaction could cause table-level locks and timeouts. The strategy for this is **batching at the source.** Instead of one `prisma.workspace.delete()`, the orchestrator would first run batched deletes on the highest-volume tables (`Feedback`, `SupportTicket`) before the final cascade.
    ```typescript
    // Example for a very large tenant
    await batchDelete(prisma.feedback, { workspaceId });
    await batchDelete(prisma.supportTicket, { workspaceId });
    await prisma.workspace.delete({ where: { id: workspaceId } }); // Cleans up the rest
    ```

## 6. Storage (S3) Purge Design

The S3 purge is straightforward due to the clean `workspaces/{workspaceId}/` key prefix.

### Deletion Flow

1.  **Discovery:** The orchestrator uses the AWS S3 SDK to list all objects with the prefix `workspaces/{workspaceId}/`.
2.  **Batch Deletion:** The `DeleteObjects` API call is used to delete up to 1000 objects per request. The orchestrator will loop through the list of discovered keys and send batched delete requests.
3.  **Verification:** Each `DeleteObjects` call returns a list of successfully deleted objects and a list of errors. The orchestrator logs these.
4.  **Retries:** If a batch fails, the orchestrator will retry deleting that specific batch. If an object repeatedly fails to delete, it is logged for manual investigation, and the purge is moved to the `FAILED` state.
5.  **Legacy Paths:** The system does not currently have legacy paths. If any were discovered in the future, a list of known legacy prefixes would be added to the discovery step.

## 7. Embedding (pgvector) Purge Design

**Conclusion:** No special action is required.

-   **Deletion Strategy:** The embeddings are stored in a `vector` column directly on the `Feedback` and `SupportTicket` tables.
-   **Safety:** Because these tables have a direct `workspaceId` and are part of the `onDelete: Cascade` chain, deleting the parent `Workspace` will automatically and safely delete the rows containing the embeddings.
-   **No Cross-Tenant Risk:** As confirmed in the audit, all vector similarity search queries are already protected by a `WHERE "workspaceId" = ...` clause, so there is no risk of data leakage during normal operation or during a purge.


## 8. Auditability Design

Auditability is a core principle of the purge system. The design includes two new models to provide a complete and compliant audit trail.

### New Prisma Models

```prisma
// In schema.prisma

model WorkspaceDeletionRequest {
  id          String   @id @default(cuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id])

  status      WorkspaceDeletionStatus @default(DRAFT)
  
  requestedById String?
  requestedBy   User?    @relation("RequestedByUser", fields: [requestedById], references: [id])
  approvedById  String?
  approvedBy    User?    @relation("ApprovedByUser", fields: [approvedById], references: [id])

  scheduledFor DateTime?
  completedAt  DateTime?
  failedAt     DateTime?

  auditLog    PurgeAuditLog[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model PurgeAuditLog {
  id          String   @id @default(cuid())
  requestId   String
  request     WorkspaceDeletionRequest @relation(fields: [requestId], references: [id])

  step        String   // e.g., "FREEZE_WORKSPACE", "PURGE_S3_OBJECTS"
  status      PurgeStepStatus // SUCCESS, FAILED
  message     String   // Log message, error details
  metadata    Json?    // e.g., { deletedKeys: 1024, failedKeys: 2 }

  createdAt   DateTime @default(now())
}

enum WorkspaceDeletionStatus {
  DRAFT
  REQUESTED
  APPROVED
  SCHEDULED
  IN_PROGRESS
  COMPLETED
  FAILED
  CANCELLED
}

enum PurgeStepStatus {
  SUCCESS
  FAILED
}
```

### Platform Admin Visibility

-   A new section in the Platform Admin UI will be created to manage `WorkspaceDeletionRequest` entities.
-   This UI will allow admins to:
    -   Create, approve, and cancel requests.
    -   View the current status of all requests.
    -   Drill down into the `PurgeAuditLog` for a specific request to see the detailed step-by-step execution and any errors.

### Compliance Reporting

-   The data from these tables can be easily exported as a CSV or JSON file to provide a **Certificate of Deletion** to enterprise customers, detailing what was deleted and when.

## 9. Export-Before-Delete Architecture (Design Only)

While not in the MVP scope for implementation, the purge lifecycle is designed to accommodate a future data export feature.

### Export Integration

-   **New Lifecycle States:** Two new states would be added to the `WorkspaceDeletionStatus` enum: `EXPORT_IN_PROGRESS` and `EXPORT_READY`.
-   **Orchestration Flow:**
    1.  After a request is `APPROVED`, it moves to `EXPORT_IN_PROGRESS`.
    2.  A new BullMQ worker, the **Export Worker**, is triggered.
    3.  The Export Worker queries all workspace data and serializes it into a chosen format (e.g., JSONL, CSV).
    4.  The exported data is packaged into a `.zip` archive and uploaded to a secure, temporary S3 location with a signed, short-lived URL.
    5.  Upon successful export, the request moves to `EXPORT_READY`, and the Platform Admin is notified with the download link.
    6.  The link is valid for a limited time (e.g., 72 hours). After the admin confirms the download, they can manually advance the request to the `SCHEDULED` state to begin the purge.

### Export Formats

-   **MVP:** A simple collection of JSONL files (one per database table) is the most straightforward and comprehensive format.
-   **Future:** A more user-friendly format like a collection of CSV files could be offered.


## 10. Deployment Mode Abstraction

The purge system is designed with an abstraction layer to support different deployment models with minimal code changes.

### Abstraction Layer

-   The core logic is encapsulated in the `PurgeService` and `PurgeWorker`.
-   A **Strategy Pattern** will be used to define the specific deletion methods for each deployment type.

```typescript
// apps/api/src/purge/strategies/purge.strategy.ts
interface IPurgeStrategy {
  purgeDatabase(workspaceId: string): Promise<void>;
  purgeStorage(workspaceId: string): Promise<void>;
}
```

### Deployment Strategies

| Mode | Strategy Implementation | `purgeDatabase(workspaceId)` | `purgeStorage(workspaceId)` |
| :--- | :--- | :--- | :--- |
| **Shared SaaS** | `SharedSaaSStrategy` | Executes `prisma.workspace.delete({ where: { id: workspaceId } })`. | Deletes S3 objects under the `workspaces/{workspaceId}/` prefix. |
| **Dedicated Tenant** | `DedicatedTenantStrategy` | Drops the entire tenant-specific database. | Deletes the entire tenant-specific S3 bucket. |
| **On-Prem** | `OnPremStrategy` | Generates a SQL script (`DELETE FROM "Workspace" WHERE id = ...`) and provides it to the admin to run. | Generates a shell script with `aws s3 rm --recursive` commands for the admin to run. |

-   The appropriate strategy is chosen at runtime based on a configuration flag (`DEPLOYMENT_MODE`). This keeps the core orchestration logic clean and independent of the deployment environment.

## 11. Performance & Scale Considerations

The system is designed to scale from small tenants to very large enterprise tenants.

-   **Small Tenants (<1M records):** The default strategy of a single database transaction is the most efficient.
-   **Large Tenants (>10M records):** The orchestrator will switch to a **batched deletion strategy** for the database purge. Instead of a single `prisma.workspace.delete()`, it will first run `DELETE` commands with `LIMIT` clauses on the highest-volume tables (`Feedback`, `SupportTicket`, `AuditLog`) in a loop. This breaks the single large transaction into many smaller ones, preventing long-held locks and timeouts.
-   **Queueing & Throttling:** All purge operations are managed by a dedicated BullMQ worker. This ensures that purges are processed sequentially (one at a time by default) and can be throttled to prevent overwhelming the database or S3 API.
-   **Resource Isolation:** As a separate worker process, the purge job does not block the main API event loop, ensuring that a large purge does not impact the performance of the application for other tenants.

## 12. Security & Compliance Considerations

-   **GDPR / CCPA:** The architecture directly supports the "right to be forgotten" by providing a mechanism for complete and verifiable data erasure.
-   **Retention Window:** The lifecycle design includes a `SCHEDULED` state, which acts as a mandatory cooling-off period (e.g., 7 days). This prevents accidental immediate deletion and provides a window for cancellation.
-   **Legal Hold:** A `legalHold` boolean flag can be added to the `Workspace` model. If this flag is true, the purge endpoint will refuse to initiate a deletion request, providing a simple but effective mechanism to comply with legal requirements.
-   **Backup Awareness:** Data will still exist in database backups. The purge process only affects the live production system. Enterprise contracts must clearly state the backup retention policy (e.g., backups are aged out after 30 days).
-   **Audit Trail Integrity:** The `PurgeAuditLog` provides an immutable, append-only record of the entire process, which is critical for compliance and proving that the deletion was executed successfully.


## 13. Final Architecture Deliverables Summary

This section summarizes the core design artifacts as requested.

1.  **Purge Lifecycle Diagram:** Defined in Section 2, managed by the `WorkspaceDeletionRequest` model with states from `DRAFT` to `COMPLETED`.
2.  **Service/Module Architecture:** A new `purge` module will be created at `apps/api/src/purge`, containing the controller, service, worker, and step-wise strategy implementations.
3.  **Entity Deletion Order:** Primarily handled by `onDelete: Cascade` in the database, starting with the `Workspace` entity. Explicit pre-deletion steps are required for `RefreshToken`s and post-fix `FeedbackDuplicateSuggestion`s.
4.  **Storage Purge Flow:** List all objects with prefix `workspaces/{workspaceId}/` and execute batched `DeleteObjects` calls via the S3 SDK.
5.  **Embedding Purge Flow:** No action required. Embeddings are deleted automatically via cascade when their parent `Feedback` or `SupportTicket` records are deleted.
6.  **Worker Orchestration Design:** A dedicated BullMQ `PurgeWorker` executes a series of idempotent, retryable steps, tracking progress in the `PurgeAuditLog`.
7.  **Audit Model Design:** Two new Prisma models, `WorkspaceDeletionRequest` and `PurgeAuditLog`, provide a complete and compliant audit trail.
8.  **Export Integration Design:** The lifecycle is ready to support `EXPORT_IN_PROGRESS` and `EXPORT_READY` states, which would trigger a separate `ExportWorker` to generate a downloadable archive.
9.  **Deployment Mode Abstraction:** A Strategy Pattern (`IPurgeStrategy`) will be used to switch between `SharedSaaSStrategy`, `DedicatedTenantStrategy`, and `OnPremStrategy` based on a configuration flag.
10. **Risk Considerations:** The primary risks (global `User` table, unscoped auth tokens, and `FeedbackDuplicateSuggestion` table) are addressed by the MVP fixes outlined in the audit. The purge process itself is designed to be low-risk through freezing, idempotency, and auditability.
11. **MVP Scope vs. Future Scope:**
    -   **MVP:** Implement the core purge lifecycle, freeze mechanism, orchestration, and all necessary schema fixes. No data export.
    -   **Future:** Implement the data export feature, add more sophisticated UI for admins, and build out the on-prem script generation.
12. **Recommended Implementation Sequence:**
    1.  Implement the schema changes from the audit (add `workspaceId` to `FeedbackDuplicateSuggestion`, add `status` to `Workspace`, add the two new audit models).
    2.  Build the `PurgeService` and `PurgeWorker` with the core orchestration logic.
    3.  Implement the individual purge steps (Freeze, Clear Queues, S3, DB).
    4.  Build the Platform Admin UI for managing deletion requests.
    5.  Thoroughly test on staging with a variety of tenant sizes.

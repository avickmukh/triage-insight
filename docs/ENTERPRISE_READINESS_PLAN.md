# TriageInsight: Enterprise Readiness Implementation Plan

**Author:** Manus AI
**Date:** March 24, 2026
**Version:** 1.0

## Executive Summary

This document provides a practical, phased implementation plan to prepare the TriageInsight platform for enterprise customers. It synthesizes the findings from four prior architecture and audit documents into a single, actionable roadmap. The core philosophy is to achieve maximum enterprise credibility with minimal engineering overhead, ensuring that the team can maintain its launch velocity while building a foundation for future growth.

The plan defines three clear enterprise readiness levels, from "MVP Enterprise Aware" to "Full Enterprise Platform," and outlines the specific engineering tasks required to bridge the gaps between them. It prioritizes pragmatic solutions—such as fixing critical data isolation flaws and implementing a robust data purge system—over theoretical architectural purity. The immediate focus is on achieving **Level 1: MVP Enterprise Aware** within the next 30-60 days, which will provide the necessary security and compliance posture to begin conversations with mid-market and light-enterprise customers.

Key immediate actions are:

1.  **Fix the `FeedbackDuplicateSuggestion` table** by adding a `workspaceId`.
2.  **Implement an MVP of the Workspace Data Purge system**, focusing on the core orchestration and database cascade.
3.  **Formalize the `Deployment` model** in the schema to prepare for future dedicated tenants.

This plan is designed for founders, providing a clear guide on what to build now, what to prepare for, and what to safely ignore until a paying enterprise customer asks for it.

---

## 1. Enterprise Readiness Scorecard (Current State)

This scorecard provides a snapshot of TriageInsight's current maturity across key enterprise-readiness domains, based on the comprehensive audits performed.

| Domain | Maturity (0–10) | Summary | Key Blocker |
| :--- | :--- | :--- | :--- |
| **Data Isolation** | 6 / 10 | Strong `workspaceId` usage, but critical gaps exist. | `FeedbackDuplicateSuggestion` table mixes tenant data. |
| **Purge Readiness** | 7 / 10 | Excellent foundation with `onDelete: Cascade`, but blocked by schema gaps. | `User` table is global; cannot be deleted per-workspace. |
| **Storage Isolation** | 10 / 10 | Perfect. All S3 keys are prefixed with `workspaces/{workspaceId}/`. | None. |
| **Embedding Isolation** | 10 / 10 | Perfect. All `pgvector` queries are correctly filtered by `workspaceId`. | None. |
| **Job Isolation** | 8 / 10 | Good. All BullMQ jobs are scoped by `workspaceId` in their payloads. | No pre-purge job freeze mechanism exists. |
| **Auth & Identity** | 7 / 10 | Solid JWT implementation, but identity is global. | `User` table is shared; no clear path for tenant-specific IdP. |
| **Deployment Flexibility** | 3 / 10 | Monolithic. The entire system assumes a single, shared SaaS deployment. | Hardcoded single-instance clients (`Prisma`, `S3`, `Redis`). |
| **Security Posture** | 7 / 10 | Standard SaaS security, but secrets are shared across tenants. | Global `.env` file for all API keys and credentials. |
| **Compliance Posture** | 5 / 10 | Foundational pieces (audit logs, purge capability) exist but are not production-hardened. | No export-before-delete; purge audit trail is not yet built. |

## 2. Enterprise Readiness Level Definitions

| Level | Title | Description | Key Capabilities |
| :--- | :--- | :--- | :--- |
| **1** | **MVP Enterprise Aware** | The baseline for earning trust with mid-market and security-conscious customers. The platform is still a shared SaaS, but it demonstrates strong data boundaries and a commitment to data lifecycle management. | • All data is strictly partitioned by `workspaceId`.<br>• A functional, audited data purge system exists.<br>• Storage and embeddings are demonstrably isolated.<br>• Basic audit trails are in place. |
| **2** | **Enterprise Pilot Ready** | The system can securely onboard its first paying enterprise customer in a dedicated environment. The architecture supports tenant-specific infrastructure and configuration. | • **Dedicated single-tenant cloud deployment is possible.**<br>• Tenant-specific databases and storage buckets.<br>• Hardened, observable data purge and export system.<br>• Tenant-specific secrets and integration credentials. |
| **3** | **Full Enterprise Platform** | The platform is ready for on-premise deployments and can meet the stringent requirements of regulated industries. The architecture is fully pluggable and observable. | • **On-premise deployment is supported.**<br>• Pluggable authentication (SAML/OIDC).<br>• Physically isolated background job workers.<br>• Comprehensive, tenant-facing observability dashboards. |

## 3. Gap Analysis to Reach Level 1 (MVP Enterprise Aware)

This section identifies the specific gaps between the current state and the requirements for **Level 1**.

| Capability | Status | Gap & Required Action |
| :--- | :--- | :--- |
| **Strict `workspaceId` Partitioning** | Partially Done | **Fix `FeedbackDuplicateSuggestion`:** This is the only remaining table that mixes tenant data. It must have a `workspaceId` column added, and all queries against it must be updated. |
| **Functional Data Purge System** | Not Started | **Implement MVP Purge:** The full purge system (architecture, implementation plan) has been designed but not built. The MVP involves building the core orchestration, database cascade, and S3 deletion steps. |
| **Correct User/Auth Lifecycle** | Partially Done | **Fix User Deletion Logic:** The purge system must not delete from the global `User` table. It must delete the `WorkspaceMember` record. **Fix Token Revocation:** The system must explicitly revoke `RefreshToken`s when a user's last membership is removed. |
| **Storage Isolation** | **Done** | No gaps. S3 prefix isolation is already implemented correctly. |
| **Embedding Isolation** | **Done** | No gaps. Vector queries are already isolated correctly. |
| **Background Job Freeze** | Not Started | **Implement Job Freeze:** The purge orchestrator needs a step to freeze/drain all pending BullMQ jobs for a workspace before starting the deletion. |
| **Basic Audit Trail** | Partially Done | The `AuditLog` table exists and is correctly scoped. However, it needs to be integrated into the purge process to log deletion requests and outcomes. |

## 4. Phased Implementation Roadmap

This roadmap breaks down the work into four distinct, goal-oriented phases.

### Phase A: Launch Critical (Next 30-60 Days)

*   **Objective:** Ship the MVP product while establishing basic enterprise credibility.
*   **Focus:** Fix the most critical data isolation flaws and implement a functional, auditable purge system.

| Domain | Task |
| :--- | :--- |
| **Data Model** | 1. Add `workspaceId` to `FeedbackDuplicateSuggestion` table.<br>2. Add `WorkspaceDeletionRequest` and `WorkspaceDeletionAuditLog` models to schema. |
| **Engineering** | 1. **Implement MVP Purge Service:** Build the core orchestration logic, the database cascade step, and the S3 prefix deletion step.<br>2. **Fix User Lifecycle:** Ensure member removal logic revokes auth tokens if it's the user's last workspace.<br>3. **Implement Job Freeze:** Add the BullMQ job drain step to the purge orchestrator. |
| **UX/Admin** | 1. Build the "Danger Zone" UI in workspace settings for requesting data purge.<br>2. Build a basic platform admin panel to approve/monitor purge requests. |
| **Security** | 1. Conduct a final review of all database queries to ensure `workspaceId` is present. |

### Phase B: Enterprise Pilot Readiness (Next 90 Days)

*   **Objective:** Safely onboard the first dedicated enterprise customer.
*   **Focus:** Introduce the deployment context abstraction and provision the first dedicated tenant.

| Domain | Task |
| :--- | :--- |
| **Data Model** | 1. Add the `Deployment` model to the Prisma schema.<br>2. Backfill all existing workspaces to belong to a default `SHARED` deployment. |
| **Engineering** | 1. **Build `DeploymentContextService`:** Implement the core logic for resolving tenant infrastructure bindings.<br>2. **Refactor Core Services:** Update `PrismaService` and `S3Service` to be context-aware and use the new resolver. |
| **Infrastructure** | 1. Create Terraform or CloudFormation scripts to provision a dedicated tenant stack (PostgreSQL, S3, Redis). |
| **UX/Admin** | 1. Build a platform admin UI for creating and managing `Deployment` records and associating them with workspaces. |

### Phase C: Scale Enterprise (6+ Months)

*   **Objective:** Support multiple large enterprise tenants with higher performance and isolation guarantees.
*   **Focus:** Harden the purge system, improve observability, and begin isolating more components.

| Domain | Task |
| :--- | :--- |
| **Engineering** | 1. **Isolate Redis:** Refactor the `QueueModule` to be context-aware and support tenant-specific Redis instances.<br>2. **Isolate Secrets:** Add an encrypted `secretsJson` field to the `Deployment` model and refactor integration services to use it. |
| **Infrastructure** | 1. Automate the dedicated tenant provisioning process.<br>2. Set up tenant-specific monitoring dashboards and alerting. |
| **Security** | 1. Implement role-based access control (RBAC) for the platform admin panel. |

### Phase D: On-Prem & Regulated Industry (Future)

*   **Objective:** Prepare the platform for self-hosted deployments and compliance-heavy industries.
*   **Focus:** Pluggable architecture and enterprise-grade security features.

| Domain | Task |
| :--- | :--- |
| **Engineering** | 1. **Pluggable Auth:** Refactor the `AuthModule` to support SAML/OIDC integration.<br>2. **Pluggable Storage:** Create an `IStorageProvider` interface to abstract S3 and support other backends. |
| **Infrastructure** | 1. Create a packaged, containerized version of the application for on-premise installation (e.g., via Docker Compose, Kubernetes Helm chart). |
| **Compliance** | 1. Formalize data export formats and retention policies.<br>2. Engage with third-party auditors for SOC 2 or ISO 27001 certification. |

## 5. Dedicated Tenant Readiness Plan

This is the step-by-step plan for achieving **Level 2** readiness.

1.  **Abstract Now: The `Deployment` Model.** The `Deployment` model and `DeploymentContextService` are the critical abstractions. They must be implemented first (Phase B). This creates the seam that allows the application to support different deployment modes without a rewrite.

2.  **Database Isolation.** Once the context service exists, supporting a dedicated database is a matter of:
    a.  Provisioning the database.
    b.  Creating a `Deployment` record with the `databaseUrl`.
    c.  Ensuring the `DeploymentContextService` can instantiate a `PrismaClient` for that connection.

3.  **Storage Isolation.** This follows the same pattern as the database. The `S3Service` must be refactored to get its configuration from the `DeploymentContextService`.

4.  **Delay Later: Worker & Secrets Isolation.** Full physical isolation of Redis and tenant-specific secrets can be deferred until Phase C. For the first enterprise pilot, it is acceptable for the shared worker fleet to process jobs for the dedicated tenant (as the jobs themselves are still logically isolated) and for the tenant to use the shared platform API keys.

## 6. Purge & Export Production Hardening

The purge system has different levels of maturity required for different audiences.

| Level | Title | Key Features |
| :--- | :--- | :--- |
| **MVP Purge** | **Functional & Auditable** | • Deletes all workspace data from the database via cascade.<br>• Deletes all workspace files from S3.<br>• Freezes the workspace and drains pending jobs before starting.<br>• Records the request and its outcome in an audit log. |
| **Enterprise-Grade Purge** | **Observable & Resilient** | • **Idempotent Steps:** Each step (DB, S3, Queues) can be safely retried on failure.<br>• **Observability:** Detailed metrics and logs for each step are sent to a monitoring system.<br>• **Large Tenant Strategy:** For workspaces with millions of records, the database deletion runs in smaller, background batches to avoid locking the entire table. |
| **Compliance-Grade Purge** | **Certified & Verifiable** | • **Export Before Delete:** A full export of the workspace data is generated and stored in a secure archive before the purge begins.<br>• **Cryptographic Deletion:** Instead of just deleting rows, sensitive fields are first overwritten with garbage data.<br>• **Third-Party Certificate:** A signed certificate of data destruction is generated and can be provided to the customer. |

For **Phase A**, the goal is to build a solid **MVP Purge**. Hardening for large tenants and compliance can be deferred to later phases.

## 7. Security & Compliance Preparation Roadmap

This is a pragmatic roadmap for a SaaS founder.

1.  **Next 30 Days (Launch Critical):**
    *   **Fix Data Isolation:** Add `workspaceId` to `FeedbackDuplicateSuggestion`. This is non-negotiable.
    *   **Implement MVP Purge:** Having a working data deletion process is a huge credibility booster.
    *   **Publish a Security Page:** A simple page on your marketing site that describes your security practices (data encryption at rest and in transit, use of reputable cloud providers, etc.).

2.  **Next 90 Days (Enterprise Pilot):**
    *   **Formalize Audit Logging:** Ensure all sensitive actions (login, user invite, workspace deletion) are logged in the `AuditLog`.
    *   **Introduce `Deployment` Model:** Begin the journey to dedicated infrastructure, which is a major security selling point.
    *   ** Harden Purge System:** Add better observability and retry logic to the purge process.

3.  **Next 6 Months (Scale Enterprise):**
    *   **Tenant-Specific Secrets:** Allow enterprise customers to use their own API keys.
    *   **Begin SOC 2 Type 1 Preparation:** Start documenting your controls and processes. You don't need the audit yet, but having the documentation ready shows maturity.

## 8. Observability & Ops Roadmap

1.  **Phase A (Launch Critical):**
    *   **Centralized Logging:** Ensure all logs (API and workers) are sent to a centralized service (e.g., Datadog) and are tagged with `workspaceId`.
    *   **Basic Health Checks:** Implement `/health` endpoints for the API and workers.
    *   **Background Job UI:** Use a simple BullMQ dashboard (like Bull-Board) to monitor job queues.

2.  **Phase B (Enterprise Pilot):**
    *   **Introduce `deploymentId` Tag:** Add `deploymentId` to all logs and metrics to distinguish between shared and dedicated tenants.
    *   **Purge Observability:** Create a dashboard to monitor the status and duration of all workspace deletion requests.

3.  **Phase C (Scale Enterprise):**
    *   **Tenant-Level Dashboards:** Build dashboards that show key metrics (API latency, job counts, etc.) filtered by `deploymentId`.
    *   **SLA Monitoring:** Set up alerts for when a dedicated tenant's performance degrades, allowing for proactive support.

## 9. Risk Analysis

| Risk Category | Specific Risk | Mitigation Strategy |
| :--- | :--- | :--- |
| **Architectural** | **Refactoring Core Services:** Changing `PrismaService` and `S3Service` to be context-aware is high-risk. A mistake could lead to cross-tenant data leakage. | **Test-Driven Refactoring:** Write a comprehensive suite of integration tests that create two separate `Deployment` records with different databases and S3 buckets. The tests must verify that data written by Tenant A is only visible to Tenant A. This test suite must be run before and after the refactoring. |
| **Scaling** | **Noisy Neighbors:** In the shared SaaS model, a single large tenant could consume excessive database or worker resources, degrading performance for everyone else. | **Implement Resource Quotas:** Add usage limits (e.g., max feedback items, max API calls per minute) at the `Plan` level. **Proactive Monitoring:** Create alerts for when a single `workspaceId` is consuming a disproportionate amount of resources. |
| **Compliance** | **Incomplete Purge:** A bug in the purge system could lead to data being left behind, violating GDPR or other regulations. | **Post-Purge Verification:** After a purge runs, a separate, read-only process should scan the database and S3 to verify that no data with the deleted `workspaceId` remains. This verification result should be stored in the `WorkspaceDeletionAuditLog`. |
| **Enterprise Sales** | **Saying "No" to a Big Customer:** A large enterprise may demand a feature (e.g., SAML, on-prem) that is not on the immediate roadmap, potentially killing the deal. | **Principled Flexibility:** Have a clear internal roadmap (this document), but be prepared to re-prioritize for a strategic, paying customer. Use the architecture plan to accurately estimate the effort required for the requested feature. |
| **Engineering Bandwidth** | **Enterprise work slows down MVP:** The team gets bogged down in enterprise features and loses launch momentum. | **Strict Phasing:** Adhere to the phased roadmap. Do not start Phase B work until Phase A is complete. Defer all "nice-to-have" enterprise features until a customer is willing to pay for them. |

## 10. Founder Execution Strategy

This is a pragmatic guide for the TriageInsight founders.

-   **What to Build NOW:**
    1.  **Fix `FeedbackDuplicateSuggestion`:** This is a real data-mixing bug. Fix it immediately.
    2.  **MVP Purge System:** Build the core of the purge system (orchestration, DB, S3). This is your single most powerful enterprise sales tool in the early days. It shows you respect customer data.

-   **What to DELAY:**
    1.  **Dedicated Infrastructure:** Do not build the full `DeploymentContextService` or provision dedicated databases/S3 buckets until you have a signed contract from an enterprise customer who requires it.
    2.  **SAML/OIDC:** Do not build this. When a customer asks, tell them it is on the roadmap and you can accelerate it for a fee or as part of an annual contract.
    3.  **On-Premise Deployment:** Do not even think about this until you have a multi-million dollar pipeline that depends on it.

-   **What to FAKE Until Needed:**
    1.  **Dedicated Tenant:** You can simulate a dedicated tenant for a demo by simply spinning up a new, separate instance of the entire application stack. It's inefficient but gets the job done for a single pilot customer without refactoring the core app.
    2.  **Export Before Delete:** For the first few purge requests, you can manually run a database dump and S3 copy before approving the deletion. This allows you to claim compliance without building the full automated export pipeline.

-   **What Investors Care About:**
    *   **Capital Efficiency:** They want to see you building what customers are paying for, not what architects think is pure. This phased plan demonstrates that.
    *   **Scalability Story:** They want to know you have a credible plan to land large customers. The `Deployment` model and the phased approach provide that story.

-   **What Enterprise CTOs Will Ask:**
    1.  *"How do you isolate my data?"* → "We use a `workspaceId` on every database row and a `workspaces/{workspaceId}/` prefix on every S3 object. All queries and file operations are strictly scoped."
    2.  *"Can I get my data out?"* → "Yes, we have an export feature."
    3.  *"Can you delete my data permanently?"* → "Yes, we have an automated, audited purge system that removes all data from our database and S3. Here is a copy of the audit log from a test run."

## 11. Realistic Timeline Model

| Window | Key Deliverables |
| :--- | :--- |
| **Next 30 Days** | • **Fix `FeedbackDuplicateSuggestion` table.**<br>• **Implement MVP Purge:** DB cascade and S3 deletion steps.<br>• **Basic Purge UI:** Workspace settings Danger Zone and platform admin approval button. |
| **Next 60 Days** | • **Harden MVP Purge:** Add job queue draining and token revocation steps.<br>• **Publish Security Page** on the marketing website. |
| **Next 90 Days** | • **Implement `Deployment` Model:** Add the model to the schema and backfill existing workspaces.<br>• **Build `DeploymentContextService`:** Create the core tenant resolver. |
| **Next 6 Months** | • **Refactor Core Services:** Make `PrismaService` and `S3Service` context-aware.<br>• **Onboard First Dedicated Tenant:** Manually provision the infrastructure for the first enterprise pilot customer. |

# TriageInsight: Enterprise Sales Technical Readiness Pack

**Audience:** TriageInsight Founders, Sales & Pre-Sales Teams
**Purpose:** To equip the team with clear, credible, and honest answers to the technical due diligence questions posed by enterprise prospects.
**Version:** 1.0 (March 24, 2026)

---

## Introduction

This document is your internal guide to discussing TriageInsight's architecture, security, and data handling practices with sophisticated enterprise buyers. It is grounded in the reality of our current platform and our pragmatic, customer-driven roadmap. The goal is not to over-promise, but to build trust by being clear, confident, and transparent about what we offer today and where we are headed tomorrow.

---

## 1. Product Architecture Summary

**How to position it:** "TriageInsight is a modern, cloud-native AI platform built on a scalable, multi-tenant architecture. We use a logically isolated data model to ensure your information is secure, while leveraging a shared infrastructure model to deliver our service efficiently and cost-effectively."

| Component | Architecture & Rationale |
| :--- | :--- |
| **Overall Platform** | A monorepo containing a **Next.js/React** frontend and a **NestJS/Node.js** backend API, all written in **TypeScript**. This unified structure allows for rapid, consistent development. |
| **Multi-Tenant Model** | Our platform operates on a **shared infrastructure model**. A single, robust instance of our application, database, and worker fleet serves all our customers. This is the standard, proven model for modern SaaS. |
| **Data Isolation** | Logical data isolation is the core of our security model. Every piece of customer data is tied to a unique `workspaceId`. All database queries and API requests are strictly filtered by this ID, making it architecturally impossible for one customer to access another's data. |
| **AI Processing** | Our AI pipeline runs in the background, orchestrated by a robust queueing system (BullMQ). When you provide data (e.g., a survey response or a support ticket), a job is created to analyze it. This job runs in an isolated context, enriching the data and generating insights that are then written back to your secure workspace. |
| **Storage & Embeddings** | All customer files are stored in **Amazon S3**, with each object key prefixed by your unique `workspaceId` for strict separation. AI-generated embeddings are stored in our **PostgreSQL** database using the `pgvector` extension, and are subject to the same strict `workspaceId` filtering as all other data. |
| **Background Jobs** | We use a queue-based system to handle all asynchronous tasks like AI analysis, report generation, and data ingestion. Each job is tagged with your `workspaceId`, ensuring that all background processing operates within your tenant's secure boundary. |

## 2. Data Isolation & Ownership

**How to position it:** "Data isolation is the most critical aspect of our architecture. We’ve built our platform from the ground up to ensure your data is yours alone. We achieve this through a combination of strict logical partitioning in our shared environment and a clear path to physically isolated infrastructure for our enterprise customers."

-   **Logical Isolation (Current Model):** Your data lives in a shared PostgreSQL database but is separated by a mandatory `workspaceId` column on every table. Our application logic ensures that every single database query is filtered by your `workspaceId`. This is a standard, secure, and highly efficient multi-tenant architecture.

-   **Storage Isolation:** Your files are stored in a shared Amazon S3 bucket, but they are segregated by a `workspaces/{your_workspace_id}/` prefix. It is impossible for one workspace to read, write, or list files belonging to another.

-   **Embedding Isolation:** Your embeddings are stored in the same database table as other customers' but are protected by the same `workspaceId` filter. All vector similarity searches are strictly confined to your workspace's data.

-   **Future Physical Isolation:** For enterprise customers requiring the highest level of isolation, we offer a **Dedicated Cloud** deployment model. In this model, your workspace runs on its own dedicated PostgreSQL database, its own S3 bucket, and its own Redis instance. This provides physical, network-level isolation for your data.

## 3. Data Deletion & Purge

**How to position it:** "We believe you should have complete control over your data lifecycle. We have a robust, audited, and transparent process for permanently deleting your workspace data from our platform upon request."

-   **Deletion Request:** As a workspace administrator, you can request the permanent deletion of your workspace and all associated data from the "Danger Zone" in your workspace settings.

-   **Purge Lifecycle:** To prevent accidental deletion, our process includes a **7-day cooling-off period**. Once you request deletion, it enters a `SCHEDULED` state. After 7 days, the purge process runs automatically. You can cancel the request at any time during this period.

-   **What is Deleted:** The purge process permanently and irreversibly deletes:
    -   All data from our primary database associated with your workspace (feedback, themes, users, customers, etc.).
    -   All files from our Amazon S3 storage associated with your workspace.
    -   All pending and active jobs in our background processing queues.

-   **Backup Policy:** Our production database has a 30-day point-in-time recovery window. When your data is purged, it will remain in these encrypted backup files for up to 30 days, after which it is permanently gone. We cannot restore a single workspace from a backup; a full database restore would be required.

-   **Auditability:** Every step of the deletion process is logged in an immutable audit trail. Upon completion, we can provide a certificate of data destruction confirming that the process has been completed successfully.

## 4. Deployment Models

**How to position it:** "We offer flexible deployment models to meet the needs of every customer, from fast-moving startups to large enterprises with strict compliance requirements."

| Model | Best For | Description |
| :--- | :--- | :--- |
| **Shared SaaS** | **Startups, SMBs, and most teams.** | Our standard, multi-tenant cloud offering. You get instant access to all features on a cost-effective, shared infrastructure, with the assurance of strong logical data isolation. |
| **Dedicated Cloud** | **Enterprises, regulated industries, or customers with very large data volumes.** | A single-tenant instance of our platform running on dedicated infrastructure (database, storage, workers) within our AWS cloud. This provides physical data isolation and eliminates any "noisy neighbor" performance concerns. |
| **On-Premise (Roadmap)** | **Government agencies or companies with a strict no-cloud policy.** | A future offering where TriageInsight can be deployed within your own data center or private cloud. This is on our long-term roadmap and can be accelerated for strategic partners. |

**Migration Path:** We have a clear, well-defined process for migrating customers from our Shared SaaS to a Dedicated Cloud deployment with minimal downtime. This involves a database and S3 data migration, followed by a DNS switchover.

## 5. Security Posture

**How to position it:** "Security is foundational to our platform. We follow industry best practices to protect your data at every layer, from authentication and authorization to secret management and API security."

-   **Authentication & Authorization:** User authentication is handled via JWTs (JSON Web Tokens). Our authorization model is based on workspace membership and roles (ADMIN, EDITOR, VIEWER), ensuring users can only access data and perform actions that they are explicitly permitted to.

-   **Tenant Boundary Protection:** As described under Data Isolation, the `workspaceId` is the primary mechanism for enforcing tenant boundaries. Our middleware and service layers ensure this boundary is respected on every API call.

-   **Secret Handling:** In our current Shared SaaS model, platform-wide secrets (like our OpenAI API key) are stored in a secure `.env` file. For our Dedicated Cloud offering, we support tenant-specific secrets, allowing you to use your own API keys, which are stored encrypted in our database.

-   **API Security:** Our API is protected against common web vulnerabilities. All API endpoints require authentication, and role-based authorization is enforced on all mutation operations.

-   **Background Job Safety:** All background jobs are initiated by authenticated, authorized user actions and run in a workspace-scoped context. There is no way for a job to operate outside of its designated tenant boundary.

-   **Audit Logging:** We maintain a detailed audit log of all sensitive actions within your workspace, including user invites, data exports, and deletion requests. This provides a clear trail of who did what, and when.

## 6. AI Safety & Data Handling

**How to position it:** "We are committed to responsible AI. Your data is used exclusively to provide our service to you. It is never used to train our models, and it is never exposed to other customers."

-   **Is my data used to train your models?**
    > **No.** Your data is never used to train or fine-tune our underlying AI models. We use pre-trained models from industry-leading providers like OpenAI. Your data is passed to these models at inference time to generate insights for your workspace only.

-   **How is AI processing isolated?**
    > All AI processing happens in the context of a background job that is scoped to your `workspaceId`. The data sent to the AI model and the insights received are tied directly to your workspace and are never visible to any other tenant.

-   **Are embeddings shared?**
    > **No.** Embeddings are stored in our database and are strictly partitioned by your `workspaceId`. It is architecturally impossible for a similarity search in one workspace to see or return results from another.

## 7. Observability & Reliability

**How to position it:** "Our platform is built for reliability and performance. We use modern observability practices to monitor the health of our systems and ensure we can proactively address issues before they impact our customers."

-   **Monitoring:** We use a centralized logging and metrics platform (Datadog) to monitor our entire application stack in real-time. All logs and metrics are tagged with `workspaceId`, allowing us to quickly diagnose issues affecting a specific tenant.

-   **Failure Isolation:** Our background job architecture is designed to be resilient. If a job fails, it is automatically retried with an exponential backoff policy. A failure in one workspace’s job queue will not impact the processing of jobs for any other workspace.

-   **Scaling:** Our platform is built on a horizontally scalable architecture. Both our API and our background worker fleet can be scaled out to handle increased load, ensuring consistent performance as our customer base grows.

-   **Enterprise SLA Readiness:** For our Dedicated Cloud customers, we offer service level agreements (SLAs) for uptime and support. Our architecture allows us to provide tenant-specific monitoring and alerting to ensure we meet these commitments.

## 8. Compliance Roadmap

**How to position it:** "We are building TriageInsight with a compliance-first mindset. While we are an early-stage company and do not yet have formal certifications like SOC 2, we have implemented the core technical controls that form the foundation for future compliance."

-   **GDPR-Style Deletion Rights:** **(Available Now)** Our automated data purge system allows us to fully honor the "right to be forgotten." We can permanently delete all of a customer’s data upon request, with a full audit trail.

-   **Auditability:** **(Available Now)** All key actions within a workspace are logged, providing a clear and immutable record for security and compliance reviews.

-   **Data Residency:** **(Roadmap)** Our architecture is designed to support data residency requirements. With our Dedicated Cloud model, we can deploy a tenant’s infrastructure in a specific AWS region (e.g., `eu-central-1` for European customers) to ensure their data never leaves their chosen jurisdiction.

-   **SOC 2 / ISO 27001:** **(Roadmap)** We are actively documenting our security controls and operational processes in preparation for future SOC 2 Type 1 and Type 2 audits. We expect to begin the formal audit process as our enterprise customer base grows.

## 9. Enterprise FAQ

**Q: Where is my data stored?**
> Your data is stored in our secure cloud environment hosted on Amazon Web Services (AWS) in the `us-east-1` (North Virginia) region. For enterprise customers with data residency requirements, we can deploy your dedicated instance in other AWS regions, such as `eu-central-1` (Frankfurt).

**Q: Can we get dedicated infrastructure?**
> Yes. While our standard offering is a multi-tenant SaaS, we offer a **Dedicated Cloud** deployment for enterprise customers. This provides you with a physically isolated database, file storage bucket, and background processing queue, all running within our secure AWS environment.

**Q: How is our data deleted if we leave the platform?**
> We have an automated, audited data purge system. As a workspace administrator, you can request the permanent deletion of your workspace. After a 7-day cooling-off period, all of your data is permanently removed from our live systems and S3 storage. The process is logged, and we can provide a certificate of data destruction.

**Q: How is our AI data isolated from other customers?**
> Your data is never used to train our models. All AI processing is done at inference time within a job that is scoped to your specific workspace. The embeddings generated from your data are stored in our database and are strictly partitioned by your `workspaceId`, making them inaccessible to any other tenant.

**Q: How do you handle security for third-party integrations like Slack or Zendesk?**
> All integration credentials, such as OAuth tokens, are stored encrypted and are tied directly to your workspace. The permissions requested are scoped to the minimum required for the integration to function. All data ingested from these sources is treated with the same level of security and isolation as any other data in your workspace.

**Q: What happens if there is a platform outage?**
> We have a comprehensive monitoring and alerting system. In the event of an outage, our engineering team is immediately notified and begins working to resolve the issue. For our Dedicated Cloud customers, we offer uptime SLAs and a dedicated status page.

## 10. Technical Due Diligence One-Pager (Structure)

1.  **Platform Overview**
    *   Architecture: Cloud-native, multi-tenant SaaS on AWS.
    *   Tech Stack: Next.js/React, NestJS/Node.js, TypeScript, PostgreSQL, Redis, S3.
2.  **Data Isolation & Security**
    *   **Logical Isolation:** All data is partitioned by `workspaceId` at the database and API layers.
    *   **Storage Isolation:** All files are stored in S3 with a `workspaces/{workspaceId}/` prefix.
    *   **Encryption:** Data is encrypted at rest (AWS KMS) and in transit (TLS 1.2+).
3.  **Data Lifecycle Management**
    *   **Deletion:** Customer-initiated, automated, and audited data purge system.
    *   **Export:** Data can be exported in standard formats (CSV, JSON).
    *   **Backups:** 30-day point-in-time recovery for the production database.
4.  **AI & Data Handling**
    *   **No Model Training:** Customer data is never used to train our AI models.
    *   **Inference-Time Processing:** AI analysis is performed in isolated, workspace-scoped background jobs.
    *   **Embedding Isolation:** Vector embeddings are strictly partitioned by `workspaceId`.
5.  **Deployment Models**
    *   **Shared SaaS:** Standard multi-tenant offering.
    *   **Dedicated Cloud:** Single-tenant deployment with isolated infrastructure (DB, S3, Redis).
    *   **On-Premise:** On the long-term roadmap.
6.  **Compliance & Roadmap**
    *   **Current:** GDPR-style deletion rights, auditable actions.
    *   **Roadmap:** Data residency options, SOC 2 certification, SAML/OIDC integration.

## 11. Founder Sales Guidance

-   **How to position Shared SaaS:**
    > "Our standard platform is a modern, multi-tenant SaaS, which allows us to deliver features and security updates to you continuously and cost-effectively. We ensure your data is secure through strict logical isolation at every layer of our application."

-   **When to offer Dedicated Cloud:**
    *   When a prospect has strict compliance requirements that mandate physical data isolation.
    *   When a prospect has extremely high data volume and is concerned about "noisy neighbors."
    *   As a premium tier in your pricing for large enterprise contracts.

-   **When to say "It's on our roadmap":**
    *   Use this for features you have a credible architectural path for but have not yet built, such as **SAML/OIDC integration**, **on-premise deployment**, or **specific compliance certifications (SOC 2)**.
    *   Always follow up with: "This is a priority for us as we move upmarket. We can accelerate this for strategic partners. Can you tell me more about your specific requirements?"

-   **What to AVOID saying:**
    *   **"We are SOC 2 compliant"** (until you are).
    *   **"We can do on-prem next quarter"** (unless you can).
    *   **"Your data is physically separated"** (for Shared SaaS customers).
    *   Making specific promises about feature delivery dates without consulting the engineering team.

**The key is to be confident, honest, and to turn every question into a conversation about the customer’s needs.** Your preparation and transparency will build more trust than any exaggerated claim.

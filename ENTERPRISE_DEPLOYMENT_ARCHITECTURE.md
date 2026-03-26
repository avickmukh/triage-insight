# TriageInsight Enterprise Deployment Architecture

**Author:** Manus AI
**Date:** March 24, 2026
**Version:** 1.0

## Executive Summary

This document outlines a practical, evolution-focused architecture for deploying TriageInsight in both dedicated single-tenant cloud and future on-premise environments, while preserving the existing shared multi-tenant SaaS model. The core design principle is to introduce a clean abstraction layer—the **Deployment Context**—that allows the same application codebase to operate seamlessly across different tenancy models with minimal conditional logic.

Key recommendations include:

1.  **Introducing a `Deployment` model** to store tenant-specific infrastructure bindings (DB connections, S3 buckets, etc.).
2.  **Creating a `DeploymentContextService`** to resolve the correct infrastructure bindings at runtime based on the incoming request (e.g., via hostname or `orgSlug`).
3.  **Using a Strategy Pattern** to encapsulate mode-specific logic for databases, storage, and workers, avoiding scattered `if/else` statements.
4.  **Prioritizing a phased rollout**, starting with a robust `Deployment` model and resolver, and deferring full physical isolation of secondary services like Redis until required by enterprise customers.

This approach minimizes upfront engineering, maintains a single codebase, and provides a clear, scalable path to full enterprise readiness.

---

## 1. Current-State Architecture Analysis

The TriageInsight monorepo is fundamentally built as a **shared multi-tenant SaaS platform**. This is evident in its core design patterns, which assume a single, shared infrastructure layer logically partitioned by a `workspaceId`.

### 1.1. What is Already Multi-Tenant

The entire system is designed around a shared-everything model, where a single instance of the API, database, and worker fleet serves all tenants. Logical data isolation is the primary mechanism for security and privacy.

### 1.2. Core Multi-Tenancy Assumptions

The codebase makes several key assumptions that anchor it to a shared deployment model:

| Layer | Assumption | Implementation Detail |
| :--- | :--- | :--- |
| **Database** | A single PostgreSQL database serves all tenants. | The `PrismaService` is instantiated once with a single `DATABASE_URL` from environment variables. Every database query relies on a `WHERE` clause with `workspaceId` for data partitioning. |
| **Storage** | A single AWS S3 bucket stores all tenant files. | The `S3Service` is configured with a single `AWS_S3_BUCKET`. Tenant data is isolated using a `workspaces/{workspaceId}/` prefix in the object key. |
| **Background Jobs** | A single Redis instance backs all 13 BullMQ queues. | The `QueueModule` connects to a single Redis instance defined by `REDIS_HOST` and `REDIS_PORT`. Jobs for all tenants are mixed in the same queues, identified by `workspaceId` in the job payload. |
| **Authentication** | A single, global `User` table serves all workspaces. | The `JwtStrategy` validates a user against the central `User` table. A user can be a member of multiple workspaces, but their identity is global. |
| **Configuration** | A single set of environment variables (`.env`) configures all services. | API keys (OpenAI, Stripe), SMTP settings, and other secrets are loaded once at application startup and shared across all tenants. |

### 1.3. Tenant-Sensitive Components

In a dedicated or on-prem deployment, the following components would shift from being logically partitioned to physically isolated:

| Component | Shared SaaS Model (Current) | Dedicated/On-Prem Model (Future) |
| :--- | :--- | :--- |
| **Database** | Single DB, partitioned by `workspaceId` | Dedicated DB instance per tenant |
| **Storage** | Single bucket, prefixed by `workspaces/{workspaceId}/` | Dedicated S3 bucket or on-prem MinIO instance |
| **Workers** | Shared Redis, jobs mixed in global queues | Dedicated Redis or namespaced queues per tenant |
| **Secrets** | Shared `.env` file for all tenants | Tenant-specific secrets (e.g., from AWS Secrets Manager, HashiCorp Vault, or local config) |
| **Auth** | Central `User` table | Potentially a tenant-local user table or integration with the tenant’s IdP (SAML/OIDC) |
| **Domain** | `app.triage.so/{orgSlug}` | `triage.customer.com` (custom domain) |
| **Embeddings** | Stored in the shared PostgreSQL DB (`pgvector`) | Stored in the tenant’s dedicated DB |
| **Analytics** | (Not yet implemented) Would likely be a shared data warehouse | Tenant-specific data warehouse or disabled |

## 2. Deployment Mode Model

To manage these different tenancy models, we will introduce a new top-level entity: the **`Deployment`**. This model will act as the source of truth for a tenant’s infrastructure bindings.

### 2.1. Schema Design

We will add a `Deployment` model to the Prisma schema and link it to the `Workspace`.

```prisma
/// Specifies the deployment model for a given workspace.
/// SHARED: Standard multi-tenant SaaS on shared infrastructure.
/// DEDICATED: Single-tenant cloud deployment with isolated infrastructure.
/// ON_PREM: Self-hosted by the customer.
enum DeploymentMode {
  SHARED
  DEDICATED
  ON_PREM
}

/// Stores the infrastructure configuration for a specific deployment.
/// For SHARED mode, there will be a single default Deployment record.
/// For DEDICATED/ON_PREM, each tenant gets their own Deployment record.
model Deployment {
  id                String          @id @default(uuid())
  name              String          // e.g., "Shared SaaS US-East-1", "ACME Corp Dedicated"
  mode              DeploymentMode
  isDefault         Boolean         @default(false) // Only one default SHARED deployment

  // Infrastructure Bindings (all optional, resolved at runtime)
  databaseUrl       String?         // "postgresql://..."
  redisUrl          String?         // "redis://..."
  s3Bucket          String?         // "acme-corp-triage-data"
  s3Region          String?         // "us-west-2"
  s3AccessKeyId     String?         // Encrypted secret reference
  s3SecretAccessKey String?         // Encrypted secret reference

  workspaces        Workspace[]
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
}

// Add a relation to the Workspace model
model Workspace {
  // ... existing fields
  deploymentId      String
  deployment        Deployment      @relation(fields: [deploymentId], references: [id])
}
```

### 2.2. Core Concepts

-   **`Deployment` as the Source of Truth:** All tenant-specific infrastructure details are stored here. The application code reads from this model, not from environment variables directly, for tenant-scoped operations.
-   **Default Shared Deployment:** For the existing SaaS model, a single `Deployment` record will be created with `mode: SHARED` and `isDefault: true`. Its infrastructure fields (`databaseUrl`, etc.) will be null, signaling the application to fall back to the global `.env` configuration.
-   **Workspace Association:** Every `Workspace` must belong to a `Deployment`. New signups on the public website will be automatically associated with the default `SHARED` deployment.
-   **Platform-Global vs. Tenant-Local:** The `User` table and the new `Deployment` table itself are platform-global. All other data is tenant-local, either logically (via `workspaceId`) or physically (via dedicated infrastructure).

## 3. Request Routing & Tenant Context Resolution

The cornerstone of this architecture is a **`DeploymentContextService`**. This service will be responsible for identifying the correct `Deployment` for an incoming request and making its infrastructure bindings available to the rest of the application.

### 3.1. The `DeploymentContext` Object

For every request, the service will produce a `DeploymentContext` object:

```typescript
export interface DeploymentContext {
  deploymentId: string;
  mode: DeploymentMode;
  // Resolved infrastructure bindings
  db: PrismaClient;
  s3: S3Client;
  redis: Redis.Redis;
  // other clients...
}
```

### 3.2. Resolution Strategy

The `DeploymentContextService` will be implemented as a NestJS request-scoped provider, making it available throughout the request lifecycle. It will resolve the tenant in the following order of precedence:

1.  **Hostname:** Check if the request `Host` header (e.g., `acme.triage.so`) maps to a `DEDICATED` or `ON_PREM` workspace with a custom domain.
2.  **`orgSlug`:** Parse the `orgSlug` from the URL path (e.g., `/acme-corp/app/...`) and look up the corresponding workspace and its `Deployment`.
3.  **Default:** If neither is present (e.g., for a platform-level API call), it may use the default `SHARED` context or throw an error if tenant context is required.

### 3.3. Service Injection and Usage

Instead of directly instantiating clients like `PrismaClient` or `S3Client` with global configs, services will receive them from the `DeploymentContext`.

**Before (Current Architecture):**

```typescript
@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async findFeedback(workspaceId: string) {
    // prisma is a singleton
    return this.prisma.feedback.findMany({ where: { workspaceId } });
  }
}
```

**After (Enterprise Architecture):**

```typescript
@Injectable()
export class FeedbackService {
  constructor(private readonly context: DeploymentContextService) {}

  async findFeedback(workspaceId: string) {
    // Get the Prisma client for the current tenant
    const prisma = this.context.getPrismaInstance();
    return prisma.feedback.findMany({ where: { workspaceId } });
  }
}
```

This pattern centralizes tenant resolution and keeps the business logic in services clean and unaware of the underlying deployment mode.

## 4. Database Architecture by Mode

The database strategy is the most critical part of the enterprise design. The goal is to support dedicated databases without requiring a full application rewrite.

### 4.1. Strategy by Mode

| Mode | Strategy | Implementation Details |
| :--- | :--- | :--- |
| **Shared SaaS** | **Single Shared Database:** All tenants co-exist in one database, partitioned by `workspaceId`. | The default `Deployment` has a null `databaseUrl`, so the `DeploymentContextService` provides the globally configured `PrismaClient` singleton. This is the current behavior. |
| **Dedicated Cloud** | **Database per Tenant:** Each enterprise customer gets their own provisioned PostgreSQL database. | The `Deployment` record for the tenant contains the full `databaseUrl`. The `DeploymentContextService` will instantiate a new `PrismaClient` on-the-fly for that connection string and cache it for the duration of the request. |
| **On-Prem** | **Customer-Managed Database:** The customer provides the connection string during installation. | Same as Dedicated Cloud. The `databaseUrl` is stored in the `Deployment` record, and the application connects to it. |

### 4.2. Handling Migrations

-   **Shared SaaS:** Migrations are run once against the shared database during deployment (`prisma migrate deploy`).
-   **Dedicated Cloud:** A new `migration-runner` service will be created. On deployment of a new application version, this service will iterate through all `DEDICATED` deployments, connect to each tenant’s database, and apply the migrations.

### 4.3. Tradeoffs & Recommendation

-   **Connection Pooling:** Instantiating `PrismaClient` on-the-fly for each request in dedicated mode can be inefficient. For the MVP, we will cache the client instance for the request scope. For a future V2, we can implement a global, centrally managed pool of `PrismaClient` instances, keyed by `deploymentId`.

**Recommendation:** Adopt the **Database per Tenant** model for dedicated deployments, using the `DeploymentContextService` to manage connection resolution. This provides strong data isolation and is the most common and expected pattern for enterprise customers.

## 5. Storage Architecture by Mode

The current storage architecture is already well-suited for multi-tenancy, using prefixes for isolation. This pattern can be extended to support dedicated storage with minimal changes.

### 5.1. Strategy by Mode

| Mode | Strategy | Implementation Details |
| :--- | :--- | :--- |
| **Shared SaaS** | **Single Bucket, Workspace Prefix:** All tenant files are stored in one S3 bucket, with object keys prefixed by `workspaces/{workspaceId}/`. | The default `Deployment` has null S3 fields. The `DeploymentContextService` provides an `S3Client` configured from global `.env` variables. This is the current behavior. |
| **Dedicated Cloud** | **Dedicated Bucket per Tenant:** Each enterprise customer gets their own S3 bucket. | The `Deployment` record contains the `s3Bucket`, `s3Region`, and encrypted credentials. The `DeploymentContextService` instantiates and caches an `S3Client` with these tenant-specific settings. |
| **On-Prem** | **Pluggable Storage Provider:** The customer provides credentials for their S3-compatible storage (e.g., MinIO). | Same as Dedicated Cloud. The application only needs to know the endpoint, bucket, and credentials; the underlying provider is abstracted away by the S3 API. |

### 5.2. Covered Assets

This strategy applies to all file types stored by the application:

-   **Feedback Attachments:** `workspaces/{workspaceId}/feedback/attachments/...`
-   **Voice Recordings:** `workspaces/{workspaceId}/voice/...`
-   **Data Exports:** (Future) `workspaces/{workspaceId}/exports/...`
-   **AI Artifacts:** (Future) `workspaces/{workspaceId}/artifacts/...`

## 6. Worker & Background Job Architecture

Isolating background jobs is crucial for preventing "noisy neighbor" problems and ensuring performance for enterprise tenants.

### 6.1. Strategy by Mode

| Mode | Strategy | Implementation Details |
| :--- | :--- | :--- |
| **Shared SaaS** | **Shared Redis, Global Queues:** All jobs from all tenants are processed by a single fleet of workers connected to a shared Redis instance. | The `QueueModule` connects to the global Redis. Job payloads must contain `workspaceId` and `deploymentId`. This is the current behavior. |
| **Dedicated Cloud** | **Dedicated Redis per Tenant:** Each enterprise customer gets their own provisioned Redis instance for BullMQ. | The `Deployment` record contains the `redisUrl`. The `DeploymentContextService` will provide a tenant-specific `Queue` instance. The worker fleet will need to be horizontally scaled and configured to process jobs from multiple tenant queues. |
| **On-Prem** | **Customer-Managed Redis:** The customer provides the Redis connection string. | Same as Dedicated Cloud. |

### 6.2. MVP vs. Future Roadmap

-   **MVP (Must do now):** The `DeploymentContextService` should be able to resolve a tenant-specific `redisUrl`. The application code (e.g., `PurgeService`, `VoiceService`) should be updated to request the `Queue` instance from the context service instead of using the globally injected one.
-   **Future (Can wait):** A fully isolated worker fleet for each dedicated tenant is not necessary for the MVP. A single, shared worker fleet can be configured to connect to and process jobs from multiple tenant-specific Redis instances. True physical isolation of the worker processes can be implemented later if performance requirements demand it.

## 7. Embeddings & AI Data Architecture

Vector embeddings are stored directly in the PostgreSQL database using the `pgvector` extension. Therefore, the embedding isolation strategy is directly tied to the database architecture.

### 7.1. Strategy by Mode

| Mode | Strategy | Implementation Details |
| :--- | :--- | :--- |
| **Shared SaaS** | **Shared Table, Partitioned by `workspaceId`:** All embeddings are stored in the main `Feedback` and `SupportTicket` tables. | All vector similarity queries (e.g., for duplicate detection, theme clustering) MUST include a `WHERE "workspaceId" = ...` clause. The audit confirmed this is already being done correctly. |
| **Dedicated Cloud** | **Dedicated Database:** Embeddings are stored in the tenant’s dedicated PostgreSQL database. | No application-level changes are needed. Since the database is physically isolated, the data is inherently namespaced. |
| **On-Prem** | **Customer-Managed Database:** Same as Dedicated Cloud. | The embeddings live inside the customer’s database. |

**Conclusion:** No special handling is required for embeddings beyond what is already planned for the database architecture. The existing design is secure and scalable.

## 8. Auth, Identity & Domain Model

The current global `User` model presents a challenge for true enterprise isolation but also offers flexibility. The recommended approach is to maintain the central identity model while enabling tenant-specific routing.

### 8.1. Key Design Decisions

-   **Central Identity Remains:** The `User` table will remain global. This allows a single user to belong to multiple workspaces (e.g., a consultant working with several clients) with a single login. This is a powerful feature that should be preserved.
-   **Subdomain-based Routing:** For dedicated tenants, the primary routing mechanism will be via subdomains (e.g., `acme.triage.so`) or custom domains (`triage.acme.com`). The `DeploymentContextService` will use the `Host` header to identify the tenant.
-   **Org-Scoped Login:** The login page (`/:orgSlug/login`) already provides a degree of workspace-scoping. For dedicated tenants with custom domains, the `orgSlug` is implicit, and the login page will be served directly at `/login` on their domain.
-   **Platform vs. Workspace Admins:** The distinction between `PlatformRole` (SUPER_ADMIN) and `WorkspaceMemberRole` (ADMIN) is already clear and will be maintained. Platform admins manage deployments; workspace admins manage their own workspace settings.

### 8.2. On-Prem Authentication

For a future on-premise version, the auth model will need to be pluggable to support enterprise Identity Providers (IdPs) like Active Directory or Okta via SAML or OIDC. This is a significant undertaking and should be deferred until there is a clear customer requirement. The current JWT-based system is sufficient for shared and dedicated cloud deployments.

## 9. Secrets & Integration Isolation

Centralized secret management is a security risk in a multi-tenant environment. The `Deployment` model provides a natural seam for isolating tenant-specific secrets.

### 9.1. Strategy by Mode

| Mode | Strategy | Implementation Details |
| :--- | :--- | :--- |
| **Shared SaaS** | **Global `.env` File:** All secrets (OpenAI API key, SMTP credentials, Slack client secret) are shared across all tenants. | The `ConfigService` reads from a single source of truth. This is the current behavior. |
| **Dedicated Cloud** | **Tenant-Specific Secrets:** Each enterprise customer can provide their own API keys and integration credentials. | The `Deployment` model will be extended with an encrypted `secretsJson` field. The `DeploymentContextService` will decrypt and provide these secrets to the relevant services (e.g., `SlackService`, `AIService`). For a V2, this could be a reference to a key in AWS Secrets Manager or HashiCorp Vault. |
| **On-Prem** | **Customer-Managed Secrets:** The customer provides all secrets in a local configuration file during installation. | Same as Dedicated Cloud. The secrets are loaded into the `Deployment` record for the on-prem instance. |

### 9.2. `WorkspaceIntegration` Model

The existing `WorkspaceIntegration` and `IntegrationConnection` models are already designed correctly. They store OAuth tokens (`accessToken`, `refreshToken`) and configuration on a per-workspace, per-integration basis. This model does not need to change; it already provides the necessary level of isolation for user-level integrations like Slack.

## 10. Purge System Compatibility

The previously designed workspace purge system is fully compatible with this enterprise deployment architecture. The `IPurgeStrategy` pattern defined in that design can be extended.

| Mode | Purge Strategy | Implementation Details |
| :--- | :--- | :--- |
| **Shared SaaS** | `SharedSaaSDeleteStrategy` | This strategy performs a logical deletion. It executes the 5 steps already designed: freeze workspace, revoke tokens, drain queues, delete S3 prefix, and run `prisma.workspace.delete()` to trigger the database cascade. |
| **Dedicated Cloud** | `DedicatedCloudDeleteStrategy` | This strategy performs a physical deletion. It will de-provision the tenant’s dedicated resources: delete the S3 bucket, delete the PostgreSQL database, delete the Redis instance, and then delete the `Deployment` record itself. |
| **On-Prem** | `OnPremDeleteStrategy` | This strategy would likely be a script that the customer’s administrator runs. It would perform a similar physical deletion of the on-prem resources. |

## 11. Provisioning Lifecycle

The process of creating a new workspace will differ significantly between deployment modes.

-   **Shared (Automated):** A new user signs up on the public website. A `Workspace` is created and automatically linked to the default `SHARED` `Deployment`. This is the current flow.
-   **Dedicated (Manual, then Automated):**
    1.  **Manual:** A solutions engineer provisions the dedicated infrastructure (PostgreSQL DB, S3 bucket, Redis) via Terraform or CloudFormation.
    2.  **Manual:** The engineer creates a new `Deployment` record in the platform database, populating it with the connection strings and credentials for the new infrastructure.
    3.  **Automated:** The engineer uses a platform admin UI to create a new `Workspace` and associate it with the newly created `Deployment`.
    4.  **Automated:** The migration-runner service applies the latest database schema to the new tenant DB.
-   **On-Prem (Manual):** The customer runs an installation script that provisions the local database and configures the application. A `Deployment` record is created locally to represent the on-prem instance.

## 12. Observability & Ops Model

| Mode | Logging | Metrics | Health Checks |
| :--- | :--- | :--- | :--- |
| **Shared SaaS** | Centralized logging (e.g., Datadog, Logz.io) with `workspaceId` and `deploymentId` tags. | Centralized metrics with `deploymentId` as a key tag. | A single set of health checks for the shared platform. |
| **Dedicated Cloud** | Logs are shipped to a tenant-specific stream or a central account with strict access controls. | Key metrics (e.g., API latency, job throughput) are exposed on a tenant-specific dashboard for the enterprise customer. | Each dedicated deployment has its own set of health checks, and alerts are routed to a dedicated on-call rotation. |
| **On-Prem** | The customer is responsible for their own logging infrastructure. The application will output structured logs (JSON) to stdout. | The application will expose a `/metrics` endpoint in Prometheus format. The customer is responsible for scraping and monitoring. | A `/health` endpoint will be available for the customer’s monitoring systems. |

## 13. MVP vs. Future Roadmap

This architecture is designed for gradual implementation. The following table outlines a practical, founder-friendly roadmap.

| Phase | Scope | Rationale |
| :--- | :--- | :--- |
| **A. Must Do Now** | 1. Implement the `Deployment` model in Prisma.<br>2. Build the core `DeploymentContextService` to resolve tenants.<br>3. Refactor `PrismaService` and `S3Service` to be context-aware. | This is the foundational abstraction layer. Without it, no other enterprise features can be built cleanly. |
| **B. Prepare Now** | 1. Define interfaces for other context-aware services (`IRedisProvider`, `ISecretProvider`).<br>2. Ensure all new code uses the `DeploymentContextService` instead of global singletons. | This ensures the codebase evolves in the right direction and avoids accumulating more technical debt that will need to be refactored later. |
| **C. Wait for Customer** | 1. Full physical isolation of Redis and workers.<br>2. Pluggable auth for on-prem (SAML/OIDC).<br>3. Automated provisioning and migration for dedicated tenants.<br>4. Tenant-facing observability dashboards. | These are significant engineering efforts that should be driven by concrete enterprise customer contracts and requirements. |

## 14. Recommended Implementation Sequence

1.  **Schema First:** Implement the `Deployment` model and the `deploymentId` relation on the `Workspace` model. Create a default `SHARED` deployment and backfill all existing workspaces to point to it.
2.  **Build the Resolver:** Create the `DeploymentContextService` and the logic for resolving deployments by hostname and `orgSlug`.
3.  **Refactor Core Services:** Update `PrismaService` and `S3Service` to be the first consumers of the new `DeploymentContextService`. This is the most critical and highest-risk part of the implementation.
4.  **Provisioning UI:** Build a basic platform admin UI for creating and managing `Deployment` records.
5.  **Test with a Pilot Tenant:** Manually provision a dedicated database and S3 bucket for a test workspace. Use the new UI to create the `Deployment` record and verify that the application correctly routes requests to the isolated infrastructure.
6.  **Iterate:** Gradually refactor other services (`QueueModule`, `AIService`, etc.) to become context-aware as required by new features or enterprise customer needs.

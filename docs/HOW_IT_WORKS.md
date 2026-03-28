'''
# How TriageInsight Works

**Version:** 1.0  
**Date:** March 28, 2026  
**Author:** Manus AI

---

## 1. Introduction

This document provides a technical overview of the TriageInsight platform, detailing its architecture, core components, data flows, and key technical concepts. It is intended for developers, architects, and technical stakeholders who need to understand the inner workings of the system.

## 2. Architecture Overview

TriageInsight is built as a modern, scalable web application using a **monorepo architecture** managed by `pnpm` and `Turborepo`. This structure allows for shared code, streamlined dependency management, and unified build/test processes across the entire platform.

The repository is organized into two main directories:

- **`apps/`**: Contains the deployable applications (the API server, the web frontend, and the background worker).
- **`packages/`**: Contains shared libraries and components used across the different applications, such as UI components, configuration, and type definitions.

### Technology Stack

| Component | Technology | Description |
|---|---|---|
| **Frontend** | Next.js, React, TypeScript, Tailwind CSS | A modern, server-rendered React framework for the user interface. |
| **Backend** | NestJS, TypeScript, Express | A progressive Node.js framework for building efficient and scalable server-side applications. |
| **Database** | PostgreSQL, Prisma, pgvector | A powerful open-source relational database with vector support for AI features. Prisma is used as the ORM. |
| **Job Queue** | BullMQ, Redis | A robust and high-performance job queue system for handling background tasks. |
| **Deployment** | Docker | The platform is containerized for consistent deployments across different environments. |

'''
'''

## 3. Core Components

The platform consists of three main applications that work together:

### 3.1. Web Application (`apps/web`)

- **Framework**: Next.js 14 with App Router
- **Responsibilities**: 
    - All user-facing interfaces, including the main staff dashboard, organization admin settings, and the public-facing feedback portal.
    - Client-side state management using `@tanstack/react-query` (React Query) for data fetching, caching, and synchronization with the backend.
    - Authentication flow and session management (cookie-based).
    - Role-based access control (RBAC) enforced at the UI level, hiding or disabling elements based on user permissions.

### 3.2. API Server (`apps/api`)

- **Framework**: NestJS
- **Responsibilities**:
    - Provides the entire REST API for the platform.
    - Handles all business logic, data validation, and database interactions.
    - Implements authentication (`JwtAuthGuard`) and authorization (`RolesGuard`) to protect endpoints.
    - Enqueues jobs in BullMQ for long-running or asynchronous tasks (e.g., AI analysis, CIQ scoring, email notifications).
    - Integrates with third-party services like Stripe for billing and AWS S3 for file storage.

### 3.3. Background Worker (`apps/worker`)

- **Framework**: NestJS
- **Responsibilities**:
    - A separate, non-API-facing application that processes jobs from the Redis-backed BullMQ queues.
    - Handles computationally intensive or time-consuming tasks like:
        - **AI Analysis**: Duplicate detection, sentiment analysis, theme clustering.
        - **CIQ Scoring**: Running the Customer Impact & Quality (CIQ) scoring engine.
        - **Data Syncs**: Ingesting data from external sources (e.g., support systems).
    - This separation ensures that the API server remains responsive and is not blocked by heavy background processing.
'''

## 4. Key Concepts

This section explains some of the core technical concepts that are fundamental to the TriageInsight platform.

### 4.1. Multi-Tenancy and Data Isolation

The platform is designed as a multi-tenant SaaS application, where each customer's data is logically separated within a shared infrastructure. The primary mechanism for data isolation is the **`workspaceId`**.

- **Database**: Every table that contains workspace-specific data has a mandatory `workspaceId` column. All database queries executed by the API services are strictly scoped to the `workspaceId` of the authenticated user's current workspace. This is enforced at the service layer to prevent any possibility of one workspace accessing another's data.

- **File Storage**: All user-uploaded files (e.g., feedback attachments, voice recordings) are stored in an S3-compatible object store. The S3 keys are prefixed with the `workspaceId` (e.g., `workspaces/{workspaceId}/...`) to ensure that files are segregated by tenant.

- **Job Queues**: Payloads for background jobs enqueued in BullMQ always include the `workspaceId`. This ensures that when the worker processes a job, it operates only on the data belonging to the correct workspace.

### 4.2. Role-Based Access Control (RBAC)

Security and permissions are managed through a sophisticated, multi-layered RBAC system that operates at both the backend and frontend.

#### Roles

There are two distinct sets of roles:

- **Workspace Roles**: These roles govern a user's permissions *within* a specific workspace.
    - `ADMIN`: Full control over the workspace, including billing, member management, and all data.
    - `EDITOR`: Can create and modify data (e.g., feedback, themes) but cannot access sensitive admin settings.
    - `VIEWER`: Read-only access to workspace data.

- **Platform Roles**: These are for TriageInsight staff to manage the entire platform.
    - `SUPER_ADMIN`: Full control over the entire platform, including all workspaces and platform settings.
    - `ADMIN`: Can manage workspaces and users but has restricted access to critical platform settings.

#### Backend Enforcement (API)

- **Guards**: NestJS Guards are used extensively to protect API endpoints.
    - `JwtAuthGuard`: Ensures that a valid JSON Web Token (JWT) is present in the request. This is the first line of defense for all non-public endpoints.
    - `RolesGuard`: Checks the user's role against the roles required by an endpoint (defined via the `@Roles()` decorator). It correctly resolves the user's membership for the specific `workspaceId` in the URL, ensuring a user's admin role in one workspace doesn't grant them access in another.
    - `PlatformGuard`: A specialized guard used to protect the super-admin control plane endpoints.

#### Frontend Enforcement (Web)

- **Middleware (`middleware.ts`)**: The Next.js middleware provides the first layer of frontend protection. It checks for the presence of an `accessToken` cookie on all protected routes (`/admin/*` and `/:orgSlug/app/*`) and redirects to the appropriate login page if the token is missing. This prevents any "flash of unstyled content" for unauthenticated users.

- **Client-Side Role Checks**: Within the application, custom hooks like `useCurrentMemberRole` are used to fetch the user's role for their current workspace. This role information is then used to conditionally render UI elements, such as hiding the "Admin" navigation section for non-admin users or disabling edit buttons for viewers.

### 4.3. The CIQ Scoring Engine

Customer Impact & Quality (CIQ) is the core metric used by TriageInsight to prioritize feedback and themes. It is not a simple count but a sophisticated, weighted score calculated by the **CIQ Engine** (`CiqEngineService` and `CiqService`).

The engine runs as a background process, triggered by events like new feedback submission or theme creation. The score is calculated based on a configurable set of weighted signals:

- **Request Frequency**: The raw volume of feedback, support tickets, and voice mentions linked to a theme.
- **Sentiment**: The aggregated sentiment score (positive, negative, neutral) from all associated signals.
- **Recency**: A score that decays over time, giving more weight to recent feedback.
- **Revenue Impact**: The total Annual Recurring Revenue (ARR) of all customers who have provided feedback on a theme.
- **Deal Influence**: The value of open sales deals linked to a theme.
- **Strategic Weight**: A manually assigned score for themes that align with strategic company goals.

All weights are configurable at the workspace level, allowing organizations to tailor the CIQ score to their specific priorities. The final score is normalized to a 0-100 scale for easy comparison.

## 5. Data Flow Example: Submitting Feedback

To illustrate how the components work together, here is the end-to-end data flow for a user submitting a new piece of feedback through the web interface:

1.  **UI (Web App)**: The user fills out the feedback form in the Next.js application and clicks "Submit".

2.  **API Call (Web App)**: The client makes a `POST` request to the `/workspaces/{workspaceId}/feedback` endpoint on the API server.

3.  **Authentication (API)**: The `JwtAuthGuard` and `RolesGuard` on the controller verify the user's token and confirm they have the required `EDITOR` or `ADMIN` role.

4.  **Service Logic (API)**: The `FeedbackService` receives the data. It performs validation and creates a new record in the `Feedback` table in the PostgreSQL database.

5.  **Job Enqueue (API)**: After successfully saving the feedback, the `FeedbackService` enqueues two jobs into the BullMQ queues (Redis):
    - A `feedback-analysis` job for the AI worker to process.
    - A `ciq-scoring` job to calculate the initial CIQ score for the new feedback.

6.  **Job Processing (Worker)**: The background worker, which is constantly listening to the queues, picks up the jobs.
    - The `AnalysisProcessor` performs tasks like sentiment analysis and duplicate detection, updating the feedback record with the results.
    - The `CiqScoringProcessor` calls the `CiqService` to calculate the score and updates the feedback record.

7.  **UI Update (Web App)**: The web application, which uses React Query, automatically refetches the feedback list or the specific feedback item. The user sees the newly submitted feedback, now enriched with the AI analysis and CIQ score, appear in the UI without needing to manually refresh the page.

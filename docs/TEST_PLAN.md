# TriageInsight - Final Validation Test Plan

**Version:** 1.0  
**Date:** March 28, 2026  
**Author:** Manus AI

---

## 1. Introduction

This document outlines the test plan for the final validation of the TriageInsight platform before the production release. It covers automated and manual testing procedures to ensure all features are working as expected, with a strong focus on the recent RBAC fixes and multi-tenancy architecture.

## 2. Testing Strategy

Our strategy combines automated tests at multiple levels with focused manual testing for user experience and security validation.

| Level | Framework/Tool | Scope | Command |
|---|---|---|---|
| **Unit/Integration** | Jest, NestJS Testing | Backend services, controllers, guards | `pnpm test` |
| **End-to-End (E2E)** | Playwright | Frontend user flows, API interactions | `pnpm test:e2e` |
| **Manual** | Human QA | UI/UX, complex RBAC scenarios | See Section 5 |

## 3. Automated Test Cases

### 3.1. Backend (API)

#### **Authentication & Authorization (RBAC)**

- **[P0] `RolesGuard`**: 
    - Verify that endpoints *without* a `@Roles` decorator but with a class-level `@UseGuards(RolesGuard)` **fail** if the class has no `@Roles` decorator (as it should default to denying access).
    - Verify that if `@Roles` is missing, the guard correctly returns `true` (allowing any authenticated user), and that this behavior is now explicitly handled in controllers like `SurveyController`.
- **[P0] `SurveyController` Fixes**:
    - Write new integration tests to confirm that `GET /surveys`, `GET /surveys/:id`, `GET /surveys/:id/responses`, and `GET /surveys/:id/intelligence` now correctly require `VIEWER`, `EDITOR`, or `ADMIN` roles.
    - Test that a user from `workspace_A` cannot access survey data in `workspace_B`.
- **[P1] `JwtAuthGuard`**: 
    - Ensure all public-facing controllers (e.g., `PublicFeedbackController`) do **not** use `JwtAuthGuard`.
    - Ensure all internal workspace and platform controllers **do** use `JwtAuthGuard`.

#### **Multi-Tenancy**

- **[P0] Data Isolation**: 
    - For every service method that queries the database (e.g., `findMany`, `findFirst`), add a test case to ensure a `workspaceId` filter is always present in the `where` clause.
    - Create a test that attempts to fetch data from another workspace and asserts that the result is empty or throws an error.
- **[P1] S3/Queue Scoping**: 
    - Verify that S3 keys and BullMQ job payloads always include the `workspaceId` to prevent cross-tenant data leaks.

### 3.2. Frontend (Web)

#### **Middleware (`middleware.ts`)**

- **[P0] Platform Admin Protection**: 
    - Write an E2E test that navigates to `/admin/workspaces` without an `accessToken` cookie.
    - Assert that the user is redirected to `/login`.
    - Assert that no part of the admin layout is rendered before the redirect.
- **[P1] Workspace Protection**: 
    - Write an E2E test that navigates to `/acme-corp/app/inbox` without a token and asserts a redirect to `/acme-corp/login`.

#### **UI & Role-Based Views**

- **[P1] Admin-Only Navigation**: 
    - Write an E2E test where a user with the `VIEWER` role logs in.
    - Assert that the "Admin" navigation group in the sidebar is **not** visible.
- **[P1] Platform Admin Layout**: 
    - Write an E2E test where a non-admin user attempts to navigate to `/admin`.
    - Assert that they are redirected to `/login` and do not see any of the platform admin content.

## 4. Manual Testing Plan

### 4.1. Scope

This manual audit focuses on areas difficult to cover with automated tests:

- **UI/UX**: Visual regressions, usability, and the "flash of content" issue.
- **RBAC**: Complex permission scenarios across different user roles.

### 4.2. Test Scenarios

| ID | Area | Role | Test Steps | Expected Result |
|---|---|---|---|---|
| **MAN-01** | Platform Admin | Unauthenticated | 1. Clear cookies. <br> 2. Navigate to `/admin`. | User is immediately redirected to `/login`. No admin content is ever visible. |
| **MAN-02** | Platform Admin | Workspace User | 1. Log in as a regular workspace user (`VIEWER`). <br> 2. Navigate to `/admin`. | User is redirected to `/login` or the workspace dashboard. No admin content is visible. |
| **MAN-03** | Workspace Admin | `ADMIN` | 1. Log in as an `ADMIN`. <br> 2. Navigate to `/acme-corp/admin/settings`. | The settings page is visible and functional. |
| **MAN-04** | Workspace Admin | `EDITOR` | 1. Log in as an `EDITOR`. <br> 2. Navigate to `/acme-corp/admin/settings`. | User is redirected to the staff dashboard (`/acme-corp/app`). |
| **MAN-05** | Surveys | `VIEWER` | 1. Log in as a `VIEWER`. <br> 2. Navigate to the Surveys page. <br> 3. Attempt to create or edit a survey. | User can view surveys, but all create/edit/delete buttons are disabled or hidden. |

## 5. Test Execution

### Automated Tests

Run all automated tests from the project root:

```bash
# Run all unit, integration, and E2E tests
pnpm test
```

### Manual Testing

Follow the scenarios outlined in Section 4.2, using different browser profiles or incognito windows to simulate different user roles and authentication states.

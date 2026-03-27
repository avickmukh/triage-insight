'''
# TriageInsight: End-to-End Testing Runbook

This document provides a complete guide to running the comprehensive end-to-end (E2E) test suites for the API, Worker, and Web applications.

## 1. Prerequisites

Ensure the following software is installed on your system:

| Software    | Minimum Version | Installation Guide                               |
| :---------- | :-------------- | :----------------------------------------------- |
| **Node.js** | `22.x`          | [nodejs.org](https://nodejs.org)                 |
| **pnpm**    | `9.x`           | [pnpm.io](https://pnpm.io/installation)          |
| **Docker**  | `20.10+`        | [docker.com](https://docs.docker.com/get-docker/) |

## 2. First-Time Setup

These steps only need to be performed once to initialize the test environment.

### Step 2.1: Install Dependencies

Install all monorepo dependencies using `pnpm`.

```bash
# Install all dependencies for all apps
pnpm install
```

### Step 2.2: Install Playwright Browsers

The web E2E tests use Playwright, which requires browser binaries to be downloaded.

```bash
# Install Chromium, Firefox, and WebKit for Playwright
pnpm --filter @triage-insight/web exec playwright install
```

## 3. Mocking Strategy

All E2E tests are designed to run **without any live services**. They do not require a running database, Redis instance, or valid OpenAI API key. All external dependencies are mocked at the service layer within the NestJS testing module or via Playwright's network interception, ensuring fast, reliable, and deterministic test runs.

-   **Database:** `PrismaService` is mocked. All database calls (`findUnique`, `create`, `update`, etc.) return predefined mock data.
-   **Queues:** Bull queues are mocked. `queue.add()` calls are asserted but no jobs are actually processed.
-   **AI Services:** `EmbeddingService`, `SentimentService`, and `ThemeNarrationService` are mocked to return predictable AI-generated content without making real OpenAI API calls.

## 4. Running the E2E Tests

All test commands should be run from the **root of the monorepo**.

### Running All Suites

To run all E2E tests for the API, Worker, and Web applications sequentially, use the root-level `test:e2e` script.

```bash
# Run all three test suites
pnpm test:e2e
```

### Running Individual Suites

You can also run the test suite for each application individually.

#### API Tests

Tests all `*.e2e-spec.ts` files in `apps/api/test`.

```bash
# Run only the API E2E tests
pnpm test:e2e:api
```

#### Worker Tests

Tests the `worker.e2e-spec.ts` file in `apps/worker/test`.

```bash
# Run only the Worker E2E tests
pnpm test:e2e:worker
```

#### Web (Playwright) Tests

Runs all Playwright tests in `apps/web/e2e`.

```bash
# Run only the Web E2E tests (headless)
pnpm test:e2e:web
```

### Running Web Tests in UI Mode

Playwright comes with a powerful UI mode for debugging tests.

```bash
# Run web tests with the Playwright UI
pnpm --filter @triage-insight/web run test:e2e:ui
```

### Viewing the Web Test Report

After running the web tests, you can view a detailed HTML report.

```bash
# Open the last Playwright test report
pnpm --filter @triage-insight/web run test:e2e:report
```
'''

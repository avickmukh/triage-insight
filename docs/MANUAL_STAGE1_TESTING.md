---
title: Manual E2E Testing Guide — Stage-1 Semantic Intelligence
author: Manus AI
date: 2026-03-27
---

## 1. Overview

This document provides a step-by-step guide for manually testing the complete Stage-1 Semantic Intelligence pipeline. This flow covers feedback ingestion, embedding generation, semantic clustering (theme creation), and duplicate suggestion.

The goal is to verify that when new feedback is created, it is correctly processed by the AI pipeline, resulting in the creation of themes and the identification of related feedback.

## 2. Prerequisites

Before starting, ensure the following components are running and correctly configured:

| Component | Configuration | Verification Command |
|---|---|---|
| **PostgreSQL** | Running with `pgvector` extension enabled | `psql -c 
SELECT 1 AS connected;"`
SELECT 1 AS connected;"` |
| **Redis** | Running and accessible | `redis-cli ping` (should return `PONG`) |
| **TriageInsight API** | Running locally | `curl http://localhost:3000/api/v1/health` |
| **TriageInsight Worker** | Running locally | `tail -f /tmp/worker.log` (should show active processors) |
| **OpenAI API Key** | Set in `apps/api/.env` | `echo $OPENAI_API_KEY` |

### Local Setup Commands

```bash
# Terminal 1: Start the API
cd apps/api
cp .env.example .env  # <-- Fill in DATABASE_URL, REDIS_HOST, OPENAI_API_KEY, JWT_SECRET
pnpm install
pnpm prisma migrate deploy
pnpm start:dev

# Terminal 2: Start the Worker
cd apps/worker
cp ../api/.env .       # <-- Use the same .env as the API
pnpm install
pnpm start:dev
```

## 3. Test Execution

This test uses a small, realistic dataset of feedback items with overlapping themes. The goal is to observe the system automatically creating themes and linking related items.

### Step 1: Create a Test Workspace and User

First, you need a workspace and a user to own the feedback. You can create these directly in the database or via the API if you have a signup endpoint.

```sql
-- Example: Create a workspace and user directly in PostgreSQL
INSERT INTO "Workspace" (id, name, slug) VALUES ('ws-test-stage1', 'Stage-1 Test Workspace', 'stage1-test');
INSERT INTO "User" (id, email, "workspaceId") VALUES ('user-test-stage1', 'tester@example.com', 'ws-test-stage1');
```

### Step 2: Ingest Sample Feedback

Use `curl` to send `POST` requests to the feedback creation endpoint (`/api/v1/feedback`). Send the following feedback items one by one. Replace `YOUR_JWT_TOKEN` with a valid token for the test user.

**Theme: WiFi & Network Issues**

```bash
# Feedback 1
curl -X POST http://localhost:3000/api/v1/feedback \
-H "Authorization: Bearer YOUR_JWT_TOKEN" -H "Content-Type: application/json" \
-d '{
  "title": "The WiFi connection is very unstable",
  "description": "My internet keeps disconnecting every 15 minutes. It makes it impossible to join video calls.",
  "source": "support-ticket",
  "workspaceId": "ws-test-stage1"
}'

# Feedback 2
curl -X POST http://localhost:3000/api/v1/feedback \
-H "Authorization: Bearer YOUR_JWT_TOKEN" -H "Content-Type: application/json" \
-d '{
  "title": "Cannot connect to the office network",
  "description": "Since the update last night, my laptop refuses to connect to the corporate WiFi.",
  "source": "slack",
  "workspaceId": "ws-test-stage1"
}'
```

**Theme: Dashboard Performance**

```bash
# Feedback 3
curl -X POST http://localhost:3000/api/v1/feedback \
-H "Authorization: Bearer YOUR_JWT_TOKEN" -H "Content-Type: application/json" \
-d '{
  "title": "The main dashboard is extremely slow to load",
  "description": "It takes over 30 seconds for the main analytics dashboard to appear. The loading spinner just goes on and on.",
  "source": "in-app-feedback",
  "workspaceId": "ws-test-stage1"
}'

# Feedback 4
curl -X POST http://localhost:3000/api/v1/feedback \
-H "Authorization: Bearer YOUR_JWT_TOKEN" -H "Content-Type: application/json" \
-d '{
  "title": "Dashboard widgets are lagging",
  "description": "When I change the date range filter, the charts take forever to update. It feels very sluggish.",
  "source": "support-ticket",
  "workspaceId": "ws-test-stage1"
}'
```

**Theme: Billing & Invoices**

```bash
# Feedback 5 (Near-duplicate of #6)
curl -X POST http://localhost:3000/api/v1/feedback \
-H "Authorization: Bearer YOUR_JWT_TOKEN" -H "Content-Type: application/json" \
-d '{
  "title": "I was charged twice for my subscription this month",
  "description": "My credit card statement shows two charges for the same amount on the same day. Please refund one.",
  "source": "email",
  "workspaceId": "ws-test-stage1"
}'

# Feedback 6 (Near-duplicate of #5)
curl -X POST http://localhost:3000/api/v1/feedback \
-H "Authorization: Bearer YOUR_JWT_TOKEN" -H "Content-Type: application/json" \
-d '{
  "title": "Why do I have a double charge on my invoice?",
  "description": "I just got my invoice and it looks like I was billed twice. Can someone look into this?",
  "source": "support-ticket",
  "workspaceId": "ws-test-stage1"
}'
```

## 4. Verification

After ingesting the feedback, monitor the worker logs and then query the database to verify the results.

### Step 1: Monitor Worker Logs

Check the worker logs (`/tmp/worker.log`) for job processing messages. You should see logs for the `ai-analysis` queue, indicating that jobs are being picked up and processed.

```
[Nest] 8 - 03/27/2026, 10:30:15 AM     LOG [AiAnalysisProcessor] Processing feedback fb-wifi-1 for workspace ws-test-stage1...
[Nest] 8 - 03/27/2026, 10:30:17 AM     LOG [AiAnalysisProcessor] Step 1/5: Generated embedding for feedback fb-wifi-1
[Nest] 8 - 03/27/2026, 10:30:17 AM     LOG [AiAnalysisProcessor] Step 2/5: Stored embedding for feedback fb-wifi-1
[Nest] 8 - 03/27/2026, 10:30:18 AM     LOG [AiAnalysisProcessor] Step 3/5: Assigned feedback fb-wifi-1 to new theme theme-wifi-issues
...
```

### Step 2: Verify Database State

Query the PostgreSQL database to confirm that the pipeline has run correctly.

**Check Embeddings:**

```sql
SELECT id, title, embedding IS NOT NULL AS has_embedding
FROM "Feedback"
WHERE "workspaceId" = 'ws-test-stage1';
```

*   **Expected:** All 6 feedback items should have `has_embedding` as `true`.

**Check Themes:**

```sql
SELECT name, status FROM "Theme" WHERE "workspaceId" = 'ws-test-stage1';
```

*   **Expected:** You should see approximately 3 themes created (e.g., "WiFi/Network Issues", "Dashboard Performance", "Billing Inquiries"). The names are generated by the AI and may vary slightly.

**Check Theme Assignments:**

```sql
SELECT f.title, t.name AS theme_name
FROM "Feedback" f
JOIN "_FeedbackToTheme" ftt ON f.id = ftt."A"
JOIN "Theme" t ON ftt."B" = t.id
WHERE f."workspaceId" = 'ws-test-stage1';
```

*   **Expected:** Each feedback item should be assigned to the correct semantic theme.
    *   "The WiFi connection is very unstable" → "WiFi/Network Issues"
    *   "Dashboard widgets are lagging" → "Dashboard Performance"

**Check Duplicate Suggestions:**

```sql
SELECT
  fs.title AS source_feedback,
  ft.title AS target_feedback,
  s.similarity, s.status
FROM "FeedbackDuplicateSuggestion" s
JOIN "Feedback" fs ON s."sourceId" = fs.id
JOIN "Feedback" ft ON s."targetId" = ft.id
WHERE fs."workspaceId" = 'ws-test-stage1';
```

*   **Expected:** You should see a `PENDING` suggestion linking "I was charged twice..." and "Why do I have a double charge...". The similarity score should be high (e.g., > 0.9).

## 5. Troubleshooting

| Issue | Possible Cause | Resolution |
|---|---|---|
| **No jobs in worker log** | API is not enqueueing jobs, or Redis is not connected. | Check API logs for errors. Verify `REDIS_HOST` and `REDIS_PORT` in `.env` files. |
| **Jobs fail in worker** | `OPENAI_API_KEY` is invalid or missing. `pgvector` is not enabled. | Check worker logs for specific error messages. Ensure the OpenAI key is correct and the `pgvector` extension is created in the database. |
| **Themes are not created** | Similarity threshold is too high, or embedding generation failed. | Check worker logs for embedding errors. The theme creation threshold can be tuned in `apps/api/src/ai/services/theme-clustering.service.ts`. |
| **No duplicate suggestions** | Similarity threshold for duplicates is too high. | The duplicate suggestion threshold can be tuned in `apps/api/src/ai/services/duplicate-detection.service.ts`. |

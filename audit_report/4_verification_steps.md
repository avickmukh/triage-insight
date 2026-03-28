## TriageInsight Pipeline: Verification Steps

Follow these steps to verify that the fixes have been successfully applied and the async job pipeline is healthy.

### 1. Install Updated Dependencies

First, install the node modules from the root of the monorepo. The `pnpm` package manager will automatically handle the workspace dependencies, ensuring the `worker` now uses the correct version of `@nestjs/bull`.

```bash
# From the project root: /home/ubuntu/triage-insight-audit
cd /home/ubuntu/triage-insight-audit

# Install all dependencies for all apps in the monorepo
pnpm install
```

### 2. Start API and Worker Processes

Run the API and the worker in separate terminals. Use the `dev` scripts to enable hot-reloading.

**Terminal 1: Start the API**
```bash
# From the project root
cd /home/ubuntu/triage-insight-audit

# Start the API server (defaults to port 3000)
pnpm run dev:api
```

**Terminal 2: Start the Worker**
```bash
# From the project root
cd /home/ubuntu/triage-insight-audit

# Start the worker process
pnpm run dev:worker
```

### 3. Verify Worker Startup and Logging

Check the output of the worker process in Terminal 2. You should see the new structured log message confirming that the global event listener has been attached to all queues.

**Expected Worker Log Output:**
```json
{"event":"QUEUE_LISTENERS_ATTACHED","queue_count":20,"level":"log"}
```

This confirms that the new `QueueEventsListener` is active.

### 4. Trigger a Job

To test the end-to-end flow, you can simulate the creation of a feedback item by sending a `POST` request to the API. This will enqueue a job to the `ai-analysis` queue. You will need a valid workspace ID and an authorization token.

*(Note: As I do not have access to valid credentials, this is a template command. You will need to substitute placeholders with actual data.)*

```bash
curl -X POST http://localhost:3000/feedback \
  -H "Authorization: Bearer <YOUR_AUTH_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
        "workspaceId": "<YOUR_WORKSPACE_ID>",
        "title": "Test feedback from audit",
        "source": "email",
        "sourceMeta": { "from": "test@example.com" }
      }'
```

### 5. Observe Job Processing in Worker Logs

Immediately after triggering the job, observe the logs in the worker terminal (Terminal 2). You should see a sequence of structured JSON logs for the job you just created, showing its lifecycle:

1.  **Job Active**: The worker picks up the job.
    ```json
    {"event":"QUEUE_ACTIVE","queue":"ai-analysis","job_id":"<some_id>","job_name":"__default__","attempt":1,"level":"log"}
    ```

2.  **Job Completed**: The processor finishes the job successfully.
    ```json
    {"event":"QUEUE_COMPLETED","queue":"ai-analysis","job_id":"<some_id>","job_name":"__default__","duration_ms":<some_duration>,"level":"log"}
    ```

The absence of any `Cannot define the same handler twice` errors and the presence of these `QUEUE_ACTIVE` and `QUEUE_COMPLETED` logs confirm that the core issue is resolved.

### 6. Verify Queue Health Endpoint

Finally, check the new queue health visibility endpoint. This endpoint provides a real-time snapshot of all queues.

```bash
curl http://localhost:3000/health/queues | jq
```

**Expected Health Endpoint Output:**

You should receive a `200 OK` response with a JSON body detailing the status of all 20 queues. The `overall` status should be `ok`.

```json
{
  "timestamp": "2025-03-28T13:00:00.000Z",
  "overall": "ok",
  "queues": [
    {
      "name": "ai-analysis",
      "waiting": 0,
      "active": 0,
      "completed": 1,
      "failed": 0,
      "delayed": 0,
      "paused": false,
      "status": "ok",
      "warnings": []
    },
    {
      "name": "ciq-scoring",
      "waiting": 0,
      ...
    }
    // ... 18 more queue reports
  ]
}
```

This successful sequence of verification steps confirms that the pipeline is fixed, stable, and fully observable.

## TriageInsight Pipeline: Changed Files

This document lists all files that were modified or created to resolve the queue processing issues and improve observability.

### I. Core Fixes

These changes address the root causes of the processing failure.

| File | Change Summary |
| :--- | :--- |
| `apps/worker/package.json` | **Upgraded `@nestjs/bull` from `^10.2.3` to `^11.0.4`**. This was the primary fix to eliminate the critical version mismatch with the `api` application. |
| `apps/api/src/ai/ai.module.ts` | Removed dead `BullModule` and unused queue constant imports. |
| `apps/api/src/theme/theme.module.ts` | Removed dead `BullModule` and unused queue constant imports. |
| `apps/api/src/voice/voice.module.ts` | Removed dead `BullModule`, unused processor/queue imports, and a stale comment. |
| `apps/api/src/customer/customer.module.ts` | Removed dead `BullModule`, unused queue constant imports, and a stale comment. |
| `apps/api/src/survey/survey.module.ts` | Removed dead `BullModule` and unused queue constant imports. |
| `apps/api/src/prioritization/prioritization.module.ts`| Removed dead `BullModule` and unused queue constant imports. |
| `apps/api/src/purge/purge.module.ts` | Removed dead `BullModule`, unused processor/queue imports, and a stale comment. |
| `apps/api/src/deal/deal.module.ts` | Removed dead `BullModule` and unused queue constant imports. |
| `apps/api/src/roadmap/roadmap.module.ts` | Removed dead `BullModule` and unused queue constant imports. |
| `apps/api/src/scheduler/scheduler.module.ts` | Removed dead `BullModule` and unused queue constant imports. |
| `apps/worker/src/processors.module.ts` | **Updated stale architectural comments**. The comments now correctly state that `QueueModule` is the single source of truth for queue registration, not the individual feature modules. |
| `apps/worker/src/worker.module.ts` | **Updated stale architectural comments**. The comments now correctly explain why `AiModule` is not imported directly and clarify that it does not register queues. |

### II. Observability and Logging Enhancements

These new files and modifications add comprehensive visibility into the health and activity of the queue system.

| File | Change Summary |
| :--- | :--- |
| `apps/api/src/health/queue-health.service.ts` | **(New File)** Created a new service that injects all 20 queues and provides a detailed health report including waiting, active, completed, failed, and delayed job counts for each. |
| `apps/api/src/health/queue-health.controller.ts` | **(New File)** Created a new controller to expose the `QueueHealthService` report at the unauthenticated `GET /health/queues` endpoint for monitoring. |
| `apps/api/src/health/health.module.ts` | **Modified** to import the new `QueueHealthController` and provide the `QueueHealthService`. |
| `apps/worker/src/queue-events.listener.ts` | **(New File)** Created a new global event listener for the worker. It attaches to all 20 queues and emits structured JSON logs for all key lifecycle events (`active`, `completed`, `failed`, `stalled`, etc.), providing full visibility into job flow without altering individual processors. |
| `apps/worker/src/worker.module.ts` | **Modified** to register the new `QueueEventsListener` as a provider, ensuring it is active in the worker process. |


# Stage-1 Semantic Intelligence Pipeline: Root Cause Analysis

**Date:** Mar 27, 2026
**Author:** Manus AI

## A) Root Cause Summary

The Stage-1 Semantic Intelligence pipeline is failing due to three distinct but related architectural wiring issues. The core problem is a systemic failure to register BullMQ job processors with the NestJS dependency injection (DI) container inside the `worker` application. This prevents the worker from consuming any jobs from the queues, effectively halting the entire AI pipeline after the initial job enqueue step.

1.  **Missing Processor Providers:** 15 out of 17 BullMQ processors across the entire application are not included in the `providers` array of their respective NestJS modules. While the `worker.module.ts` correctly imports these modules (e.g., `AiModule`, `ThemeModule`), the processors themselves are never instantiated or registered with the BullMQ engine because they are not declared as providers. The only correctly registered processor is `DashboardRefreshWorker`.

2.  **Incomplete Job Payload:** The primary `ai-analysis` job, which kicks off the entire Stage-1 pipeline, is enqueued with an incomplete data payload. The `FeedbackService` adds the job with only a `feedbackId`, but the `AiAnalysisProcessor` requires both `feedbackId` and `workspaceId` to function. This would cause a fatal runtime error inside the processor if it were being correctly consumed.

3.  **Missing Global Module in Worker:** The `CommonModule`, which provides the critical `JobIdempotencyService` used by every processor for safe retries and duplicate prevention, is not imported into the `worker.module.ts`. This would cause an immediate DI error on worker startup, as every processor has a dependency that cannot be resolved.

These issues are compounded by several queue name mismatches between processor-level constants and the centralized `QueueModule` definitions, which would cause further failures for specific queues even if the primary DI issues were resolved.

## B) Exact Broken Step in the Pipeline

The pipeline breaks at **Step 4: Worker Job Consumption**.

Here is a step-by-step trace showing the exact point of failure:

| Step | Action | File | Function | Status | Detail |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Feedback Submitted | `feedback.controller.ts` | `create()` | **Success** | The API receives the feedback data. |
| 2 | Feedback Persisted | `feedback.service.ts` | `create()` | **Success** | A new `Feedback` record is created in the PostgreSQL database. |
| 3 | Job Enqueued | `feedback.service.ts` | `create()` | **Partial Success** | A job with `{ feedbackId: ... }` is successfully added to the `ai-analysis` BullMQ queue in Redis. The `workspaceId` is missing. |
| 4 | **Worker Job Consumption** | `ai.module.ts` | (NestJS Bootstrap) | **FAILURE** | The `worker` application starts, but because `AiAnalysisProcessor` is not in the `providers` array of `AiModule`, no consumer is ever attached to the `ai-analysis` queue. |
| 5 | Job Stalls | (Redis) | (BullMQ) | **Stalled** | The job sits in the Redis queue indefinitely, waiting for a consumer that will never appear. |
| 6 | Embedding Generation | `analysis.processor.ts` | `handleAnalysis()` | **Never Reached** | The processor code is never executed. |
| 7 | Clustering & Dedup | `analysis.processor.ts` | `handleAnalysis()` | **Never Reached** | Subsequent pipeline steps are never initiated. |

## C) Exact Files Involved

The breakdown is caused by issues in the following files:

1.  **Job Payload Mismatch:**
    *   `apps/api/src/feedback/feedback.service.ts`: Enqueues the `ai-analysis` job without the required `workspaceId`.
    *   `apps/api/src/ai/processors/analysis.processor.ts`: Defines the job payload interface `AnalysisJobPayload` which requires `workspaceId`.

2.  **Missing Processor Providers (Systemic Issue):**
    *   `apps/api/src/ai/ai.module.ts`: Fails to provide `AiAnalysisProcessor` and `CiqScoringProcessor`.
    *   `apps/api/src/theme/theme.module.ts`: Fails to provide `ThemeClusteringProcessor`.
    *   *(And 10 other module files with the same issue for their respective processors)*

3.  **Missing Common Module:**
    *   `apps/worker/src/worker.module.ts`: Fails to import the `CommonModule`, which provides `JobIdempotencyService`.
    *   `apps/api/src/common/common.module.ts`: Defines and exports the `JobIdempotencyService`.

## D) What Must Be Fixed to Complete Stage-1

To fix the Stage-1 pipeline and align the codebase with its intended architecture, the following changes are required:

1.  **Correct the Job Payload:**
    *   In `apps/api/src/feedback/feedback.service.ts`, modify the `analysisQueue.add()` call to include the `workspaceId`:
        ```typescript
        // Change this:
        await this.analysisQueue.add({ feedbackId: newFeedback.id });

        // To this:
        await this.analysisQueue.add({ 
          feedbackId: newFeedback.id,
          workspaceId: workspaceId 
        });
        ```

2.  **Register the AI Processors:**
    *   In `apps/api/src/ai/ai.module.ts`, import the processor classes and add them to the `providers` array:
        ```typescript
        import { AiAnalysisProcessor } from './processors/analysis.processor';
        import { CiqScoringProcessor } from './processors/ciq-scoring.processor';

        @Module({
          // ... imports
          providers: [
            // ... existing services
            AiAnalysisProcessor, // <-- ADD THIS
            CiqScoringProcessor, // <-- ADD THIS
          ],
          // ... exports
        })
        ```

3.  **Register the Theme Clustering Processor:**
    *   In `apps/api/src/theme/theme.module.ts`, add `ThemeClusteringProcessor` to the `providers` array.

4.  **Provide Common Services to the Worker:**
    *   In `apps/worker/src/worker.module.ts`, import and add the `CommonModule`:
        ```typescript
        import { CommonModule } from '../../api/src/common/common.module';

        @Module({
          imports: [
            // ... existing imports
            CommonModule, // <-- ADD THIS
            AiModule,
            // ... other modules
          ],
        })
        ```

5.  **(Recommended) Register All Other Processors:** To prevent future pipeline failures, all 15 orphaned processors should be correctly added to the `providers` array in their corresponding modules.

## E) Problem Classification

This is purely an **Architecture Wiring** and **Configuration** problem.

*   **No business logic is broken.** The underlying services (`EmbeddingService`, `ThemeClusteringService`, `DuplicateDetectionService`) appear correct and would likely function as intended if they were called.
*   The issue lies entirely in the NestJS module configuration, where dependencies (processors) are not being correctly declared and provided to the DI container.
*   The incomplete job payload is also a wiring issue between the service that produces the job and the processor that consumes it.

Fixing these wiring issues should restore the end-to-end functionality of the Stage-1 Semantic Intelligence pipeline without any changes to the core algorithms or data models.

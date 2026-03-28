## TriageInsight Queue Flow Report

This document outlines the end-to-end data flow for asynchronous jobs within the TriageInsight platform, tracing the path from job creation (producer) to job execution (consumer). The system uses a centralized queue registration model, where all queues are defined in a single global module, and feature modules produce or consume jobs via dependency injection.

### 1. Centralized Queue and Redis Configuration

The foundation of the async pipeline is `QueueModule`, located at `apps/api/src/queue/queue.module.ts`. This module is critical to the architecture for two primary reasons:

*   **Redis Connection**: It establishes the single, application-wide connection to the Redis server using `BullModule.forRootAsync`. This ensures both the API (producers) and the worker (consumers) use the exact same Redis instance and configuration.
*   **Global Queue Registration**: It calls `BullModule.registerQueue()` for all 20 queues used in the application. By being marked as `@Global()`, the provider tokens for every queue (e.g., `BullQueue_ai-analysis`) are made available for injection anywhere in the application without needing to re-import `BullModule` or re-register queues.

### 2. Job Producers (API Process)

Job producers are typically NestJS services running within the `api` application. They inject a specific queue by its token and call the `.add()` method to enqueue a new job.

**Example Flow: `ai-analysis` job creation**

1.  **Trigger**: A user provides new feedback, which calls a method in `FeedbackService` (`apps/api/src/feedback/feedback.service.ts`).
2.  **Queue Injection**: `FeedbackService` injects the `ai-analysis` queue via its constructor:

    ```typescript
    constructor(
      @InjectQueue(QUEUE_NAMES.AI_ANALYSIS) private readonly analysisQueue: Queue,
      // ... other dependencies
    )
    ```

3.  **Job Enqueue**: The service method constructs a payload and adds it to the queue:

    ```typescript
    await this.analysisQueue.add(payload, { jobId: uniqueId });
    ```

At this point, the job is serialized and sent to the Redis server, where it waits in the `ai-analysis` queue.

### 3. Job Consumers (Worker Process)

Job consumers are `@Processor()` classes that run exclusively within the standalone `worker` application. The worker process bootstraps a separate NestJS application with a module graph optimized for background processing.

**Example Flow: `ai-analysis` job processing**

1.  **Worker Bootstrap**: The worker process starts via `apps/worker/src/main.ts`, which bootstraps `WorkerModule`.
2.  **Module Graph**: `WorkerModule` (`apps/worker/src/worker.module.ts`) imports all necessary modules:
    *   `QueueModule`: Provides the Redis connection and all queue injection tokens.
    *   `WorkerProcessorsModule`: The central module that imports all feature modules (e.g., `ThemeModule`, `AiModule`) and registers every `@Processor` class as a provider.
3.  **Processor Registration**: `WorkerProcessorsModule` (`apps/worker/src/processors.module.ts`) contains a definitive list of all processor classes in its `providers` array. This is the **only** place where processors are registered, ensuring they are singletons within the worker's dependency injection container.

    ```typescript
    // in WorkerProcessorsModule
    providers: [
      AiAnalysisProcessor,          // Handles 'ai-analysis' queue
      CiqScoringProcessor,          // Handles 'ciq-scoring' queue
      ThemeClusteringProcessor,     // Handles 'theme-clustering' queue
      // ... all other processors
    ]
    ```

4.  **Processor Definition**: The `AiAnalysisProcessor` (`apps/api/src/ai/processors/analysis.processor.ts`) is decorated with `@Processor()` to link it to its designated queue.

    ```typescript
    @Processor(QUEUE_NAMES.AI_ANALYSIS)
    export class AiAnalysisProcessor {
      // ...
    }
    ```

5.  **Job Handling**: When a job becomes available in the `ai-analysis` queue, the BullMQ client in the worker process picks it up and invokes the method decorated with `@Process()` within the `AiAnalysisProcessor` instance.

    ```typescript
    @Process()
    async handleAnalysis(job: Job<AnalysisJobPayload>) {
      // Job processing logic runs here
    }
    ```

### 4. Downstream Triggers

After a processor finishes its work, it can act as a producer for a downstream queue. For example, after `AiAnalysisProcessor` runs, it might enqueue a job for the `theme-clustering` queue.

This is achieved the same way as in the API: the processor injects the downstream queue's token and calls `.add()`.

This architecture ensures a clean separation of concerns: the API handles synchronous requests and enqueues background work, while the worker is solely responsible for processing that work. The shared `QueueModule` and common feature modules ensure consistency across both processes.

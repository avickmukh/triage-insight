## TriageInsight Pipeline: Root Cause Analysis

The investigation into the TriageInsight async feedback pipeline has identified two primary root causes for the job processing failures and the `"Cannot define the same handler twice __default__"` error.

### 1. Critical Version Mismatch of `@nestjs/bull`

The core of the problem was a critical version mismatch of the `@nestjs/bull` package between the two applications in the `pnpm` monorepo:

| Application | `package.json` Version | Resolved Version |
| :--- | :--- | :--- |
| `apps/api` | `^11.0.4` | `11.0.4` |
| `apps/worker` | `^10.2.3` | `10.2.3` |

This discrepancy, while seemingly minor, created a fundamental conflict in the NestJS dependency injection and module resolution system at runtime. The `worker` application's source code directly imports processor classes and modules from the `api` application's source tree. This resulted in a state where two different versions of the `@nestjs/bull` library were active simultaneously within the same running process.

**Conflict Mechanism:**

1.  **Worker Dependencies**: The `worker` process, upon startup, loaded its own dependencies, including `@nestjs/bull@10.2.3`.
2.  **API Source Imports**: The `worker`'s `WorkerProcessorsModule` imports processor classes (e.g., `AiAnalysisProcessor`) directly from the `apps/api/src/...` directory.
3.  **Decorator Mismatch**: These processor files, being part of the `api` project, resolved their decorator imports (`@Processor`, `@Process`) to the `api`'s installed version of `@nestjs/bull`, which was `11.0.4`.
4.  **Module Mismatch**: The `worker`'s root module (`WorkerModule`) imports `QueueModule` from the `api` project. This `QueueModule` uses `BullModule.registerQueue()` from version `11.0.4` to configure and provide all queue injection tokens.
5.  **Runtime Collision**: When the NestJS application inside the worker bootstrapped, the `BullExplorer` service (from the worker's v10 package) scanned the application for providers decorated with `@Processor`. However, the metadata attached to these processor classes was created by the decorators from the v11 package. This created an unstable state where the v10 `BullExplorer` was attempting to register handlers on queue instances that were created and managed by the v11 `BullModule`, leading directly to the `"Cannot define the same handler twice"` error as the internal state became corrupted.

### 2. Stale Code and Misleading Architectural Comments

A significant secondary issue was the presence of outdated code and comments across multiple feature modules. The architecture had clearly been refactored at some point to a centralized queue registration pattern in `QueueModule`. However, this refactoring was incomplete.

-   **Dead Imports**: Numerous feature modules (e.g., `AiModule`, `ThemeModule`, `VoiceModule`) still contained `import { BullModule } from '@nestjs/bull';` even though it was no longer used in their `@Module` definition.
-   **Incorrect Comments**: These same modules often had comments in their `imports` array suggesting they were responsible for registering their own queues, such as `// Register the CIQ queue so the extraction processor can trigger re-scoring`. This was factually incorrect, as `QueueModule` was handling all registrations.

This stale code created significant confusion during the audit, obscuring the true, centralized architecture and making it much harder to diagnose the underlying version mismatch problem. It created a false trail that suggested duplicate `registerQueue` calls were the issue, when the real problem was more subtle.

### Conclusion

The combination of a critical package version conflict and misleading, stale code created the perfect storm for this failure. The system was architecturally sound in its intent (centralized queue registration), but the execution was flawed due to the dependency schism. Jobs were enqueued successfully by the API (using v11) but could not be reliably processed by the worker because its v10 internals were incompatible with the v11-decorated processors and modules it was trying to consume.

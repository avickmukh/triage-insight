/**
 * WorkerProcessorsModule
 *
 * This is the ONLY place in the entire codebase where Bull @Processor()
 * classes are registered as NestJS providers.
 *
 * ── Key architectural rule ───────────────────────────────────────────────────
 * DO NOT add any BullModule.registerQueue() calls here.
 *
 * ALL queues are registered ONCE in QueueModule (apps/api/src/queue/queue.module.ts).
 * QueueModule is @Global() and is imported by WorkerModule, so every queue
 * token (BullQueue_<name>) is available throughout the DI graph without any
 * feature module needing to call BullModule.registerQueue().
 *
 * DO NOT call BullModule.registerQueue() anywhere other than QueueModule.
 * Doing so creates a second provider token for the same queue, causing Bull
 * to call Queue.setHandler() twice and throw:
 *   "Cannot define the same handler twice __default__"
 *
 * ── Why processors are not in the feature modules ───────────────────────────
 * Processors are worker-only runtime artefacts. The API process imports the
 * same feature modules but must never instantiate processors. Keeping
 * processors exclusively here ensures they are only registered in the worker.
 *
 * ── @Global() modules ───────────────────────────────────────────────────────
 * AiModule, PrismaModule, and CommonModule are @Global() and are imported by
 * WorkerModule (the root). Their exported providers (EmbeddingService,
 * PrismaService, etc.) are available everywhere without re-importing.
 * AiModule is intentionally NOT imported here — it is @Global() and already
 * loaded by WorkerModule via WorkerProcessorsModule → ThemeModule → AiModule.
 * Re-importing it here would cause NestJS to instantiate its providers twice.
 */

import { Module } from '@nestjs/common';

// ── Feature modules (provide services + queue tokens to processors) ───────────
// AiModule is intentionally excluded — it is @Global() and already loaded by
// WorkerModule. Re-importing it here would duplicate its queue registrations.
import { ThemeModule } from '../../api/src/theme/theme.module';
import { CustomerModule } from '../../api/src/customer/customer.module';
import { DigestModule } from '../../api/src/digest/digest.module';
import { IntegrationsModule } from '../../api/src/integrations/integrations.module';
import { PrioritizationModule } from '../../api/src/prioritization/prioritization.module';
import { PublicPortalModule } from '../../api/src/public/public-portal.module';
import { PurgeModule } from '../../api/src/purge/purge.module';
import { SupportModule } from '../../api/src/support/support.module';
import { SurveyModule } from '../../api/src/survey/survey.module';
import { VoiceModule } from '../../api/src/voice/voice.module';
import { DashboardModule } from '../../api/src/dashboard/dashboard.module';

// ── AI ───────────────────────────────────────────────────────────────────────
import { AiAnalysisProcessor } from '../../api/src/ai/processors/analysis.processor';
import { CiqScoringProcessor } from '../../api/src/ai/processors/ciq-scoring.processor';

// ── Theme ────────────────────────────────────────────────────────────────────
import { ThemeClusteringProcessor } from '../../api/src/theme/processors/theme-clustering.processor';
import { UnifiedAggregationProcessor } from '../../api/src/theme/processors/unified-aggregation.processor';

// ── Customer ─────────────────────────────────────────────────────────────────
import { CustomerRevenueSignalProcessor } from '../../api/src/customer/processors/customer-revenue-signal.processor';
import { CustomerSignalAggregationProcessor } from '../../api/src/customer/processors/customer-signal-aggregation.processor';

// ── Digest ───────────────────────────────────────────────────────────────────
import { DigestProcessor } from '../../api/src/digest/digest.processor';

// ── Integrations ─────────────────────────────────────────────────────────────
import { SlackIngestionProcessor } from '../../api/src/integrations/processors/slack-ingestion.processor';

// ── Prioritization ───────────────────────────────────────────────────────────
import { PrioritizationWorker } from '../../api/src/prioritization/workers/prioritization.worker';

// ── Public Portal ────────────────────────────────────────────────────────────
import { PortalSignalProcessor } from '../../api/src/public/processors/portal-signal.processor';

// ── Purge ────────────────────────────────────────────────────────────────────
import { PurgeWorker } from '../../api/src/purge/purge.worker';

// ── Support ──────────────────────────────────────────────────────────────────
import { SyncProcessor } from '../../api/src/support/processors/sync.processor';
import { ClusteringProcessor } from '../../api/src/support/processors/clustering.processor';
import { SpikeDetectionProcessor } from '../../api/src/support/processors/spike-detection.processor';
import { SentimentProcessor } from '../../api/src/support/processors/sentiment.processor';

// ── Survey ───────────────────────────────────────────────────────────────────
import { SurveyIntelligenceProcessor } from '../../api/src/survey/processors/survey-intelligence.processor';

// ── Voice ────────────────────────────────────────────────────────────────────
import { VoiceTranscriptionProcessor } from '../../api/src/voice/processors/voice-transcription.processor';
import { VoiceExtractionProcessor } from '../../api/src/voice/processors/voice-extraction.processor';

// ── Dashboard ────────────────────────────────────────────────────────────────
import { DashboardRefreshWorker } from '../../api/src/dashboard/workers/dashboard-refresh.worker';

@Module({
  imports: [
    // Feature modules supply the services that processors depend on.
    // Queue tokens (@InjectQueue) are resolved from QueueModule, which is
    // @Global() and imported by WorkerModule. DO NOT call
    // BullModule.registerQueue() here or in any feature module.
    ThemeModule,
    CustomerModule,
    DigestModule,
    IntegrationsModule,
    PrioritizationModule,
    PublicPortalModule,
    PurgeModule,
    SupportModule,
    SurveyModule,
    VoiceModule,
    DashboardModule,
  ],
  providers: [
    // ── Stage-1: Semantic Intelligence ───────────────────────────────────────
    AiAnalysisProcessor,          // ai-analysis      → embeddings, dedup, theme clustering
    CiqScoringProcessor,          // ciq-scoring       → priority score computation
    ThemeClusteringProcessor,     // theme-clustering  → theme assignment
    UnifiedAggregationProcessor,  // unified-aggregation → cross-source counts + insight
    // ── Customer signals ─────────────────────────────────────────────────────
    CustomerRevenueSignalProcessor,
    CustomerSignalAggregationProcessor,
    // ── Digest ───────────────────────────────────────────────────────────────
    DigestProcessor,
    // ── Integrations ─────────────────────────────────────────────────────────
    SlackIngestionProcessor,
    // ── Prioritization ───────────────────────────────────────────────────────
    PrioritizationWorker,
    // ── Public portal ────────────────────────────────────────────────────────
    PortalSignalProcessor,
    // ── Purge ────────────────────────────────────────────────────────────────
    PurgeWorker,
    // ── Support ──────────────────────────────────────────────────────────────
    SyncProcessor,
    ClusteringProcessor,
    SpikeDetectionProcessor,
    SentimentProcessor,
    // ── Survey ───────────────────────────────────────────────────────────────
    SurveyIntelligenceProcessor,
    // ── Voice ────────────────────────────────────────────────────────────────
    VoiceTranscriptionProcessor,
    VoiceExtractionProcessor,
    // ── Dashboard ────────────────────────────────────────────────────────────
    DashboardRefreshWorker,
  ],
})
export class WorkerProcessorsModule {}

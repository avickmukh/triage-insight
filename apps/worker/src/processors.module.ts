/**
 * WorkerProcessorsModule
 *
 * This is the ONLY place in the entire codebase where Bull @Processor()
 * classes are registered as NestJS providers.
 *
 * ── Key architectural rule ───────────────────────────────────────────────────
 * DO NOT add any BullModule.registerQueue() calls here.
 *
 * Every queue is already registered by the feature module that owns it
 * (e.g. ThemeModule registers AI_CLUSTERING_QUEUE, VoiceModule registers
 * VOICE_TRANSCRIPTION_QUEUE, etc.). Those feature modules are imported below,
 * so their queue tokens are already available in this module's DI scope.
 *
 * Adding BullModule.registerQueue({ name: X }) here when the feature module
 * that owns queue X is also imported here causes Bull to call
 * Queue.setHandler() twice for the same queue name, throwing:
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
 * AiModule is intentionally NOT imported here — it would re-register
 * AI_ANALYSIS_QUEUE and CIQ_SCORING_QUEUE a second time.
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
    // Feature modules supply both the services processors depend on AND the
    // Bull queue tokens (@InjectQueue tokens) that processors inject.
    // DO NOT add BullModule.registerQueue() here — the feature modules already
    // register their own queues. Adding them again causes Bull to crash with
    // "Cannot define the same handler twice __default__".
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
